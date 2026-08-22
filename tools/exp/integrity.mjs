/**
 * Integrity experiments: the invariants Notion cannot declare.
 *
 * The query workload showed that Lore's substrate can *answer* every question,
 * expensively. This file is about the other half of what a DBMS is for: refusing
 * writes that would make the answers wrong. Four invariants from
 * engines/schema.mjs are tested by trying to break them.
 *
 * Nothing here is a benchmark. Each experiment is a controlled write sequence
 * with a known-correct outcome, run against each arm, and the result is a count
 * of how many bad states survived.
 */

import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { loadVault } from '../../engines/notion.mjs'
import { ddl } from '../../engines/schema.mjs'
import { overlaps } from '../../engines/contract.mjs'

const NEG = -999999
const POS = 999999

/* ------------------------------------------------- 1. dangling provenance */

/**
 * INV-2: every fact's Source references a memory that exists.
 *
 * The vault archives a share of memories that facts already cite. In Notion the
 * relation property keeps the page id; nothing checks it at write time and
 * nothing complains at read time. A foreign key with ON DELETE RESTRICT refuses
 * the delete outright, so the state is unreachable.
 *
 * We measure the reachable damage: how many facts cite a source the store can no
 * longer return, and how many *distinct claims* therefore lose their provenance.
 */
export function danglingProvenance(vault) {
  const archived = new Set(vault.memories.filter((m) => m.archived).map((m) => m.memory_id))
  const citing = vault.facts.filter((f) => f.source_memory_id && archived.has(f.source_memory_id))

  // Notion: the relation still resolves to a page id; a query skips it, a direct
  // retrieve returns it flagged as trashed. Either way the pointer is live and
  // wrong, and only a client that checks notices.
  const notion = {
    danglingPointers: citing.length,
    detectedAtWriteTime: 0,
    refusedWrites: 0,
    note: 'Relation properties are not foreign keys. Archiving a page leaves every relation that points at it intact.',
  }

  // SQL: attempt the delete under a restricting foreign key.
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('CREATE TABLE memory (memory_id TEXT PRIMARY KEY)')
  db.exec('CREATE TABLE fact (fact_id TEXT PRIMARY KEY, source_memory_id TEXT REFERENCES memory(memory_id))')
  const im = db.prepare('INSERT INTO memory VALUES (?)')
  for (const m of vault.memories) im.run(m.memory_id)
  const iff = db.prepare('INSERT INTO fact VALUES (?, ?)')
  for (const f of vault.facts) iff.run(f.fact_id, f.source_memory_id ?? null)

  let refused = 0
  let deleted = 0
  const del = db.prepare('DELETE FROM memory WHERE memory_id = ?')
  for (const id of archived) {
    try { del.run(id); deleted++ } catch { refused++ }
  }
  const orphans = db.prepare(`
    SELECT COUNT(*) AS c FROM fact f
     WHERE f.source_memory_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM memory m WHERE m.memory_id = f.source_memory_id)`).get().c
  db.close()

  return {
    archivedMemories: archived.size,
    citedByFacts: citing.length,
    notion,
    sql: {
      refusedWrites: refused,
      allowedWrites: deleted,
      danglingPointers: orphans,
      note: 'ON DELETE RESTRICT. Every delete that would orphan a claim is refused at the point the delete is issued.',
    },
  }
}

/* -------------------------------------------- 2. concurrent topic-key upsert */

/**
 * INV-1: at most one memory per (topic_key, project set).
 *
 * Lore upserts a topic-keyed memory by reading the vault for a matching row and
 * then either creating or patching. Notion's API documents no ETag, no If-Match
 * and no conditional write, so the read and the write cannot be made atomic from
 * the client. Two agents interleaving produce either a duplicate row or a lost
 * revision, depending on where the interleave lands.
 *
 * We run the interleave explicitly rather than relying on real threads, because
 * a scheduler-dependent result is not a measurement. Every writer performs
 * read-then-write; the schedule places all reads before all writes for the
 * fraction `collisionRate` of rounds, which is the worst case the protocol
 * admits and the one the API gives no way to exclude.
 */
export function concurrentUpsert(vault, { writers = 8, rounds = 200, collisionRate = 1.0 } = {}) {
  const key = 'runbook/restart-payments-api'
  const projectId = vault.projects[0].project_id

  /* --- Notion: read-then-write with no compare-and-swap --- */
  const db = loadVault({ ...vault, memories: [], memoryTags: [], memoryProjects: [], memoryTopics: [] })
  let notionDuplicates = 0
  let notionLostUpdates = 0
  let notionApplied = 0

  for (let r = 0; r < rounds; r++) {
    const interleaved = r < rounds * collisionRate
    // Phase 1: every writer probes for an existing row.
    const probes = []
    for (let w = 0; w < writers; w++) {
      const found = db.queryDataSource('Memories', {
        filter: {
          and: [
            { property: 'Topic Key', rich_text: { equals: key } },
            { property: 'Project', relation: { contains: projectId } },
          ],
        },
        page_size: 100,
      })
      probes.push(found.results[0] ?? null)
      if (!interleaved) {
        // Serial schedule: this writer completes before the next one probes.
        applyNotionWrite(db, probes[w], key, projectId, w, r)
      }
    }
    if (interleaved) {
      const before = countKey(db, key)
      for (let w = 0; w < writers; w++) applyNotionWrite(db, probes[w], key, projectId, w, r)
      const after = countKey(db, key)
      // Every writer that probed empty created a row: after - before extra rows.
      const created = after - before
      if (created > 1) notionDuplicates += created - 1
      // Writers that probed the *same* existing row all patched it; only the last
      // revision survives.
      const patchers = probes.filter(Boolean).length
      if (patchers > 1) notionLostUpdates += patchers - 1
    }
    notionApplied += writers
  }

  /* --- SQL: a unique index turns the same protocol into an atomic upsert --- */
  const sq = new DatabaseSync(':memory:')
  sq.exec('CREATE TABLE memory (memory_id TEXT PRIMARY KEY, topic_key TEXT, project_id TEXT, revision_count INTEGER)')
  sq.exec('CREATE UNIQUE INDEX ux_topic_key ON memory (topic_key, project_id)')
  const upsert = sq.prepare(`
    INSERT INTO memory (memory_id, topic_key, project_id, revision_count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT (topic_key, project_id)
    DO UPDATE SET revision_count = revision_count + 1`)
  let sqlApplied = 0
  for (let r = 0; r < rounds; r++) {
    for (let w = 0; w < writers; w++) {
      upsert.run(`m_${r}_${w}`, key, projectId)
      sqlApplied++
    }
  }
  const sqlRows = sq.prepare('SELECT COUNT(*) AS c FROM memory WHERE topic_key = ?').get(key).c
  const sqlRevs = sq.prepare('SELECT revision_count AS c FROM memory WHERE topic_key = ?').get(key).c
  sq.close()

  return {
    writers,
    rounds,
    writesAttempted: notionApplied,
    notion: {
      rows: countKey(db, key),
      duplicateRows: notionDuplicates,
      lostUpdates: notionLostUpdates,
      lostUpdateRate: Number((notionLostUpdates / notionApplied).toFixed(4)),
      note: 'Read-then-write. The Data API documents no conditional write, so the window between the two cannot be closed from the client.',
    },
    sql: {
      rows: sqlRows,
      duplicateRows: sqlRows - 1,
      lostUpdates: sqlApplied - sqlRevs,
      lostUpdateRate: Number(((sqlApplied - sqlRevs) / sqlApplied).toFixed(4)),
      note: 'INSERT ... ON CONFLICT against a unique index. One statement, so there is no window.',
    },
  }
}

function countKey(db, key) {
  return db.queryAll('Memories', { filter: { property: 'Topic Key', rich_text: { equals: key } } }).length
}

function applyNotionWrite(db, probe, key, projectId, w, r) {
  if (probe) {
    db.updatePage(probe.id, { 'Revision Count': (probe.properties['Revision Count'] ?? 0) + 1 })
  } else {
    db.createPage('Memories', {
      __id: `up_${r}_${w}`,
      __title: 'Runbook: restart payments-api',
      Title: 'Runbook: restart payments-api',
      Kind: 'runbook',
      Source: 'manual',
      Status: 'informational',
      Author: `writer-${w}`,
      Agent: 'Claude Code',
      'Topic Key': key,
      'Revision Count': 1,
      Project: [projectId],
      Tags: [],
      Topic: [],
    }, 'body')
  }
}

/* ------------------------------------------------ 3. temporal exclusion */

/**
 * INV-3: one object per subject per functional predicate, per instant.
 *
 * The strongest result in the study, because it is not about cost at all. The
 * vault contains overlapping ownership intervals that an agent wrote without
 * reading the previous row. Notion accepts every one of them, and `lore
 * conflicts scan` exists precisely to find them afterwards.
 *
 * PostgreSQL refuses them at the point of writing, with an exclusion constraint
 * over a range type. We show this twice:
 *
 *  a) ADD CONSTRAINT against the vault as it stands — the engine declines to
 *     certify data written without it, and names the first conflicting key.
 *  b) A clean load with the constraint created first, inserting fact by fact.
 *     Every write that would create a contradiction is rejected. The count of
 *     rejections is the number of contradictions that would have entered the
 *     vault.
 */
export async function temporalExclusion(vault) {
  const functional = new Set(['owned_by', 'is_a', 'created_by'])
  const rows = vault.facts.filter((f) => functional.has(f.predicate) && f.subject_entity_id)

  // Ground truth, computed in plain JS so the engines are checked, not trusted.
  const groups = new Map()
  for (const f of rows) {
    const k = `${f.subject_entity_id}|${f.predicate}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(f)
  }
  let trueConflictPairs = 0
  const conflictKeys = new Set()
  for (const [k, g] of groups) {
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        if (g[i].object !== g[j].object && overlaps(g[i], g[j])) { trueConflictPairs++; conflictKeys.add(k) }
      }
    }
  }

  const validity = `int8range(COALESCE(valid_from, ${NEG}), COALESCE(valid_until, ${POS}), '[)')`

  /* (a) Try to add the constraint to the vault as written. */
  const addAfter = { created: false, error: null, detail: null }
  {
    const pg = new PGlite({ extensions: { btree_gist } })
    await pg.exec('SET client_min_messages = warning')
    await pg.exec(`CREATE TABLE fact (
      fact_id TEXT PRIMARY KEY, subject_entity_id TEXT, predicate TEXT,
      object TEXT, valid_from BIGINT, valid_until BIGINT)`)
    for (let i = 0; i < rows.length; i += 400) {
      const slice = rows.slice(i, i + 400)
      const vals = []
      const params = []
      let n = 1
      for (const f of slice) {
        vals.push(`($${n++},$${n++},$${n++},$${n++},$${n++},$${n++})`)
        params.push(f.fact_id, f.subject_entity_id, f.predicate, f.object, f.valid_from, f.valid_until)
      }
      await pg.query(`INSERT INTO fact VALUES ${vals.join(',')}`, params)
    }
    await pg.exec('CREATE EXTENSION IF NOT EXISTS btree_gist')
    try {
      await pg.exec(`ALTER TABLE fact ADD CONSTRAINT ex_validity
        EXCLUDE USING gist (subject_entity_id WITH =, predicate WITH =, ${validity} WITH &&)`)
      addAfter.created = true
    } catch (err) {
      addAfter.error = String(err.message ?? err).split('\n')[0]
      addAfter.detail = err.detail ?? null
    }
    await pg.close()
  }

  /* (b) Create the constraint first, then insert one fact at a time. */
  const pg = new PGlite({ extensions: { btree_gist } })
  await pg.exec('SET client_min_messages = warning')
  await pg.exec('CREATE EXTENSION IF NOT EXISTS btree_gist')
  await pg.exec(`CREATE TABLE fact (
    fact_id TEXT PRIMARY KEY, subject_entity_id TEXT, predicate TEXT,
    object TEXT, valid_from BIGINT, valid_until BIGINT)`)
  await pg.exec(`ALTER TABLE fact ADD CONSTRAINT ex_validity
    EXCLUDE USING gist (subject_entity_id WITH =, predicate WITH =, ${validity} WITH &&)`)

  let accepted = 0
  let rejected = 0
  const rejectedKeys = new Set()
  for (const f of rows) {
    try {
      await pg.query('INSERT INTO fact VALUES ($1,$2,$3,$4,$5,$6)',
        [f.fact_id, f.subject_entity_id, f.predicate, f.object, f.valid_from, f.valid_until])
      accepted++
    } catch {
      rejected++
      rejectedKeys.add(`${f.subject_entity_id}|${f.predicate}`)
    }
  }
  const held = (await pg.query('SELECT COUNT(*)::int AS c FROM fact')).rows[0].c
  await pg.close()

  return {
    functionalFacts: rows.length,
    trueConflictPairs,
    trueConflictKeys: conflictKeys.size,
    injectedOverlaps: vault.injected.overlappingIntervals.length,
    notion: {
      rejectedWrites: 0,
      contradictionsAdmitted: conflictKeys.size,
      detection: 'after the fact, by lore conflicts scan',
      note: 'A select property and two date properties. Nothing relates them, so nothing can constrain them.',
    },
    postgres: {
      addConstraintToExistingVault: addAfter,
      insertedUnderConstraint: { accepted, rejected, rowsHeld: held },
      rejectedKeys: rejectedKeys.size,
      detection: 'at the point of writing',
      note: 'EXCLUDE USING gist over int8range. The write that would create the contradiction is the write that fails.',
    },
  }
}

/* ------------------------------------------- 4. entity resolution / merge */

/**
 * INV-5: an alias belongs to exactly one entity.
 *
 * The vault introduces some services twice — once under their name and once
 * under their handle — because nothing stops two sessions from doing that. Each
 * duplicate claims the other's string as an alias, so the two rows are mutually
 * aliased and neither is canonical.
 *
 * Three things are measured:
 *   - how many facts end up attached to the non-canonical row;
 *   - whether an alias lookup recovers them (Lore's mitigation);
 *   - what a merge has to touch, and what a unique index would have prevented.
 */
export function entityResolution(vault) {
  const pairs = vault.injected.duplicateEntities
  const byId = new Map(vault.entities.map((e) => [e.entity_id, e]))

  let factsOnDuplicate = 0
  let factsOnCanonical = 0
  const splitSubjects = []
  for (const p of pairs) {
    const dup = vault.facts.filter((f) => f.subject_entity_id === p.duplicate || f.object_entity_id === p.duplicate)
    const can = vault.facts.filter((f) => f.subject_entity_id === p.canonical || f.object_entity_id === p.canonical)
    factsOnDuplicate += dup.length
    factsOnCanonical += can.length
    if (dup.length && can.length) {
      splitSubjects.push({
        canonical: byId.get(p.canonical)?.name,
        duplicate: byId.get(p.duplicate)?.name,
        onCanonical: can.length,
        onDuplicate: dup.length,
      })
    }
  }

  // Aliases claimed by more than one entity: the unique index that was not there.
  const aliasOwners = new Map()
  for (const a of vault.aliases) {
    if (!aliasOwners.has(a.alias)) aliasOwners.set(a.alias, new Set())
    aliasOwners.get(a.alias).add(a.entity_id)
  }
  const contestedAliases = [...aliasOwners.entries()].filter(([, s]) => s.size > 1)

  // Names claimed by more than one entity: the unique index on the title that
  // Notion cannot create.
  const nameOwners = new Map()
  for (const e of vault.entities) {
    const k = e.name.toLowerCase()
    if (!nameOwners.has(k)) nameOwners.set(k, new Set())
    nameOwners.get(k).add(e.entity_id)
  }
  const duplicateNames = [...nameOwners.entries()].filter(([, s]) => s.size > 1)

  // Stale subject strings: the BCNF violation, realised. A fact whose Subject
  // title does not match the Name of the entity its SubjectEntity points at.
  let staleSubjects = 0
  for (const f of vault.facts) {
    if (!f.subject_entity_id) continue
    const e = byId.get(f.subject_entity_id)
    if (e && e.name !== f.subject) staleSubjects++
  }

  // What a merge has to touch, per pair: every fact on either side, plus the
  // alias rows, plus the entity row itself. In Notion each is a page update.
  const mergeCost = pairs.map((p) => {
    const touched = vault.facts.filter((f) => f.subject_entity_id === p.duplicate || f.object_entity_id === p.duplicate).length
    const aliasRows = vault.aliases.filter((a) => a.entity_id === p.duplicate).length
    return touched + aliasRows + 1
  })

  return {
    duplicatePairs: pairs.length,
    entities: vault.entities.length,
    duplicateRate: Number((pairs.length / vault.entities.length).toFixed(4)),
    factsOnCanonical,
    factsOnDuplicate,
    splitSubjects: splitSubjects.length,
    splitExamples: splitSubjects.slice(0, 6),
    contestedAliases: contestedAliases.length,
    duplicateNames: duplicateNames.length,
    staleSubjectStrings: staleSubjects,
    staleSubjectRate: Number((staleSubjects / vault.facts.length).toFixed(4)),
    merge: {
      pageUpdatesPerMerge: mergeCost.length ? Number((mergeCost.reduce((a, b) => a + b, 0) / mergeCost.length).toFixed(2)) : 0,
      maxPageUpdates: Math.max(0, ...mergeCost),
      totalPageUpdates: mergeCost.reduce((a, b) => a + b, 0),
      sqlStatements: 3,
      note: 'In SQL a merge is three UPDATEs and a DELETE inside one transaction. In Notion it is one PATCH per affected page, non-atomic, at three requests per second.',
    },
  }
}

/* --------------------------------------- 5. restatement and update anomaly */

/**
 * The BCNF anomaly, measured.
 *
 * A fact is restated across several memories. When the fact changes, the
 * restatements do not: they are prose in page bodies, and nothing links a
 * correction to them. An agent retrieving memories therefore retrieves
 * statements of the old value alongside the new one, with no signal to prefer
 * either.
 *
 * We count, for every fact whose validity interval has closed, how many memories
 * still assert its object.
 */
export function updateAnomaly(vault) {
  const superseded = vault.facts.filter((f) => f.valid_until != null)
  const bodies = vault.memories.filter((m) => !m.archived)

  let stale = 0
  let checked = 0
  const perFact = []
  for (const f of superseded) {
    // A restatement is a memory whose body asserts this subject-object pair.
    const hits = bodies.filter((m) => m.body.includes(f.subject) && m.body.includes(f.object))
    checked++
    stale += hits.length
    if (hits.length) perFact.push(hits.length)
  }

  perFact.sort((a, b) => a - b)
  const p50 = perFact[Math.floor(perFact.length * 0.5)] ?? 0
  const p95 = perFact[Math.floor(perFact.length * 0.95)] ?? 0

  // How many of those stale memories would a top-k recall return? Lore's
  // wake-up hook and search both return a bounded list; if the stale
  // restatements outnumber k, the agent sees a majority of them.
  const k = 10
  const outnumbering = perFact.filter((n) => n >= k).length

  return {
    closedFacts: checked,
    staleRestatements: stale,
    meanPerClosedFact: checked ? Number((stale / checked).toFixed(3)) : 0,
    medianWhenPresent: p50,
    p95WhenPresent: p95,
    factsWhoseStaleCopiesFillTopK: outnumbering,
    restatementMean: vault.stats.restatementMean,
    restatementMax: vault.stats.restatementMax,
    note: 'A correction updates the Fact row. Nothing updates the prose that restated it.',
  }
}

/* ------------------------------------------------ 6. property limit checks */

/**
 * The documented size limits, applied to the vault. rich_text truncates at
 * 2 000 characters; a relation holds at most 100 pages. Neither is a problem at
 * this scale, and saying so is part of being fair: we report the headroom rather
 * than implying a wall that is not there.
 */
export function propertyLimits(vault) {
  const RICH_TEXT = 2000
  const RELATION = 100

  const bodyLens = vault.memories.map((m) => m.body.length).sort((a, b) => a - b)
  const overRichText = vault.memories.filter((m) => m.body.length > RICH_TEXT).length

  const relCounts = new Map()
  for (const mp of vault.memoryProjects) relCounts.set(mp.memory_id, (relCounts.get(mp.memory_id) ?? 0) + 1)
  const factsPerMemory = new Map()
  for (const f of vault.facts) {
    if (!f.source_memory_id) continue
    factsPerMemory.set(f.source_memory_id, (factsPerMemory.get(f.source_memory_id) ?? 0) + 1)
  }

  return {
    richTextLimit: RICH_TEXT,
    relationLimit: RELATION,
    longestBody: bodyLens[bodyLens.length - 1] ?? 0,
    medianBody: bodyLens[Math.floor(bodyLens.length / 2)] ?? 0,
    bodiesOverRichTextLimit: overRichText,
    maxRelationsPerMemory: Math.max(0, ...relCounts.values()),
    maxFactsPerSourceMemory: Math.max(0, ...factsPerMemory.values()),
    note: 'Bodies are page blocks, not rich_text properties, so the 2 000-character property limit does not bind them. It binds every property Lore stores as text.',
  }
}

/* ------------------------------------------- 7. alias resolution over-match */

/**
 * What the joined alias cell costs to read back.
 *
 * `Aliases` is one rich_text cell holding a `, `-joined list, so the only
 * server-side operator that reaches inside it is `contains` — a substring test
 * over the whole cell. Every entity whose cell merely contains the term as a
 * substring comes back, and the client re-splits each candidate and keeps the
 * exact tokens. Lore does precisely this.
 *
 * Correctness survives. What does not survive is the idea that the store
 * answered the question: the rows that came back and were thrown away crossed
 * the wire, and at a hundred rows per request they are round trips too. A
 * relation with a unique index on `alias` returns the one row and nothing else.
 */
export function aliasResolution(vault) {
  const cells = vault.entities.map((e) => ({ id: e.entity_id, raw: e.aliases_raw ?? '' }))
  const terms = [...new Set(vault.aliases.map((a) => a.alias))]

  let exactTotal = 0
  let candidateTotal = 0
  let overMatchedTotal = 0
  const worst = []

  for (const term of terms) {
    const needle = term.toLowerCase()
    let candidates = 0
    let exact = 0
    for (const c of cells) {
      if (!c.raw.toLowerCase().includes(needle)) continue
      candidates++
      const tokens = c.raw.split(/\s*,\s*/).map((t) => t.trim().toLowerCase()).filter(Boolean)
      if (tokens.includes(needle)) exact++
    }
    candidateTotal += candidates
    exactTotal += exact
    overMatchedTotal += candidates - exact
    if (candidates - exact > 0) worst.push({ term, candidates, exact, wasted: candidates - exact })
  }

  worst.sort((a, b) => b.wasted - a.wasted)

  // Aliases claimed by more than one entity. Lore states the invariant does not
  // hold: "aliases are deliberately not unique across entities."
  const owners = new Map()
  for (const a of vault.aliases) {
    if (!owners.has(a.alias)) owners.set(a.alias, new Set())
    owners.get(a.alias).add(a.entity_id)
  }
  const contested = [...owners.entries()].filter(([, s]) => s.size > 1)

  return {
    terms: terms.length,
    exactMatches: exactTotal,
    candidatesFetched: candidateTotal,
    rowsFetchedAndDiscarded: overMatchedTotal,
    overMatchRatio: exactTotal ? Number((candidateTotal / exactTotal).toFixed(3)) : 0,
    wastedShare: candidateTotal ? Number((overMatchedTotal / candidateTotal).toFixed(4)) : 0,
    worstTerms: worst.slice(0, 8),
    contestedAliases: contested.length,
    collidingInjected: vault.injected.collidingAliases.length,
    sql: {
      rowsFetched: exactTotal,
      note: 'SELECT entity_id FROM entity_alias WHERE alias = ?. With a unique index the planner returns one row and reads one page.',
    },
  }
}

/* ------------------------------------ 8. bitemporal reach: schema vs surface */

/**
 * Lore's Facts table carries four date columns: `Valid From` / `Valid Until`
 * (when the claim was true in the world) and `Observed At` / `Invalidated At`
 * (when the vault came to believe and to disbelieve it). Its own comment says
 * so: "Together they implement the bitemporal axis used for as-of recall."
 *
 * A bitemporal store answers three distinguishable questions. This function
 * counts how many rows in the vault make each of them non-trivial — that is, how
 * many rows would answer differently depending on which axis you asked about. A
 * schema that carries an axis nobody queries is carrying it for nothing, so the
 * number that matters is how often the two axes disagree.
 */
export function bitemporalReach(vault) {
  const withValid = vault.facts.filter((f) => f.valid_from != null)
  const closed = vault.facts.filter((f) => f.valid_until != null)

  // Rows where the world changed before the vault noticed.
  const lagged = closed.filter((f) => f.invalidated_at != null && f.invalidated_at > f.valid_until)
  const lags = lagged.map((f) => f.invalidated_at - f.valid_until).sort((a, b) => a - b)

  // Rows written down after they became true: the other half of the same gap.
  const observedLate = vault.facts.filter((f) => f.observed_at != null && f.valid_from != null && f.observed_at > f.valid_from)
  const obsLags = observedLate.map((f) => f.observed_at - f.valid_from).sort((a, b) => a - b)

  const pick = (xs, p) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor(xs.length * p))] : 0)

  /**
   * The disagreement set: pick a day D, and count facts whose answer to
   * "was this true on D" differs from "did we believe this on D". Every such
   * row is one an audit would get wrong if it used the wrong axis.
   */
  const probeDays = [120, 240, 360, 480]
  const disagreements = probeDays.map((day) => {
    let n = 0
    for (const f of vault.facts) {
      const trueThen = (f.valid_from ?? -1e9) <= day && day < (f.valid_until ?? 1e9)
      const believedThen = (f.observed_at ?? 1e9) <= day && day < (f.invalidated_at ?? 1e9)
      if (trueThen !== believedThen) n++
    }
    return { day, rowsWhereAxesDisagree: n, share: Number((n / vault.facts.length).toFixed(4)) }
  })

  return {
    facts: vault.facts.length,
    withValidTime: withValid.length,
    closedIntervals: closed.length,
    retractionsLaggingReality: lagged.length,
    lagDaysMedian: pick(lags, 0.5),
    lagDaysP95: pick(lags, 0.95),
    writtenDownAfterBecomingTrue: observedLate.length,
    observationLagMedian: pick(obsLags, 0.5),
    disagreements,
    note: 'The two axes disagree often enough that choosing between them is a correctness decision, not a formality.',
  }
}
