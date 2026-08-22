#!/usr/bin/env node
/**
 * Generate a synthetic Lore vault, world-first.
 *
 * WHY BACKWARDS
 *
 * Relevance labels chosen by looking at what a store returned are worthless: the
 * store gets to define what counts as right. So nothing here is labelled. A
 * world is generated first — services, people, teams, incidents, decisions — and
 * the facts are read off that world by construction. Memories are then
 * *rendered* from facts: several natural-language restatements of the same
 * triple, scattered across sessions and authors.
 *
 * The correct answer to "what is currently true about payments-api" is therefore
 * definitional. It is the set of facts the world generator emitted with an open
 * validity interval for that subject. No judgement is involved, and no engine
 * had any influence over it.
 *
 * THE SHAPE IS LORE'S, NOT OURS
 *
 * Every column written here exists in `src/notion/schema.ts` at commit 95c3558,
 * including the ones that make the vault awkward to query: `Aliases` as a single
 * `, `-joined cell, `SubjectKey` and `DedupKey` as materialised expressions, and
 * the four-column bitemporal block on Facts. Confidence scores are computed with
 * Lore's own algebra — seed by stance, bump by 0.05 of the remaining headroom on
 * each citation, halve on contradiction, decay at 0.99 per stale day after a
 * 60-day grace period.
 *
 * WHAT IS DELIBERATELY WRONG WITH THE VAULT
 *
 * A clean vault would prove nothing. Six defects are injected on purpose, and
 * each one is a state Lore's substrate cannot refuse:
 *
 *  1. DUPLICATE ENTITIES — the same service introduced twice by two sessions.
 *     Nothing gives a Notion title a unique index.
 *  2. UNCLOSED INTERVALS — a new owner asserted without closing the old one, so
 *     two facts claim the same subject and predicate over overlapping time.
 *  3. STALE SUBJECT STRINGS — facts whose `Subject` title no longer matches the
 *     `Name` of the entity their `SubjectEntity` relation points at. This is what
 *     `mergeEntities` leaves behind, because it moves relations and not titles.
 *  4. DANGLING PROVENANCE — memories archived after facts cite them.
 *  5. COLLIDING ALIASES — one entity's alias is a prefix of another's, so the
 *     `contains` filter that has to read the joined cell over-matches.
 *  6. DISTRACTORS — memories that name an identifier while asserting nothing.
 *
 * Every defect is recorded in `vault.injected` with its ground-truth extent, so
 * the paper reports detection rates rather than impressions.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PREDICATES, FUNCTIONAL_PREDICATES, CONFIDENCE_MODEL } from '../engines/schema.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'data', 'vault.json')

/* ------------------------------------------------------------------ random */

/** mulberry32. Seeded, so a capture run is reproducible from the seed alone. */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SEED = Number(process.env.VAULT_SEED ?? 20260822)
const rand = rng(SEED)
const pick = (xs) => xs[Math.floor(rand() * xs.length)]
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1))
const chance = (p) => rand() < p

/* ------------------------------- Lore's own normalisers, reimplemented ---- */

/** `SubjectKey`: lowercased and whitespace-collapsed. */
const computeSubjectKey = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim()

/** `DedupKey`: a hash over normalised subject, predicate and object. */
const computeDedupKey = (s, p, o) =>
  createHash('sha256').update(`${computeSubjectKey(s)}␟${p}␟${computeSubjectKey(o)}`).digest('hex').slice(0, 32)

/* ------------------------------------------------------------------- world */

const SCALE = Number(process.env.VAULT_SCALE ?? 5)

const N_SERVICES = Math.round(90 * SCALE)
const N_PEOPLE = Math.round(24 * SCALE)
const N_INCIDENTS = Math.round(40 * SCALE)
const N_DECISIONS = Math.round(56 * SCALE)
const N_SESSIONS = Math.round(320 * SCALE)
const DAYS = 540

const PROJECT_DEFS = [
  { name: 'Root', path: '.', type: 'project' },
  { name: 'Server', path: 'src/server', type: 'project' },
  { name: 'Auth', path: 'src/server/auth', type: 'project' },
  { name: 'Client', path: 'src/client', type: 'project' },
  { name: 'Ingest', path: 'services/ingest', type: 'project' },
  { name: 'Platform', path: 'services/platform', type: 'project' },
]

const TOPIC_NAMES = ['Retrieval', 'Schema', 'Deploys', 'On-call', 'Billing', 'Latency',
  'Auth flows', 'Migrations', 'Observability', 'Rate limits', 'Caching', 'Indexing']

const SERVICE_STEMS = ['payments', 'ledger', 'ingest', 'router', 'search', 'auth', 'billing',
  'notify', 'export', 'index', 'session', 'quota', 'webhook', 'digest', 'sync', 'render',
  'audit', 'schedule', 'archive', 'relay', 'vector', 'graph', 'stream', 'cache']
const SERVICE_SUFFIX = ['api', 'worker', 'gateway', 'store', 'daemon', 'svc', 'edge', 'queue']

const FIRST = ['Ada', 'Bo', 'Cara', 'Dev', 'Elif', 'Finn', 'Gita', 'Hal', 'Ines', 'Jae',
  'Kai', 'Lena', 'Milo', 'Nia', 'Omar', 'Pia', 'Quinn', 'Rhea', 'Sami', 'Tara', 'Uma',
  'Vik', 'Wren', 'Yuki']
const LAST = ['Ahuja', 'Bassi', 'Chen', 'Diaz', 'Eze', 'Ferro', 'Gupta', 'Haas', 'Ito',
  'Jain', 'Kaur', 'Lam', 'Moss', 'Nair', 'Okafor', 'Park', 'Qadir', 'Roy', 'Silva',
  'Tan', 'Ueda', 'Vega', 'Wu', 'Zhao']

const AGENTS = ['Claude Code', 'Codex', 'Cursor', 'OMP']

let seq = 0
const id = (prefix) => `${prefix}_${(seq++).toString(36).padStart(6, '0')}`

/* ---------------------------------------------------------------- builders */

const projects = PROJECT_DEFS.map((p) => ({
  project_id: id('prj'),
  name: p.name,
  type: p.type,
  path: p.path,
  status: 'active',
  description: `Scope rooted at ${p.path}`,
}))

const topics = []
for (const p of projects) {
  for (const t of TOPIC_NAMES.slice(0, int(3, 6))) {
    topics.push({ topic_id: id('top'), name: t, description: `${t} in ${p.name}`, project_id: p.project_id })
  }
}

const usedNames = new Set()
const services = []
for (let i = 0; i < N_SERVICES; i++) {
  // stem x suffix is a bounded pool; once exhausted, shard the name so the
  // generator stays total at any scale rather than spinning on a retry loop.
  let name = null
  for (let tries = 0; tries < 64 && name === null; tries++) {
    const cand = `${pick(SERVICE_STEMS)}-${pick(SERVICE_SUFFIX)}`
    if (!usedNames.has(cand)) name = cand
  }
  if (name === null) {
    let shard = 2
    for (;;) {
      const cand = `${pick(SERVICE_STEMS)}-${pick(SERVICE_SUFFIX)}-${shard}`
      if (!usedNames.has(cand)) { name = cand; break }
      shard++
    }
  }
  usedNames.add(name)
  services.push({
    key: name,
    name,
    handle: `SVC-${4000 + i * 7}`,
    kind: 'system',
    project: pick(projects).project_id,
  })
}

const people = []
for (let i = 0; i < N_PEOPLE; i++) {
  const nm = `${FIRST[i % FIRST.length]} ${LAST[(i * 5) % LAST.length]}`
  people.push({ key: `person:${nm}`, name: nm, handle: `@${nm.split(' ')[0].toLowerCase()}`, kind: 'person' })
}

const teams = ['Platform', 'Payments', 'Growth', 'Infra', 'Search', 'Trust'].map((t) => ({
  key: `team:${t}`, name: `${t} Team`, handle: t.toLowerCase(), kind: 'system',
}))

const incidents = []
for (let i = 0; i < N_INCIDENTS; i++) {
  incidents.push({
    key: `INC-${2400 + i * 3}`,
    name: `INC-${2400 + i * 3}`,
    handle: `incident-${2400 + i * 3}`,
    kind: 'task-id',
    day: int(20, DAYS - 20),
    service: pick(services).key,
  })
}

const decisions = []
for (let i = 0; i < N_DECISIONS; i++) {
  decisions.push({
    key: `ADR-${100 + i}`,
    name: `ADR-${100 + i}`,
    handle: `adr-${100 + i}`,
    kind: 'workflow',
    day: int(10, DAYS - 10),
    statement: null,
    memoryId: null,
    supersedesKey: null,
  })
}

const worldThings = [...services, ...people, ...teams, ...incidents, ...decisions]

/* ------------------------------------------------------------------- facts */

const facts = []
const factsOf = new Map()

function emitFact(f) {
  const row = {
    fact_id: id('fct'),
    subject: f.subject,
    predicate: f.predicate,
    object: f.object,
    valid_from: f.valid_from ?? null,
    valid_until: f.valid_until ?? null,
    // Transaction time. `observed_at` is stamped when the claim was written
    // down, which is not when it became true; `invalidated_at` is stamped when
    // the retraction was written, which is not when it stopped being true.
    observed_at: null,
    invalidated_at: null,
    invalidated_by: null,
    confidence: f.confidence ?? pick(['certain', 'certain', 'likely', 'speculative']),
    confidence_score: null,
    dedup_key: computeDedupKey(f.subject, f.predicate, f.object),
    subject_key: computeSubjectKey(f.subject),
    project_id: f.project_id ?? null,
    source_memory_id: null,
    subject_key_world: f.subject_key,
    object_key_world: f.object_key ?? null,
    subject_entity_id: null,
    object_entity_id: null,
    created_time: null,
    _renderable: f.renderable !== false,
  }
  facts.push(row)
  if (!factsOf.has(f.subject_key)) factsOf.set(f.subject_key, [])
  factsOf.get(f.subject_key).push(row.fact_id)
  return row
}

// Ownership history: the workhorse of the temporal experiment.
for (const s of services) {
  const changes = int(1, 3)
  let day = int(0, 60)
  for (let c = 0; c <= changes; c++) {
    const owner = pick(teams)
    const next = c === changes ? null : day + int(60, 180)
    emitFact({
      subject: s.name, subject_key: s.key,
      predicate: 'owned_by', object: owner.name, object_key: owner.key,
      valid_from: day, valid_until: next,
      project_id: s.project, confidence: 'certain',
    })
    if (next == null) break
    day = next
  }
  emitFact({
    subject: s.name, subject_key: s.key,
    predicate: 'is_a', object: 'HTTP service', valid_from: 0, valid_until: null,
    project_id: s.project, confidence: 'certain',
  })
  for (let d = 0; d < int(1, 4); d++) {
    const dep = pick(services)
    if (dep.key === s.key) continue
    emitFact({
      subject: s.name, subject_key: s.key,
      predicate: 'depends_on', object: dep.name, object_key: dep.key,
      valid_from: int(0, 200), valid_until: chance(0.25) ? int(240, DAYS) : null,
      project_id: s.project,
    })
  }
  if (chance(0.4)) {
    emitFact({
      subject: s.name, subject_key: s.key,
      predicate: 'uses', object: pick(['PostgreSQL 18', 'Redis 7', 'Kafka 3.7', 'S3', 'SQLite 3.53']),
      valid_from: int(0, 300), valid_until: null, project_id: s.project,
    })
  }
}

for (const p of people) {
  emitFact({ subject: p.name, subject_key: p.key, predicate: 'is_a', object: 'engineer', valid_from: 0, valid_until: null, confidence: 'certain' })
  if (chance(0.6)) {
    emitFact({ subject: p.name, subject_key: p.key, predicate: 'owned_by', object: pick(teams).name, valid_from: int(0, 120), valid_until: null })
  }
}

for (const inc of incidents) {
  const svc = services.find((s) => s.key === inc.service)
  emitFact({ subject: inc.name, subject_key: inc.key, predicate: 'is_a', object: 'incident', valid_from: inc.day, valid_until: null, confidence: 'certain' })
  emitFact({ subject: inc.name, subject_key: inc.key, predicate: 'related_to', object: svc.name, object_key: svc.key, valid_from: inc.day, valid_until: null })
  emitFact({ subject: inc.name, subject_key: inc.key, predicate: 'created_by', object: pick(people).name, valid_from: inc.day, valid_until: null })
}

/**
 * Decision chains. Lore records supersession twice — as a `supersedes_decision`
 * fact created by DecisionService, and as the `Supersedes` self-relation on the
 * Memories row. We build both, and the workload walks the relation, because that
 * is the transitive closure a recursive CTE exists for.
 */
const chainHeads = []
{
  const pool = decisions.slice()
  while (pool.length >= 2) {
    const len = Math.min(pool.length, int(2, 5))
    const chain = pool.splice(0, len)
    for (const d of chain) {
      d.statement = `Adopt ${pick(['append-only writes', 'per-operator tokens', 'a shared vault', 'rank fusion',
        'valid-time intervals', 'topic-keyed upserts', 'client-side joins', 'digest synthesis'])} for ${pick(services).name}`
      emitFact({
        subject: d.name, subject_key: d.key,
        predicate: 'is_a', object: 'decision', valid_from: d.day, valid_until: null, confidence: 'certain',
      })
    }
    for (let i = 1; i < chain.length; i++) {
      emitFact({
        subject: chain[i].name, subject_key: chain[i].key,
        predicate: 'supersedes_decision',
        object: chain[i - 1].name, object_key: chain[i - 1].key,
        valid_from: chain[i].day, valid_until: null, confidence: 'certain',
        renderable: false,
      })
      chain[i].supersedesKey = chain[i - 1].key
    }
    chainHeads.push({ head: chain[0].key, tail: chain[chain.length - 1].key, length: chain.length - 1 })
  }
}

/* ---------------------------------------------------------------- entities */

/**
 * Entities are the canonical handles. Most world things get exactly one row; a
 * share of services get two, introduced by different sessions — one under the
 * name and one under the handle. Aliases live in a single `, `-joined cell, and
 * a share of them are built so one is a prefix of another, so the `contains`
 * filter that has to read that cell over-matches.
 */
const DUPLICATE_RATE = 0.08
const COLLIDING_ALIAS_RATE = 0.12
const entities = []
const aliases = []            // the normalised projection: ground truth, not a vault table
const entityByKey = new Map()
const duplicatePairs = []
const collidingAliases = []

function addEntity(e, aliasList) {
  const row = { ...e, aliases_raw: aliasList.join(', ') }
  entities.push(row)
  for (const a of aliasList) aliases.push({ entity_id: e.entity_id, alias: a })
  return row
}

for (const w of worldThings) {
  const eid = id('ent')
  const aliasList = [w.handle]
  if (w.handle.startsWith('SVC-') && chance(COLLIDING_ALIAS_RATE)) {
    // A second alias that extends the first. A `contains` filter for the base
    // now matches this cell through the extended form as well.
    const extended = `${w.handle}-legacy`
    aliasList.push(extended)
    collidingAliases.push({ entity_id: eid, base: w.handle, extended })
  }
  const e = addEntity({
    entity_id: eid,
    name: w.name,
    kind: w.kind,
    description: `${w.kind} ${w.name}`,
    project_id: w.project ?? null,
    source_memory_id: null,
    created_time: null,
    _key: w.key,
    _canonical: true,
  }, aliasList)
  entityByKey.set(w.key, e.entity_id)

  if (w.handle.startsWith('SVC-') && chance(DUPLICATE_RATE)) {
    const dup = addEntity({
      entity_id: id('ent'),
      name: w.handle,                 // the same thing, recorded under its handle
      kind: w.kind,
      description: `${w.kind} ${w.handle}`,
      project_id: w.project ?? null,
      source_memory_id: null,
      created_time: null,
      _key: w.key,
      _canonical: false,
    }, [w.name])
    duplicatePairs.push({ canonical: e.entity_id, duplicate: dup.entity_id, key: w.key })
  }
}

for (const f of facts) {
  f.subject_entity_id = entityByKey.get(f.subject_key_world) ?? null
  f.object_entity_id = f.object_key_world ? (entityByKey.get(f.object_key_world) ?? null) : null
}

/** Defect 3: stale subject strings, the state a merge leaves behind. */
const staleSubjects = []
for (const pair of duplicatePairs) {
  for (const f of facts) {
    if (f.subject_key_world !== pair.key) continue
    if (chance(0.45)) {
      f.subject_entity_id = pair.duplicate
      staleSubjects.push(f.fact_id)
    }
  }
}

/** Defect 2: unclosed intervals. */
const overlapTruth = []
for (const s of services) {
  if (!chance(0.14)) continue
  const own = facts.filter((f) => f.subject_key_world === s.key && f.predicate === 'owned_by')
  if (!own.length) continue
  const target = pick(own)
  const other = pick(teams).name
  if (other === target.object) continue
  emitFact({
    subject: s.name, subject_key: s.key,
    predicate: 'owned_by', object: other,
    valid_from: (target.valid_from ?? 0) + int(5, 40),
    valid_until: target.valid_until == null ? null : target.valid_until + int(10, 60),
    project_id: s.project, confidence: 'likely',
  })
  overlapTruth.push(`${entityByKey.get(s.key)}|owned_by`)
}
for (const f of facts) {
  if (f.subject_entity_id == null) f.subject_entity_id = entityByKey.get(f.subject_key_world) ?? null
  if (f.object_entity_id == null && f.object_key_world) f.object_entity_id = entityByKey.get(f.object_key_world) ?? null
}

/* ---------------------------------------------------------------- memories */

const RENDER_TEMPLATES = {
  owned_by: [
    (s, o) => `${s} is owned by ${o} now. Paged them during the rollout and they picked it up.`,
    (s, o) => `Confirmed with the on-call rota: ${o} owns ${s}.`,
    (s, o) => `Handover done — ${s} moves to ${o} this sprint.`,
  ],
  is_a: [
    (s, o) => `${s} is ${/^[aeiou]/i.test(o) ? 'an' : 'a'} ${o}. Worth remembering when reading its logs.`,
    (s, o) => `Classifying ${s} as ${o} for the inventory sheet.`,
  ],
  depends_on: [
    (s, o) => `${s} depends on ${o}; when ${o} degrades, ${s} times out rather than failing fast.`,
    (s, o) => `Traced the call graph: ${s} calls ${o} on every write path.`,
    (s, o) => `Do not deploy ${o} without checking ${s} first — hard dependency.`,
  ],
  uses: [
    (s, o) => `${s} runs on ${o}. Version pinned in the deploy manifest.`,
    (s, o) => `Storage for ${s} is ${o}.`,
  ],
  related_to: [
    (s, o) => `${s} was raised against ${o}.`,
    (s, o) => `${s} and ${o} came up in the same postmortem.`,
  ],
  created_by: [
    (s, o) => `${s} was opened by ${o}.`,
    (s, o) => `${o} filed ${s} after the alert fired.`,
  ],
}

const DISTRACTOR_TEMPLATES = [
  (s) => `Checked ${s}, nothing unusual.`,
  (s) => `Skimmed the dashboard for ${s}; no action taken.`,
  (s) => `${s} came up in standup but we deferred it.`,
  (s) => `Left a comment on the ${s} thread, waiting on review.`,
  (s) => `Re-ran the ${s} job. Same as before.`,
]

const TITLE_STEMS = {
  owned_by: (s) => `Ownership of ${s}`,
  is_a: (s) => `What ${s} is`,
  depends_on: (s) => `${s} dependencies`,
  uses: (s) => `${s} runtime`,
  related_to: (s) => `${s} context`,
  created_by: (s) => `${s} origin`,
}

const memories = []
const memoryTags = []
const memoryProjects = []
const memoryTopics = []

const sessions = []
for (let i = 0; i < N_SESSIONS; i++) {
  sessions.push({
    session: `ses_${i.toString(36).padStart(4, '0')}`,
    day: int(0, DAYS),
    author: pick(people).name,
    agent: pick(AGENTS),
    project: pick(projects).project_id,
  })
}

const TAGS = ['auth', 'latency', 'oncall', 'schema', 'billing', 'infra', 'retrieval', 'migration', 'cost', 'security']

const mentionsByKey = new Map()
function noteMention(key, row) {
  if (!key) return
  if (!mentionsByKey.has(key)) mentionsByKey.set(key, [])
  mentionsByKey.get(key).push(row)
}

function addMemory(m) {
  const row = {
    memory_id: id('mem'),
    title: m.title,
    kind: m.kind,
    source: m.source,
    status: m.status ?? 'informational',
    task_state: m.task_state ?? null,
    author: m.author,
    agent: m.agent,
    session: m.session,
    topic_key: m.topic_key ?? null,
    revision_count: m.revision_count ?? 1,
    supersedes_id: null,        // filled once every decision memory exists
    body: m.body,
    created_time: m.day,
    last_edited_time: m.day,
    archived: false,
  }
  memories.push(row)
  memoryProjects.push({ memory_id: row.memory_id, project_id: m.project })
  if (m.topic_id) memoryTopics.push({ memory_id: row.memory_id, topic_id: m.topic_id })
  for (const t of m.tags ?? []) memoryTags.push({ memory_id: row.memory_id, tag: t })
  for (const k of m.about ?? []) noteMention(k, row)
  return row
}

const restatements = new Map()
for (const f of facts) {
  if (!f._renderable) continue
  const tpls = RENDER_TEMPLATES[f.predicate]
  if (!tpls) continue
  const n = 1 + Math.floor(rand() * rand() * 6) // skewed: mostly 1-2, occasionally many
  restatements.set(f.fact_id, n)
  for (let i = 0; i < n; i++) {
    const s = pick(sessions)
    const day = Math.max(0, Math.min(DAYS, (f.valid_from ?? 0) + int(0, 30)))
    const topic = pick(topics.filter((t) => t.project_id === s.project)) ?? pick(topics)
    const mem = addMemory({
      title: (TITLE_STEMS[f.predicate] ?? ((x) => x))(f.subject),
      kind: 'note',
      source: pick(['conversation', 'autosave_learning', 'conversation', 'manual']),
      author: s.author,
      agent: s.agent,
      session: s.session,
      day,
      project: s.project,
      topic_id: topic?.topic_id,
      tags: [pick(TAGS)],
      about: [f.subject_key_world, f.object_key_world].filter(Boolean),
      body: `${pick(tpls)(f.subject, f.object)} (session ${s.session})`,
    })
    if (i === 0) {
      f.source_memory_id = mem.memory_id
      f.created_time = day
      f.observed_at = day   // written down on the day the session ran
    }
  }
}

const DISTRACTOR_COUNT = Math.round(memories.length * 0.22)
for (let i = 0; i < DISTRACTOR_COUNT; i++) {
  const w = pick(worldThings)
  const w2 = pick(worldThings)
  const s = pick(sessions)
  addMemory({
    about: [w.key, w2.key],
    title: `Notes on ${w.name}`,
    kind: 'note',
    source: 'conversation',
    author: s.author,
    agent: s.agent,
    session: s.session,
    day: int(0, DAYS),
    project: s.project,
    tags: [pick(TAGS)],
    body: `${pick(DISTRACTOR_TEMPLATES)(w.name)} Also touched ${w2.name} briefly.`,
  })
}

for (const d of decisions) {
  const s = pick(sessions)
  const mem = addMemory({
    about: [d.key],
    title: `${d.name}: ${d.statement ?? 'decision'}`,
    kind: 'decision',
    source: 'manual',
    status: 'accepted',
    author: s.author,
    agent: s.agent,
    session: s.session,
    day: d.day,
    project: s.project,
    topic_key: `decision/${d.name.toLowerCase()}`,
    revision_count: int(1, 4),
    tags: ['schema'],
    body: `${d.statement}. Rationale: measured on the vault before and after; the alternative required a client-side join on every read.`,
  })
  d.memoryId = mem.memory_id
}

const memoryById = new Map(memories.map((m) => [m.memory_id, m]))
const decisionByKey = new Map(decisions.map((d) => [d.key, d]))
for (const d of decisions) {
  if (!d.supersedesKey) continue
  const prev = decisionByKey.get(d.supersedesKey)
  if (!prev?.memoryId) continue
  memoryById.get(d.memoryId).supersedes_id = prev.memoryId
  memoryById.get(prev.memoryId).status = 'superseded'
}

for (const inc of incidents) {
  const s = pick(sessions)
  addMemory({
    about: [inc.key, inc.service],
    title: `${inc.name} postmortem`,
    kind: pick(['incident', 'postmortem']),
    source: 'manual',
    author: s.author,
    agent: s.agent,
    session: s.session,
    day: inc.day + 1,
    project: s.project,
    topic_key: `incident/${inc.name.toLowerCase()}`,
    revision_count: int(1, 6),
    tags: ['oncall'],
    body: `${inc.name} affected ${inc.service}. Detection took 11 minutes; the alert fired on error rate, not latency.`,
  })
}
for (let i = 0; i < Math.round(70 * SCALE); i++) {
  const s = pick(sessions)
  const svc = pick(services)
  addMemory({
    about: [svc.key],
    title: `Runbook: restart ${svc.name}`,
    kind: pick(['runbook', 'policy', 'procedure']),
    source: 'manual',
    status: pick(['informational', 'accepted', 'proposed']),
    author: s.author,
    agent: s.agent,
    session: s.session,
    day: int(0, DAYS),
    project: s.project,
    topic_key: `runbook/restart-${svc.name}`,
    revision_count: int(1, 9),
    tags: ['infra'],
    body: `Drain traffic, wait for in-flight requests, restart ${svc.name}, verify the health endpoint.`,
  })
}
for (let i = 0; i < Math.round(120 * SCALE); i++) {
  const s = pick(sessions)
  const w = pick(worldThings)
  addMemory({
    about: [w.key],
    title: `Follow up on ${w.name}`,
    kind: 'task',
    source: 'conversation',
    task_state: pick(['open', 'in-progress', 'blocked', 'done', 'cancelled']),
    author: s.author,
    agent: s.agent,
    session: s.session,
    day: int(0, DAYS),
    project: s.project,
    tags: [pick(TAGS)],
    body: 'Open item raised in session. Close when the change lands.',
  })
}
for (let i = 0; i < Math.round(40 * SCALE); i++) {
  const s = pick(sessions)
  addMemory({
    title: `Digest for day ${int(0, DAYS)}`,
    kind: 'note',
    source: 'digest',
    author: s.author,
    agent: s.agent,
    session: s.session,
    day: int(0, DAYS),
    project: s.project,
    tags: ['retrieval'],
    body: 'Synthesised summary of the week: ownership changes, one incident, two decisions.',
  })
}

for (const e of entities) {
  const cands = mentionsByKey.get(e._key)
  const m = cands && cands.length ? pick(cands) : pick(memories)
  e.source_memory_id = m.memory_id
  e.created_time = m.created_time
}

/** Defect 4: dangling provenance. */
const danglingTruth = []
{
  const unique = [...new Set(facts.filter((f) => f.source_memory_id).map((f) => f.source_memory_id))]
  for (const mid of unique) {
    if (!chance(0.03)) continue
    const m = memoryById.get(mid)
    if (!m) continue
    m.archived = true
    danglingTruth.push(mid)
  }
}

/* -------------------------------------------------- transaction time + score */

/**
 * Close the transaction-time axis, then run Lore's confidence algebra.
 *
 * `invalidated_at` lags `valid_until` — the retraction is written down after the
 * world changed, which is the whole reason two time axes exist. `invalidated_by`
 * points at the memory that prompted it.
 */
const liveMemories = memories.filter((m) => !m.archived)
for (const f of facts) {
  if (f.created_time == null) f.created_time = f.valid_from ?? 0
  if (f.observed_at == null) f.observed_at = f.created_time
  if (f.valid_until != null) {
    f.invalidated_at = Math.min(DAYS, f.valid_until + int(0, 45))
    f.invalidated_by = pick(liveMemories).memory_id
  }
}

const citationCount = new Map()
for (const f of facts) citationCount.set(f.fact_id, restatements.get(f.fact_id) ?? 0)

const contradicted = new Set()
{
  const groups = new Map()
  for (const f of facts) {
    if (!FUNCTIONAL_PREDICATES.has(f.predicate) || !f.subject_entity_id) continue
    const k = `${f.subject_entity_id}|${f.predicate}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(f)
  }
  for (const g of groups.values()) {
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        const a = g[i]; const b = g[j]
        const af = a.valid_from ?? -Infinity; const au = a.valid_until ?? Infinity
        const bf = b.valid_from ?? -Infinity; const bu = b.valid_until ?? Infinity
        if (a.object !== b.object && af < bu && bf < au) { contradicted.add(a.fact_id); contradicted.add(b.fact_id) }
      }
    }
  }
}

/* Lore's algebra, literally: seed by stance, bump per citation, halve on
   contradiction, decay at 0.99 per stale day beyond a 60-day grace. */
const { seed, bumpRate, decrementFactor, decayRate, staleGraceDays } = CONFIDENCE_MODEL
for (const f of facts) {
  const cites = citationCount.get(f.fact_id) ?? 0
  let score = seed[f.confidence]
  for (let i = 0; i < cites; i++) score = score + (1 - score) * bumpRate
  if (contradicted.has(f.fact_id)) score = score * decrementFactor
  const staleDays = Math.max(0, (DAYS - (f.created_time ?? 0)) - staleGraceDays)
  score = score * Math.pow(decayRate, staleDays)
  f.confidence_score = Math.max(0, Math.min(1, Number(score.toFixed(6))))
  f._inputs = { cites, staleDays, contradicted: contradicted.has(f.fact_id) }
}

/* --------------------------------------------------------------- questions */

const PER_CLASS = Number(process.env.VAULT_QUERIES ?? 40)
const questions = []
let qn = 0
const q = (cls, extra) => questions.push({ id: `q${(qn++).toString().padStart(4, '0')}`, class: cls, ...extra })

const namedServices = services.filter((s) => factsOf.has(s.key))
for (let i = 0; i < PER_CLASS; i++) {
  const p = pick(projects)
  q('wake-up', { project_id: p.project_id, since: DAYS - 30, limit: 20, label: `recent in ${p.name}` })

  const s = pick(namedServices)
  q('ask-entity', { term: chance(0.4) ? s.handle : s.name, label: `everything about ${s.name}` })

  const day = int(60, DAYS - 30)
  const s2 = pick(namedServices)
  q('as-of', { term: s2.name, day, label: `${s2.name} as of day ${day}` })

  const s3 = pick(namedServices)
  q('current', { term: s3.name, label: `${s3.name} now` })

  q('provenance', { author: pick(people).name, predicate: pick(['owned_by', 'depends_on', 'is_a']), label: 'claims by author' })

  const p2 = pick(projects)
  q('aggregate', { project_id: p2.project_id, since: DAYS - 90, label: `memory kinds in ${p2.name}` })

  q('cross-db', { author: pick(people).name, label: 'facts about what an author introduced' })

  const term = pick(['timed out', 'health endpoint', 'error rate', 'call graph', 'deploy manifest',
    'on-call rota', 'in-flight requests', 'nothing unusual'])
  q('body-search', { term, label: `bodies mentioning "${term}"` })
}

q('conflict-scan', { label: 'contradictions across the vault' })

for (const c of chainHeads.slice(0, PER_CLASS)) {
  const head = decisionByKey.get(c.head)
  if (!head?.memoryId) continue
  q('supersession', { term: head.memoryId, label: `what replaced ${head.name}`, expectedLength: c.length })
}

/* ------------------------------------------------------------------ output */

const strip = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))

const vault = {
  meta: { seed: SEED, scale: SCALE, generatedAt: new Date().toISOString(), days: DAYS },
  projects,
  topics,
  memories,
  memoryTags,
  memoryProjects,
  memoryTopics,
  entities: entities.map((e) => ({ ...strip(e, ['_key', '_canonical']), canonical: e._canonical })),
  aliases,
  facts: facts.map((f) => ({ ...strip(f, ['_renderable', '_inputs', 'subject_key_world', 'object_key_world']), inputs: f._inputs })),
  injected: {
    duplicateEntities: duplicatePairs,
    staleSubjectFacts: staleSubjects,
    overlappingIntervals: [...new Set(overlapTruth)],
    danglingProvenance: danglingTruth,
    collidingAliases,
    distractorMemories: DISTRACTOR_COUNT,
  },
  chains: chainHeads,
  questions,
  stats: {
    projects: projects.length,
    topics: topics.length,
    memories: memories.length,
    archivedMemories: memories.filter((m) => m.archived).length,
    memoryTags: memoryTags.length,
    entities: entities.length,
    aliases: aliases.length,
    facts: facts.length,
    sessions: sessions.length,
    questions: questions.length,
    restatementMean: Number((([...restatements.values()].reduce((a, b) => a + b, 0)) / Math.max(1, restatements.size)).toFixed(3)),
    restatementMax: Math.max(0, ...restatements.values()),
    predicates: Object.fromEntries(
      [...new Set(facts.map((f) => f.predicate))].map((p) => [p, facts.filter((f) => f.predicate === p).length]),
    ),
    kinds: Object.fromEntries(
      [...new Set(memories.map((m) => m.kind))].map((k) => [k, memories.filter((m) => m.kind === k).length]),
    ),
    systemPredicateShare: Number((facts.filter((f) => PREDICATES.system.includes(f.predicate)).length / facts.length).toFixed(4)),
    openIntervals: facts.filter((f) => f.valid_until == null).length,
    closedIntervals: facts.filter((f) => f.valid_until != null).length,
    aliasCells: entities.filter((e) => e.aliases_raw).length,
    aliasesPerCell: Number((aliases.length / Math.max(1, entities.length)).toFixed(2)),
    bodyChars: memories.reduce((s, m) => s + m.body.length, 0),
    confidenceMean: Number((facts.reduce((s, f) => s + f.confidence_score, 0) / facts.length).toFixed(4)),
  },
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(vault))

console.log('vault generated')
for (const [k, v] of Object.entries(vault.stats)) {
  if (typeof v === 'object') continue
  console.log(`  ${k.padEnd(22)} ${v}`)
}
console.log('  injected defects:')
console.log(`    duplicate entities   ${duplicatePairs.length}`)
console.log(`    stale subject titles ${staleSubjects.length}`)
console.log(`    overlapping owners   ${vault.injected.overlappingIntervals.length}`)
console.log(`    dangling provenance  ${danglingTruth.length}`)
console.log(`    colliding aliases    ${collidingAliases.length}`)
console.log(`  -> ${OUT}`)
