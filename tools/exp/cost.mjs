/**
 * Cost experiments: what the wake-up hook costs, and where the ceiling is.
 *
 * Lore's wake-up hook runs before the first response of every session. It loads
 * "the latest digest, recent memories, active facts, and task-matched context".
 * That is four questions across three databases, and on the Data API each of
 * them is a filtered query returning at most a hundred rows per request.
 *
 * Two things are measured here, and they are different in kind.
 *
 *   ROUND TRIPS AND BYTES scale with the vault and are substrate-independent:
 *   they follow from the API's shape, not from anyone's network. The documented
 *   three-requests-per-second average then converts a round-trip count into a
 *   floor on wall-clock that no amount of bandwidth removes.
 *
 *   INJECTED TOKENS are what the context costs the model on every session start,
 *   before the user has said anything. This is the number that decides whether a
 *   memory system is affordable, and it is the same for every substrate — which
 *   is exactly why it is worth separating from the retrieval cost.
 */

import { loadVault } from '../../engines/notion.mjs'
import { buildSqlite } from '../../engines/sqlite.mjs'
import { rateLimitFloorMs, NOTION_RPS, NOTION_PAGE_MAX, timed } from '../../engines/contract.mjs'

/** ~4 characters per token for English prose. Labelled approximate everywhere it appears. */
const CHARS_PER_TOKEN = 4
const estTokens = (s) => Math.ceil(s.length / CHARS_PER_TOKEN)

/**
 * The wake-up payload, defined once so both arms build the same thing.
 * Recent memories, active facts for the project, open tasks, and the latest
 * digest. `limit` follows the shape of a hook that has to fit in a prompt.
 */
const WAKEUP = { recentMemories: 20, activeFacts: 30, openTasks: 10, digestWindowDays: 7 }

/**
 * Take a prefix of the vault and close it referentially, to simulate growth.
 *
 * Every foreign key has to be re-checked by hand: a fact points at four rows
 * (source memory, retracting memory, subject entity, object entity) and a memory
 * points at one (the memory it supersedes). Missing one is caught instantly by
 * the SQLite arm's foreign keys and by nothing else — the paper's argument
 * arriving, unannounced, inside the paper's own tooling. Twice.
 */
export function subsample(vault, fraction) {
  const nMem = Math.max(1, Math.round(vault.memories.length * fraction))
  const kept = vault.memories.slice(0, nMem)
  const keep = new Set(kept.map((m) => m.memory_id))
  const memories = kept.map((m) => ({
    ...m,
    supersedes_id: m.supersedes_id && keep.has(m.supersedes_id) ? m.supersedes_id : null,
  }))
  const entities = vault.entities.filter((e) => !e.source_memory_id || keep.has(e.source_memory_id))
  const entKeep = new Set(entities.map((e) => e.entity_id))
  const facts = vault.facts.filter((f) =>
    (!f.source_memory_id || keep.has(f.source_memory_id)) &&
    (!f.invalidated_by || keep.has(f.invalidated_by)) &&
    (!f.subject_entity_id || entKeep.has(f.subject_entity_id)) &&
    (!f.object_entity_id || entKeep.has(f.object_entity_id)))
  return {
    ...vault,
    memories,
    memoryTags: vault.memoryTags.filter((r) => keep.has(r.memory_id)),
    memoryProjects: vault.memoryProjects.filter((r) => keep.has(r.memory_id)),
    memoryTopics: vault.memoryTopics.filter((r) => keep.has(r.memory_id)),
    entities,
    aliases: vault.aliases.filter((a) => entKeep.has(a.entity_id)),
    facts,
  }
}

/** The four queries the hook issues, on the Data API. */
function wakeUpOnNotion(db, projectId, todayDay) {
  db.reset()

  // 1. the latest digest in the window
  db.queryDataSource('Memories', {
    filter: {
      and: [
        { property: 'Project', relation: { contains: projectId } },
        { property: 'Source', select: { equals: 'digest' } },
        { timestamp: 'created_time', date: { on_or_after: todayDay - WAKEUP.digestWindowDays } },
      ],
    },
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    page_size: 1,
  })

  // 2. recent memories
  const recent = db.queryDataSource('Memories', {
    filter: { property: 'Project', relation: { contains: projectId } },
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    page_size: WAKEUP.recentMemories,
  })

  // 3. active facts. The rows come back with properties only; the *text* the
  //    model needs is a page body, so each memory the hook wants to quote is a
  //    second request.
  const facts = db.queryDataSource('Facts', {
    filter: {
      and: [
        { property: 'Project', relation: { contains: projectId } },
        { property: 'Valid Until', date: { is_empty: true } },
      ],
    },
    sorts: [{ property: 'Confidence Score', direction: 'descending' }],
    page_size: WAKEUP.activeFacts,
  })

  // 4. open tasks
  const tasks = db.queryDataSource('Memories', {
    filter: {
      and: [
        { property: 'Project', relation: { contains: projectId } },
        { property: 'Kind', select: { equals: 'task' } },
        { property: 'Status', select: { does_not_equal: 'deprecated' } },
      ],
    },
    page_size: WAKEUP.openTasks,
  })

  // 5. bodies for the memories that will actually be quoted.
  let text = ''
  for (const m of recent.results) {
    const body = db.retrieveBlockChildren(m.id)
    text += `${m.properties.Title}\n${body ?? ''}\n`
  }
  for (const f of facts.results) {
    text += `${f.properties.Subject} ${f.properties.Predicate} ${f.properties.Object}\n`
  }
  for (const t of tasks.results) {
    text += `TODO ${t.properties.Title}\n`
  }

  return { ledger: { ...db.ledger }, text }
}

/** The same payload, in SQL. */
function wakeUpOnSql(db, projectId, todayDay) {
  const rows = []
  let statements = 0

  const digest = db.prepare(`
    SELECT m.title, m.body FROM memory m
      JOIN memory_project mp ON mp.memory_id = m.memory_id
     WHERE mp.project_id = ? AND m.source = 'digest' AND m.archived = 0
       AND m.created_time >= ?
     ORDER BY m.created_time DESC LIMIT 1`).all(projectId, todayDay - WAKEUP.digestWindowDays)
  statements++

  const recent = db.prepare(`
    SELECT m.title, m.body FROM memory m
      JOIN memory_project mp ON mp.memory_id = m.memory_id
     WHERE mp.project_id = ? AND m.archived = 0
     ORDER BY m.created_time DESC, m.memory_id LIMIT ?`).all(projectId, WAKEUP.recentMemories)
  statements++

  const facts = db.prepare(`
    SELECT subject, predicate, object FROM fact
     WHERE project_id = ? AND valid_until IS NULL
     ORDER BY confidence_score DESC LIMIT ?`).all(projectId, WAKEUP.activeFacts)
  statements++

  const tasks = db.prepare(`
    SELECT m.title FROM memory m
      JOIN memory_project mp ON mp.memory_id = m.memory_id
     WHERE mp.project_id = ? AND m.kind = 'task' AND m.status <> 'deprecated' AND m.archived = 0
     LIMIT ?`).all(projectId, WAKEUP.openTasks)
  statements++

  let text = ''
  for (const d of digest) text += `${d.title}\n${d.body}\n`
  for (const m of recent) text += `${m.title}\n${m.body}\n`
  for (const f of facts) text += `${f.subject} ${f.predicate} ${f.object}\n`
  for (const t of tasks) text += `TODO ${t.title}\n`
  rows.push(digest.length, recent.length, facts.length, tasks.length)

  return { statements, text, rows: rows.reduce((a, b) => a + b, 0) }
}

/**
 * Run the hook against growing vaults.
 *
 * The payload the model receives is capped by construction — twenty memories,
 * thirty facts — so the injected token count is roughly flat. The *cost of
 * assembling it* is not, because the queries that produce it scan a growing
 * store. Separating those two is the point of this experiment: the reason a
 * memory system gets slow is not that the prompt got bigger.
 */
export async function wakeUpScaling(vault, fractions = [0.125, 0.25, 0.5, 1]) {
  const out = []
  const projectId = vault.projects[1]?.project_id ?? vault.projects[0].project_id
  const today = vault.meta.days

  for (const fr of fractions) {
    const v = subsample(vault, fr)
    const ndb = loadVault(v)
    const n = wakeUpOnNotion(ndb, projectId, today)

    const sdb = buildSqlite(v, { constraints: true, indexes: true, fts: true })
    const s = wakeUpOnSql(sdb, projectId, today)
    const t = await timed(() => wakeUpOnSql(sdb, projectId, today), 9)
    sdb.close()

    out.push({
      fraction: fr,
      memories: v.memories.length,
      facts: v.facts.length,
      notion: {
        roundTrips: n.ledger.roundTrips,
        bytesIn: n.ledger.bytesIn,
        rateLimitFloorMs: Math.round(rateLimitFloorMs(n.ledger.roundTrips)),
        injectedChars: n.text.length,
        injectedTokensApprox: estTokens(n.text),
      },
      sqlite: {
        statements: s.statements,
        ms: Number(t.ms.toFixed(3)),
        injectedChars: s.text.length,
        injectedTokensApprox: estTokens(s.text),
      },
    })
  }
  return { config: WAKEUP, rps: NOTION_RPS, points: out }
}

/**
 * The body-search ceiling.
 *
 * `lore search <query>` has to reach the text of a memory. Notion's search
 * endpoint matches titles; property filters cannot see page blocks. So the only
 * complete way to search bodies through the documented API is to enumerate the
 * memories and fetch each one's children.
 *
 * This function reports what that costs at the vault's current size and what it
 * would cost at ten and a hundred times that size, using the same arithmetic:
 * one query per hundred rows plus one children request per row.
 */
export function searchCeiling(vault) {
  const n = vault.memories.filter((m) => !m.archived).length
  const bytes = vault.memories.reduce((s, m) => s + m.body.length, 0)

  const model = (rows, bytesTotal) => {
    const listRequests = Math.ceil(rows / NOTION_PAGE_MAX)
    const bodyRequests = rows
    const total = listRequests + bodyRequests
    return {
      rows,
      listRequests,
      bodyRequests,
      totalRequests: total,
      floorSeconds: Number((total / NOTION_RPS).toFixed(1)),
      floorMinutes: Number((total / NOTION_RPS / 60).toFixed(1)),
      bytesTransferred: bytesTotal,
    }
  }

  const perRow = n ? bytes / n : 0
  return {
    titleOnly: {
      requests: 1,
      note: 'What the search endpoint actually does. It matches titles, so it finds a memory only when the answer is already in its name.',
    },
    now: model(n, bytes),
    x10: model(n * 10, Math.round(perRow * n * 10)),
    x100: model(n * 100, Math.round(perRow * n * 100)),
    invertedIndex: {
      requests: 1,
      note: 'One statement against a GIN or FTS5 index over the same text.',
    },
  }
}

/**
 * Storage. Not a headline result, but worth stating plainly: what does a vault
 * cost as rows, and what does the same content cost as relations?
 */
export function storageProfile(vault) {
  const jsonBytes = (o) => Buffer.byteLength(JSON.stringify(o), 'utf8')
  const bodies = vault.memories.reduce((s, m) => s + Buffer.byteLength(m.body, 'utf8'), 0)
  const propertiesOnly = vault.memories.reduce((s, m) => {
    const { body, ...rest } = m
    return s + jsonBytes(rest)
  }, 0)
  return {
    memories: vault.memories.length,
    bodyBytes: bodies,
    memoryPropertyBytes: propertiesOnly,
    factBytes: jsonBytes(vault.facts),
    entityBytes: jsonBytes(vault.entities),
    bytesPerMemory: Math.round((bodies + propertiesOnly) / Math.max(1, vault.memories.length)),
    bytesPerFact: Math.round(jsonBytes(vault.facts) / Math.max(1, vault.facts.length)),
    note: 'Bodies dominate. A memory is mostly the sentence somebody wrote, which is why an inverted index over bodies is the index that matters and the one the substrate does not offer.',
  }
}
