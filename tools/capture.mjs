#!/usr/bin/env node
/**
 * The measurement harness. It produces the entire dataset the paper reads from.
 *
 * One rule governs this file: no number in the paper is typed by a human. Prose,
 * tables and charts all read `data/capture.json`, so the text and the evidence
 * cannot drift apart. If a claim in the paper has a number in it, that number
 * came from here.
 *
 * A second rule governs what gets recorded: every arm answers every question,
 * and the answer is scored against an oracle that no arm can see. Cost is
 * recorded separately from correctness, because the finding of this study is
 * that they come apart — the Notion arm is *correct* on the whole workload and
 * pays between one and four orders of magnitude more to be correct.
 */

import { writeFileSync, readFileSync, mkdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cpus, totalmem, platform, arch } from 'node:os'
import { execSync } from 'node:child_process'

import {
  QUESTION_CLASSES, CLASS_BY_ID, oracle, scoreSet, timed, mean, percentile,
  rateLimitFloorMs, NOTION_RPS, NOTION_PAGE_DEFAULT, NOTION_PAGE_MAX,
} from '../engines/contract.mjs'
import { build, ARMS, FAMILIES } from '../engines/index.mjs'
import {
  ENTITIES, RELATIONSHIPS, NORMALIZATION, FDS, INVARIANTS, PREDICATES,
  SECONDARY_INDEXES, VAULT_DATABASES, ddl, extraConstraints, NOTION_TYPES,
  SOURCE, PROPERTY_COUNTS, CONFIDENCE_MODEL, SCAN_CAPS, FUNCTIONAL_PREDICATES,
  AGENT_WRITABLE,
} from '../engines/schema.mjs'
import {
  danglingProvenance, concurrentUpsert, temporalExclusion, entityResolution,
  updateAnomaly, propertyLimits, aliasResolution, bitemporalReach,
} from './exp/integrity.mjs'
import { wakeUpScaling, searchCeiling, storageProfile } from './exp/cost.mjs'
import { fullTextSemantics } from './exp/fulltext.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const VAULT = join(ROOT, 'data', 'vault.json')
const OUT = join(ROOT, 'data', 'capture.json')
/* The web app imports the dataset at build time, and a Next.js app can only
   import from inside its own directory. So the file lives in two places, and the
   harness writes both — because the one thing worse than a duplicated artifact
   is a duplicated artifact that drifts, and a paper whose prose and whose tables
   were built from different measurements would be exactly that. */
const OUT_WEB = join(ROOT, 'web', 'data', 'capture.json')

const t0 = Date.now()
const log = (...a) => console.log(...a)

log('reading vault ...')
const vault = JSON.parse(readFileSync(VAULT, 'utf8'))
log(`  ${vault.stats.memories} memories, ${vault.stats.facts} facts, ${vault.stats.entities} entities`)

/* ------------------------------------------------------------ ground truth */

log('computing ground truth ...')
const truth = new Map()
for (const q of vault.questions) truth.set(q.id, oracle(vault, q))
const emptyAnswers = [...truth.values()].filter((a) => a.length === 0).length
log(`  ${truth.size} answers, ${emptyAnswers} of them empty`)

/* -------------------------------------------------------------- the arms */

const arms = build(ARMS)
const armReports = []

for (const arm of arms) {
  log(`loading ${arm.id} ...`)
  const loaded = await timed(() => arm.load(vault), 1)
  armReports.push({
    id: arm.id,
    family: arm.family,
    label: arm.label,
    blurb: arm.blurb,
    emulated: arm.emulated,
    loadMs: Number(loaded.ms.toFixed(1)),
    loadInfo: loaded.value,
  })
}

/* ------------------------------------------------------------ the workload */

const RUNS = Number(process.env.CAPTURE_RUNS ?? 3)
const results = [] // one row per (arm, question)

for (const arm of arms) {
  log(`running workload on ${arm.id} ...`)
  let n = 0
  for (const q of vault.questions) {
    const expected = truth.get(q.id)
    // Emulated arms are timed once — a timing through an emulator measures our
    // own JavaScript, not Notion, so it is recorded and never reported.
    const runs = arm.emulated ? 1 : RUNS
    const r = await timed(() => arm.ask(q), runs)
    const score = scoreSet(r.value.ids, expected)
    results.push({
      arm: arm.id,
      q: q.id,
      class: q.class,
      ms: Number(r.ms.toFixed(4)),
      expected: expected.length,
      returned: r.value.ids.length,
      ...score,
      roundTrips: r.value.ledger.roundTrips,
      bytesIn: r.value.ledger.bytesIn,
      bytesOut: r.value.ledger.bytesOut,
      rowsReturned: r.value.ledger.rowsReturned,
      rowsClientSide: r.value.ledger.rowsClientSide,
      unsupported: r.value.ledger.unsupported,
    })
    if (++n % 60 === 0) log(`    ${n}/${vault.questions.length}`)
  }
}

/* ------------------------------------------------------------ aggregation */

function agg(rows) {
  if (!rows.length) return null
  const rt = rows.map((r) => r.roundTrips)
  return {
    n: rows.length,
    f1: Number(mean(rows.map((r) => r.f1)).toFixed(4)),
    exact: Number(mean(rows.map((r) => r.exact)).toFixed(4)),
    precision: Number(mean(rows.map((r) => r.p)).toFixed(4)),
    recall: Number(mean(rows.map((r) => r.r)).toFixed(4)),
    roundTrips: Number(mean(rt).toFixed(2)),
    roundTripsMedian: percentile(rt, 50),
    roundTripsP95: percentile(rt, 95),
    roundTripsMax: Math.max(...rt),
    bytesIn: Math.round(mean(rows.map((r) => r.bytesIn))),
    rowsClientSide: Number(mean(rows.map((r) => r.rowsClientSide)).toFixed(1)),
    rateLimitFloorMs: Math.round(rateLimitFloorMs(mean(rt))),
    ms: Number(percentile(rows.map((r) => r.ms), 50).toFixed(4)),
  }
}

const byArm = {}
const byArmClass = {}
for (const arm of arms) {
  const rows = results.filter((r) => r.arm === arm.id)
  byArm[arm.id] = agg(rows)
  byArmClass[arm.id] = {}
  for (const c of QUESTION_CLASSES) {
    byArmClass[arm.id][c.id] = agg(rows.filter((r) => r.class === c.id))
  }
}

/* The headline ratio: how much more work the substrate Lore ships on has to do. */
const amplification = {}
for (const c of QUESTION_CLASSES) {
  const n = byArmClass.notion[c.id]
  const s = byArmClass.sqlite[c.id]
  if (!n || !s) continue
  amplification[c.id] = {
    roundTrips: Number((n.roundTrips / Math.max(1, s.roundTrips)).toFixed(1)),
    bytesIn: Number((n.bytesIn / Math.max(1, s.bytesIn)).toFixed(1)),
    rowsClientSide: n.rowsClientSide,
    notionRoundTrips: n.roundTrips,
    sqlStatements: s.roundTrips,
    notionFloorSeconds: Number((rateLimitFloorMs(n.roundTrips) / 1000).toFixed(2)),
  }
}

/* Expressibility: what share of the workload the Data API can state as a query. */
const expressibility = (() => {
  const counts = { expressible: 0, partial: 0, 'client-side join': 0, 'not expressible': 0 }
  const instances = { expressible: 0, partial: 0, 'client-side join': 0, 'not expressible': 0 }
  for (const c of QUESTION_CLASSES) {
    counts[c.notion] += 1
    instances[c.notion] += vault.questions.filter((q) => q.class === c.id).length
  }
  const total = vault.questions.length
  return {
    byClass: counts,
    byInstance: instances,
    classes: QUESTION_CLASSES.length,
    instances: total,
    shareNeedingMoreThanFilter: Number(
      ((instances.partial + instances['client-side join'] + instances['not expressible']) / total).toFixed(4),
    ),
    shareNeedingJoin: Number(
      (vault.questions.filter((q) => CLASS_BY_ID[q.class].needsJoin).length / total).toFixed(4),
    ),
    shareNeedingAggregate: Number(
      (vault.questions.filter((q) => CLASS_BY_ID[q.class].needsAggregate).length / total).toFixed(4),
    ),
    shareNeedingRecursion: Number(
      (vault.questions.filter((q) => CLASS_BY_ID[q.class].needsRecursion).length / total).toFixed(4),
    ),
  }
})()

/* ------------------------------------------------------------ experiments */

log('integrity: dangling provenance ...')
const dangling = danglingProvenance(vault)

log('integrity: concurrent topic-key upsert ...')
const concurrency = concurrentUpsert(vault, { writers: 8, rounds: 200, collisionRate: 1 })
const concurrencySweep = [2, 4, 8, 16].map((w) => {
  const r = concurrentUpsert(vault, { writers: w, rounds: 50, collisionRate: 1 })
  return { writers: w, notionLostUpdateRate: r.notion.lostUpdateRate, notionDuplicateRows: r.notion.duplicateRows, sqlLostUpdateRate: r.sql.lostUpdateRate }
})

log('integrity: temporal exclusion constraint ...')
const temporal = await temporalExclusion(vault)

log('integrity: entity resolution ...')
const resolution = entityResolution(vault)

log('integrity: update anomaly ...')
const anomaly = updateAnomaly(vault)

log('integrity: alias resolution ...')
const alias = aliasResolution(vault)

log('temporal: bitemporal reach ...')
const bitemporal = bitemporalReach(vault)

log('retrieval: full-text semantics ...')
const searchTerms = [...new Set(vault.questions.filter((x) => x.class === 'body-search').map((x) => x.term))]
const fulltext = await fullTextSemantics(vault, searchTerms)

log('cost: wake-up scaling ...')
const wakeup = await wakeUpScaling(vault)

log('cost: search ceiling ...')
const ceiling = searchCeiling(vault)
const storage = storageProfile(vault)
const limits = propertyLimits(vault)

/* Query plans, so §6 can show that the engine chose an index rather than
   assert that it did. */
log('collecting query plans ...')
const plans = {}
{
  const sample = {}
  for (const c of QUESTION_CLASSES) {
    sample[c.id] = vault.questions.find((q) => q.class === c.id)
  }
  for (const arm of arms) {
    if (!arm.explain) continue
    plans[arm.id] = {}
    for (const [cls, q] of Object.entries(sample)) {
      if (!q) continue
      try {
        plans[arm.id][cls] = await arm.explain(q)
      } catch (err) {
        plans[arm.id][cls] = { error: String(err.message ?? err).split('\n')[0] }
      }
    }
  }
}

for (const arm of arms) await arm.close()

/* --------------------------------------------------------------- assembly */

function toolchain() {
  const out = { node: process.version }
  try {
    const p = JSON.parse(readFileSync(join(ROOT, 'node_modules', '@electric-sql', 'pglite', 'package.json'), 'utf8'))
    out.pglite = p.version
  } catch { out.pglite = null }
  // SQLite ships inside Node as `node:sqlite`; there is no separate version to
  // report beyond the runtime's own.
  out.sqlite = `node:sqlite (bundled with ${process.version})`
  try {
    out.commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim()
  } catch { out.commit = null }
  return out
}

const capture = {
  capturedAt: new Date().toISOString(),
  durationMs: Date.now() - t0,
  machine: {
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model ?? 'unknown',
    cores: cpus().length,
    memoryGb: Number((totalmem() / 1024 ** 3).toFixed(1)),
  },
  toolchain: toolchain(),
  runs: RUNS,

  /* The subject of the study, recorded so the paper can cite exactly what it read. */
  subject: {
    name: 'Lore',
    repo: 'https://github.com/makenotion/lore',
    vendor: 'Notion',
    license: 'MIT',
    substrate: 'Notion Data API',
    databases: VAULT_DATABASES,
    predicates: PREDICATES,
    surfaces: ['MCP server', 'CLI', 'lifecycle hooks'],
  },

  /* The documented API constraints the emulator enforces, each with its source. */
  apiLimits: {
    pageSizeDefault: NOTION_PAGE_DEFAULT,
    pageSizeMax: NOTION_PAGE_MAX,
    requestsPerSecond: NOTION_RPS,
    richTextChars: 2000,
    relationPages: 100,
    multiSelectOptions: 100,
    payloadBytes: 500 * 1024,
    blocksPerRequest: 1000,
    searchMatches: 'titles only',
    conditionalWrites: 'none documented',
    joins: 'not offered',
    aggregates: 'not offered',
    sources: {
      pagination: 'https://developers.notion.com/reference/intro',
      requestLimits: 'https://developers.notion.com/reference/request-limits',
      query: 'https://developers.notion.com/reference/post-database-query',
      search: 'https://developers.notion.com/reference/post-search',
    },
  },

  vault: vault.stats,
  vaultMeta: vault.meta,
  injected: vault.injected,

  schema: {
    entities: ENTITIES,
    relationships: RELATIONSHIPS,
    normalization: NORMALIZATION,
    fds: FDS,
    invariants: INVARIANTS,
    indexes: SECONDARY_INDEXES,
    notionTypes: NOTION_TYPES,
    source: SOURCE,
    propertyCounts: PROPERTY_COUNTS,
    confidenceModel: CONFIDENCE_MODEL,
    scanCaps: SCAN_CAPS,
    functionalPredicates: [...FUNCTIONAL_PREDICATES],
    agentWritablePredicates: AGENT_WRITABLE,
    ddl: { sqlite: ddl('sqlite'), postgres: ddl('postgres') },
    extraConstraints: { sqlite: extraConstraints('sqlite'), postgres: extraConstraints('postgres') },
  },

  workload: {
    classes: QUESTION_CLASSES,
    instances: vault.questions.length,
    perClass: Object.fromEntries(
      QUESTION_CLASSES.map((c) => [c.id, vault.questions.filter((q) => q.class === c.id).length]),
    ),
    emptyAnswers,
  },

  families: FAMILIES,
  arms: armReports,
  byArm,
  byArmClass,
  amplification,
  expressibility,
  plans,

  experiments: {
    dangling,
    concurrency,
    concurrencySweep,
    temporal,
    resolution,
    anomaly,
    alias,
    bitemporal,
    fulltext,
    wakeup,
    ceiling,
    storage,
    limits,
  },

  /* Every raw row, so a reader can recompute any aggregate above. */
  rows: results,
}

const serialised = JSON.stringify(capture)
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, serialised)
mkdirSync(dirname(OUT_WEB), { recursive: true })
writeFileSync(OUT_WEB, serialised)

/* ------------------------------------------------------------------ report */

log('')
log(`captured in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
log('')
log('arm            exact   f1     round trips   bytes in   client rows')
for (const arm of arms) {
  const a = byArm[arm.id]
  log(
    `${arm.id.padEnd(16)}${a.exact.toFixed(3)}  ${a.f1.toFixed(3)}  ` +
    `${String(a.roundTrips).padStart(11)}  ${String(a.bytesIn).padStart(9)}  ${String(a.rowsClientSide).padStart(11)}`,
  )
}
log('')
log('class            notion RT   sql RT   amplification   floor (s)')
for (const c of QUESTION_CLASSES) {
  const a = amplification[c.id]
  if (!a) continue
  log(
    `${c.id.padEnd(17)}${String(a.notionRoundTrips).padStart(9)}${String(a.sqlStatements).padStart(9)}` +
    `${String(a.roundTrips + '×').padStart(16)}${String(a.notionFloorSeconds).padStart(12)}`,
  )
}
log('')
log(`concurrency   notion lost updates ${(concurrency.notion.lostUpdateRate * 100).toFixed(1)}%  duplicates ${concurrency.notion.duplicateRows}`)
log(`              sql    lost updates ${(concurrency.sql.lostUpdateRate * 100).toFixed(1)}%  duplicates ${concurrency.sql.duplicateRows}`)
log(`temporal      conflicts admitted ${temporal.notion.contradictionsAdmitted}, postgres rejected ${temporal.postgres.insertedUnderConstraint.rejected} writes`)
log(`resolution    ${resolution.duplicatePairs} duplicate entities, ${resolution.staleSubjectStrings} stale subject titles (${(resolution.staleSubjectRate * 100).toFixed(1)}%)`)
log(`anomaly       ${anomaly.staleRestatements} stale restatements over ${anomaly.closedFacts} closed facts`)
log(`aliases       ${alias.candidatesFetched} rows fetched for ${alias.exactMatches} exact matches (${(alias.wastedShare * 100).toFixed(1)}% discarded)`)
log(`bitemporal    ${bitemporal.retractionsLaggingReality} retractions lag reality, median ${bitemporal.lagDaysMedian} days`)
log(`search floor  ${ceiling.now.totalRequests} requests, ${ceiling.now.floorMinutes} min at ${NOTION_RPS} req/s`)
log(`full text     ${fulltext.termsWhereIndexesDisagree}/${fulltext.termsTotal} terms where FTS5 and GIN disagree`)
log('')
log(`wrote ${OUT} (${(statSync(OUT).size / 1024 / 1024).toFixed(2)} MB)`)
log(`wrote ${OUT_WEB}`)
