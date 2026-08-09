/**
 * Corpus generator for the agent-memory benchmark.
 *
 * The whole benchmark rests on having ground truth that is not circular. If we
 * wrote memories first and then decided which ones "look relevant" to a query,
 * every retrieval score would be an opinion. So we go the other way:
 *
 *   1. Build a world of ENTITIES (services, incidents, config keys, people...).
 *   2. Derive FACTS about them as (subject, predicate, object) triples with a
 *      validity interval. A fact is the unit of truth.
 *   3. Render each fact into 1..R MEMORIES — natural-language restatements an
 *      agent would plausibly have written, scattered across sessions and turns,
 *      in different surface forms.
 *   4. Generate QUERIES that ask about a known fact under a known predicate.
 *
 * Ground truth for a query is then definitional: the relevant memories are
 * exactly the memories rendered from the fact the query asks about, intersected
 * with the query's structural predicate. Nothing is judged by eye.
 *
 * Everything is seeded. Same seed, same corpus, byte for byte.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'data')

/* ------------------------------------------------------------------ random */

/** mulberry32 — small, fast, and reproducible across platforms. */
function rng(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = (r, xs) => xs[Math.floor(r() * xs.length)]
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1))
const shuffle = (r, xs) => {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
/** Sample n distinct items without replacement. */
const sample = (r, xs, n) => shuffle(r, xs).slice(0, Math.min(n, xs.length))

/* ------------------------------------------------------------- vocabulary */

const SERVICE_NAMES = [
  'checkout', 'catalog', 'billing', 'identity', 'notifier', 'search', 'ledger',
  'inventory', 'gateway', 'scheduler', 'ingest', 'render', 'audit', 'pricing',
  'shipping', 'recommender', 'session', 'media', 'webhook', 'reconciler',
]
const RUNTIMES = ['node22', 'go1.24', 'rust1.85', 'python3.13', 'java21', 'dotnet9']
const REGIONS = ['iad1', 'fra1', 'sin1', 'syd1', 'gru1', 'cdg1']
const TEAMS = ['platform', 'payments', 'growth', 'infra', 'data', 'security']
const ROLES = ['staff engineer', 'SRE', 'tech lead', 'engineer', 'engineering manager']
const FIRST = ['Priya', 'Arun', 'Mei', 'Tomas', 'Nadia', 'Kofi', 'Elena', 'Yusuf',
  'Hana', 'Diego', 'Ravi', 'Sara', 'Lukas', 'Amara', 'Jin', 'Noor']
const LAST = ['Nair', 'Okafor', 'Lindqvist', 'Duarte', 'Haddad', 'Novak', 'Reyes',
  'Kimura', 'Bhatt', 'Farrell', 'Sokolov', 'Adeyemi']

/**
 * Each key carries a gloss: a description of what the setting controls that
 * shares no rare token with the key itself. The semantic query class is built
 * from the gloss, the lexical class from the key. Keeping the two vocabularies
 * disjoint is what lets §6 attribute a retrieval win to the right mechanism.
 */
const CONFIG_KEYS = [
  ['max_pool_size', 'how many database connections it will hold open at once'],
  ['idle_timeout_ms', 'how long a quiet connection is allowed to linger before it gets closed'],
  ['retry_budget', 'how many second attempts it is allowed to make before giving up'],
  ['cache_ttl_seconds', 'how long a remembered answer stays usable before it has to be fetched again'],
  ['batch_window_ms', 'how long it waits to gather work together before sending it on'],
  ['shard_count', 'how many pieces the data is split across'],
  ['circuit_breaker_threshold', 'how many failures in a row it takes before traffic stops being sent downstream'],
  ['prefetch_depth', 'how far ahead it reads before anything asks for the data'],
  ['compaction_interval_min', 'how often the on-disk files get merged and tidied up'],
  ['session_ttl_seconds', 'how long a signed-in visitor stays signed in without touching anything'],
  ['rate_limit_rps', 'how many calls a single caller gets each second before being turned away'],
  ['checkpoint_interval_s', 'how often progress is written down so a restart does not lose it'],
  ['read_replica_lag_ms', 'how far behind a follower copy is allowed to fall before it stops being read from'],
  ['flush_bytes', 'how much is allowed to pile up in memory before it gets written out'],
]

const INCIDENT_CAUSES = [
  { cause: 'connection pool exhaustion', symptom: 'requests queued until the client timed out' },
  { cause: 'unbounded retry storm', symptom: 'the upstream saw ten times its normal load' },
  { cause: 'a stale read replica', symptom: 'users saw their own writes disappear' },
  { cause: 'clock skew between nodes', symptom: 'tokens were rejected as expired on issue' },
  { cause: 'a missing index after a migration', symptom: 'the query planner fell back to a sequential scan' },
  { cause: 'a leaked file descriptor', symptom: 'the process refused new sockets after nine hours' },
  { cause: 'cache stampede on expiry', symptom: 'every instance recomputed the same value at once' },
  { cause: 'a partial deploy', symptom: 'half the fleet spoke an older wire format' },
  { cause: 'disk filling with unrotated logs', symptom: 'writes began failing at ninety-eight percent' },
  { cause: 'a deadlock between two update paths', symptom: 'transactions aborted under load' },
]

const DECISION_TOPICS = [
  { topic: 'queue backpressure', options: ['drop oldest', 'block producers', 'shed load at the edge'] },
  { topic: 'schema migration strategy', options: ['expand and contract', 'dual write', 'offline window'] },
  { topic: 'secret rotation', options: ['quarterly manual', 'automated weekly', 'on every deploy'] },
  { topic: 'cache invalidation', options: ['write-through', 'TTL only', 'explicit purge'] },
  { topic: 'multi-region reads', options: ['follower reads', 'pinned primary', 'per-tenant routing'] },
  { topic: 'idempotency handling', options: ['client-supplied keys', 'server dedupe window', 'no guarantee'] },
  { topic: 'background job retries', options: ['exponential with jitter', 'fixed interval', 'manual replay'] },
  { topic: 'tenant isolation', options: ['schema per tenant', 'row-level security', 'separate clusters'] },
]

const PROCEDURES = [
  { name: 'rotating a deploy key', steps: ['revoke the old key in the provider', 'issue a replacement scoped to one repo', 'update the CI secret', 'trigger a no-op build to confirm'] },
  { name: 'draining a node', steps: ['mark the node unschedulable', 'wait for in-flight requests to finish', 'move the leader election away', 'terminate'] },
  { name: 'restoring from a snapshot', steps: ['stop writers', 'restore into a scratch instance', 'verify row counts against the checksum', 'repoint the connection string'] },
  { name: 'promoting a read replica', steps: ['confirm replication lag is zero', 'fence the old primary', 'promote', 'update the service discovery record'] },
  { name: 'rolling back a migration', steps: ['stop the deploy', 'run the down migration in a transaction', 'verify the constraint set', 'redeploy the previous image'] },
]

/* ------------------------------------------------------------------ world */

/**
 * Names have to stay unique past the length of the word lists, because the
 * corpus scales to tens of thousands of memories. Once the base list is
 * exhausted we suffix a generation number: `checkout`, then `checkout-2`. The
 * identifiers stay globally distinct either way, which is what the lexical
 * query class depends on.
 */
const nameAt = (list, i) => (i < list.length ? list[i] : `${list[i % list.length]}-${Math.floor(i / list.length) + 1}`)

function buildWorld(r, size) {
  const services = Array.from({ length: size.services }, (_, i) => ({
    id: `SVC-${4400 + i * 7}`,
    name: nameAt(SERVICE_NAMES, i),
    runtime: pick(r, RUNTIMES),
    region: pick(r, REGIONS),
    team: pick(r, TEAMS),
  }))

  const people = Array.from({ length: size.people }, (_, i) => ({
    id: `PER-${100 + i}`,
    name: `${FIRST[i % FIRST.length]} ${LAST[(i * 5 + Math.floor(i / FIRST.length)) % LAST.length]}`,
    role: pick(r, ROLES),
    team: pick(r, TEAMS),
  }))

  const repos = services.map((s) => ({
    id: `REPO-${s.id.slice(4)}`,
    name: `${s.name}-service`,
    service: s.id,
    branch: pick(r, ['main', 'trunk', 'release']),
  }))

  const incidents = Array.from({ length: size.incidents }, (_, i) => {
    const c = INCIDENT_CAUSES[i % INCIDENT_CAUSES.length]
    return {
      id: `INC-${2200 + i * 3}`,
      service: pick(r, services).id,
      ...c,
      day: int(r, 1, 320),
    }
  })

  const decisions = Array.from({ length: size.decisions }, (_, i) => {
    const d = DECISION_TOPICS[i % DECISION_TOPICS.length]
    const chosen = pick(r, d.options)
    return {
      id: `ADR-${140 + i}`,
      topic: d.topic,
      choice: chosen,
      rejected: d.options.filter((o) => o !== chosen),
      service: pick(r, services).id,
      day: int(r, 1, 320),
    }
  })

  const configs = Array.from({ length: size.configs }, (_, i) => {
    const svc = services[i % services.length]
    const [key, gloss] = CONFIG_KEYS[Math.floor(i / services.length) % CONFIG_KEYS.length]
    return {
      id: `CFG-${700 + i}`,
      key,
      gloss,
      service: svc.id,
      serviceName: svc.name,
      value: pick(r, [8, 16, 32, 64, 128, 250, 500, 1000, 2500, 5000]),
      day: int(r, 1, 320),
    }
  })

  const procedures = Array.from({ length: size.procedures }, (_, i) => {
    const p = PROCEDURES[i % PROCEDURES.length]
    const svc = services[i % services.length]
    return {
      id: `RUN-${310 + i}`,
      name: i < PROCEDURES.length ? p.name : `${p.name} on ${svc.name}`,
      steps: p.steps,
    }
  })

  return { services, people, repos, incidents, decisions, configs, procedures }
}

/* ------------------------------------------------------------------ facts */

/**
 * A fact is the atom of truth. `kind` decides which memory templates can render
 * it; `tokens` are the rare identifiers a lexical query can latch onto;
 * `concept` is the token-free description a semantic query paraphrases.
 */
function buildFacts(r, world) {
  const facts = []
  const add = (f) => { facts.push({ ordinal: facts.length, ...f }); return facts[facts.length - 1] }

  for (const c of world.configs) {
    const svc = world.services.find((s) => s.id === c.service)
    add({
      id: `F-cfg-${c.id}`,
      kind: 'semantic',
      subject: c.service,
      predicate: 'config',
      object: `${c.key}=${c.value}`,
      day: c.day,
      tokens: [c.id, c.service, c.key],
      entities: [c.service, c.id],
      concept: `${c.gloss}, over in the ${svc.name} part of the system`,
      slots: { key: c.key, value: c.value, gloss: c.gloss, service: svc.name, svcId: c.service, cfgId: c.id },
    })
  }

  for (const inc of world.incidents) {
    const svc = world.services.find((s) => s.id === inc.service)
    add({
      id: `F-inc-${inc.id}`,
      kind: 'episodic',
      subject: inc.service,
      predicate: 'incident-cause',
      object: inc.cause,
      day: inc.day,
      tokens: [inc.id, inc.service],
      entities: [inc.service, inc.id],
      concept: `the time ${svc.name} broke and ${inc.symptom}, and what turned out to be behind it`,
      slots: { incId: inc.id, service: svc.name, svcId: inc.service, cause: inc.cause, symptom: inc.symptom, day: inc.day },
    })
  }

  for (const d of world.decisions) {
    const svc = world.services.find((s) => s.id === d.service)
    add({
      id: `F-adr-${d.id}`,
      kind: 'semantic',
      subject: d.service,
      predicate: 'decision',
      object: d.choice,
      day: d.day,
      tokens: [d.id, d.service],
      entities: [d.service, d.id],
      concept: `the approach the team settled on for handling ${d.topic} in ${svc.name}, and what they turned down`,
      slots: { adrId: d.id, topic: d.topic, choice: d.choice, rejected: d.rejected, service: svc.name, svcId: d.service, day: d.day },
    })
  }

  for (const p of world.procedures) {
    add({
      id: `F-run-${p.id}`,
      kind: 'procedural',
      subject: p.id,
      predicate: 'procedure',
      object: p.name,
      day: int(r, 1, 320),
      tokens: [p.id],
      entities: [p.id],
      concept: `the ordered steps someone should follow when they need to carry out ${p.name} without breaking anything`,
      slots: { runId: p.id, name: p.name, steps: p.steps },
    })
  }

  for (const per of world.people) {
    add({
      id: `F-own-${per.id}`,
      kind: 'semantic',
      subject: per.id,
      predicate: 'ownership',
      object: per.team,
      day: int(r, 1, 320),
      tokens: [per.id],
      entities: [per.id],
      concept: `who has the final say when something on the ${per.team} side needs a decision made quickly`,
      slots: { person: per.name, role: per.role, team: per.team, perId: per.id },
    })
  }

  return facts
}

/* -------------------------------------------------------------- rendering */

/**
 * Surface forms. Each fact gets rendered several ways so that lexical overlap
 * between a memory and a query is a property we control rather than an accident.
 * `lexical: true` means the rendering carries the fact's rare identifiers.
 */
const TEMPLATES = {
  config: [
    { lexical: true, f: (s) => `Set ${s.key} to ${s.value} on ${s.service} (${s.svcId}); recorded as ${s.cfgId}.` },
    { lexical: true, f: (s) => `${s.svcId} ${s.service}: ${s.key} is ${s.value}. Changing it needs a restart.` },
    { lexical: false, f: (s) => `In the ${s.service} part of the system, ${s.gloss} — the number is ${s.value}.` },
    { lexical: false, f: (s) => `We settled on ${s.value} for ${s.gloss} over in ${s.service}; anything higher was worse under load.` },
  ],
  'incident-cause': [
    { lexical: true, f: (s) => `${s.incId}: ${s.service} (${s.svcId}) went down on day ${s.day}. Root cause was ${s.cause}.` },
    { lexical: true, f: (s) => `Postmortem for ${s.incId} — ${s.symptom}. The underlying problem was ${s.cause}.` },
    { lexical: false, f: (s) => `That outage in ${s.service} came down to ${s.cause}; ${s.symptom}.` },
    { lexical: false, f: (s) => `When ${s.service} fell over, ${s.symptom} — it traced back to ${s.cause}.` },
  ],
  decision: [
    { lexical: true, f: (s) => `${s.adrId}: for ${s.topic} in ${s.service} (${s.svcId}) we chose ${s.choice}.` },
    { lexical: true, f: (s) => `${s.adrId} rejected ${s.rejected.join(' and ')} in favour of ${s.choice}.` },
    { lexical: false, f: (s) => `On ${s.topic}, the team went with ${s.choice} rather than ${s.rejected[0]}.` },
    { lexical: false, f: (s) => `We settled the ${s.topic} argument in ${s.service}: ${s.choice} won.` },
  ],
  procedure: [
    { lexical: true, f: (s) => `${s.runId} — ${s.name}: ${s.steps.map((x, i) => `${i + 1}. ${x}`).join(' ')}` },
    { lexical: true, f: (s) => `Runbook ${s.runId} covers ${s.name}. First step is to ${s.steps[0]}.` },
    { lexical: false, f: (s) => `When ${s.name}, start by ${s.steps[0]}, then ${s.steps[1]}, and finish once you ${s.steps[3] ?? s.steps[2]}.` },
    { lexical: false, f: (s) => `The safe order for ${s.name} is ${s.steps.join(', then ')}.` },
  ],
  ownership: [
    { lexical: true, f: (s) => `${s.perId} — ${s.person} is ${s.role} on ${s.team}.` },
    { lexical: true, f: (s) => `Escalation for ${s.team} goes to ${s.person} (${s.perId}).` },
    { lexical: false, f: (s) => `${s.person} is the person to ask when the ${s.team} side needs a call made.` },
    { lexical: false, f: (s) => `If it touches ${s.team}, ${s.person} has the final say.` },
  ],
}

const SOURCES = ['tool_result', 'user_message', 'agent_summary', 'file_read', 'shell_output']

/* --------------------------------------------------------------- memories */

function buildMemories(r, facts, opts) {
  const memories = []
  const byFact = new Map()

  // Restatement counts are Zipf-ish: a few facts get talked about constantly,
  // most get mentioned once or twice. Real agent memory looks like this, and it
  // is what makes deduplication and consolidation worth measuring at all.
  const restatements = facts.map((_, i) => {
    const u = r()
    const heavy = i % 11 === 0
    return heavy ? int(r, 6, opts.maxRestatements) : Math.max(1, Math.round(1 + u * u * 3))
  })

  const queue = []
  for (const { f, n } of shuffle(r, facts.map((f, i) => ({ f, n: restatements[i] })))) {
    for (let k = 0; k < n; k++) queue.push({ f, variant: k })
  }
  const grounded = shuffle(r, queue).slice(0, opts.target)

  // Sessions are sized to the memories that actually exist, not to the target,
  // so the provenance query class always has sessions worth joining against.
  const sessions = []
  const sessionCount = Math.max(8, Math.ceil(
    (grounded.length * (1 + opts.distractorRatio)) / opts.memoriesPerSession,
  ))
  for (let i = 0; i < sessionCount; i++) {
    sessions.push({
      id: `S-${String(i).padStart(4, '0')}`,
      day: 1 + Math.floor((i / sessionCount) * 320),
      agent: pick(r, ['claude-opus', 'claude-sonnet', 'gpt-mini', 'local-llama']),
      turns: 0,
    })
  }

  let seq = 0
  for (const { f, variant } of grounded) {
    const tpls = TEMPLATES[f.predicate]
    const tpl = tpls[variant % tpls.length]
    const session = sessions[int(r, 0, sessions.length - 1)]
    session.turns++
    const m = {
      id: `M-${String(seq).padStart(6, '0')}`,
      seq,
      sessionId: session.id,
      turn: session.turns,
      kind: f.kind,
      body: tpl.f(f.slots),
      factId: f.id,
      lexical: tpl.lexical,
      entities: f.entities,
      day: Math.min(320, Math.max(1, session.day + int(r, -2, 2))),
      source: pick(r, SOURCES),
      confidence: Number((0.55 + r() * 0.45).toFixed(3)),
      supersededBy: null,
    }
    memories.push(m)
    if (!byFact.has(f.id)) byFact.set(f.id, [])
    byFact.get(f.id).push(m.id)
    seq++
  }

  // Distractors: memories that share the rare tokens of one fact but describe a
  // different one. Without these, a lexical index scores perfectly by accident.
  const distractorCount = Math.round(memories.length * opts.distractorRatio)
  for (let i = 0; i < distractorCount; i++) {
    const a = pick(r, facts)
    const b = pick(r, facts)
    if (a.id === b.id) continue
    const session = sessions[int(r, 0, sessions.length - 1)]
    session.turns++
    memories.push({
      id: `M-${String(seq).padStart(6, '0')}`,
      seq,
      sessionId: session.id,
      turn: session.turns,
      kind: 'episodic',
      body: `Checked ${a.tokens[0]} while looking into something else; it was not related to ${b.tokens[0]}. No change made.`,
      factId: null,
      lexical: true,
      entities: [a.entities[0]],
      day: Math.min(320, Math.max(1, session.day + int(r, -2, 2))),
      source: 'agent_summary',
      confidence: Number((0.3 + r() * 0.3).toFixed(3)),
      supersededBy: null,
    })
    seq++
  }

  // Supersession: a slice of facts get a later memory that revises them. This is
  // what makes "the current answer" different from "the best-matching text", and
  // it is the case a pure similarity index has no way to express.
  const revised = sample(r, [...byFact.keys()], Math.round(byFact.size * opts.supersededRatio))
  const supersessions = []
  for (const factId of revised) {
    const olds = byFact.get(factId)
    const fact = facts.find((f) => f.id === factId)
    const session = sessions[sessions.length - 1 - int(r, 0, Math.min(5, sessions.length - 1))]
    session.turns++
    const m = {
      id: `M-${String(seq).padStart(6, '0')}`,
      seq,
      sessionId: session.id,
      turn: session.turns,
      kind: fact.kind,
      body: `Correction: the earlier note about ${fact.tokens[0]} is out of date. ${TEMPLATES[fact.predicate][0].f(fact.slots)}`,
      factId,
      lexical: true,
      entities: fact.entities,
      day: 320,
      source: 'agent_summary',
      confidence: 0.98,
      supersededBy: null,
    }
    memories.push(m)
    for (const oldId of olds) {
      const om = memories.find((x) => x.id === oldId)
      if (om) om.supersededBy = m.id
    }
    supersessions.push({ factId, current: m.id, superseded: olds.slice() })
    byFact.get(factId).push(m.id)
    seq++
  }

  return { memories, sessions: sessions.filter((s) => s.turns > 0), byFact, supersessions }
}

/* ---------------------------------------------------------------- queries */

/**
 * Eight query classes. The interesting column is `similarityExpressible`: can
 * this query be answered by a top-k similarity search alone, with no predicate,
 * no join and no aggregate? Section 6 turns that column into the paper's
 * central count.
 */
function buildQueries(r, world, facts, mem, opts) {
  const { memories, byFact, sessions, supersessions } = mem
  const queries = []
  const byId = new Map(memories.map((m) => [m.id, m]))
  const add = (q) => { queries.push({ ordinal: queries.length, ...q }); }

  const factsWith = (pred, n) =>
    sample(r, facts.filter((f) => f.predicate === pred && (byFact.get(f.id) ?? []).length > 0), n)

  /* 1. lexical — the query carries a rare identifier verbatim. */
  for (const f of sample(r, facts.filter((f) => (byFact.get(f.id) ?? []).length > 0), opts.perClass)) {
    add({
      id: `Q-lex-${f.id}`,
      class: 'lexical',
      text: `What do we know about ${f.tokens[0]}?`,
      targetFactId: f.id,
      relevant: byFact.get(f.id).slice(),
      predicate: null,
      similarityExpressible: true,
      rationale: 'Rare identifier present verbatim in the target memories.',
    })
  }

  /* 2. semantic — paraphrase, deliberately avoiding the fact's identifiers.
        Only facts with at least one non-identifier rendering can be asked
        about this way, so the pool is filtered before sampling rather than
        after — otherwise the class silently comes out short. */
  const semanticPool = facts.filter((f) =>
    (byFact.get(f.id) ?? []).some((id) => !byId.get(id).lexical))
  for (const f of sample(r, semanticPool, opts.perClass)) {
    const nonLexical = byFact.get(f.id).filter((id) => !byId.get(id).lexical)
    add({
      id: `Q-sem-${f.id}`,
      class: 'semantic',
      text: `Remind me about ${f.concept}.`,
      targetFactId: f.id,
      relevant: nonLexical,
      predicate: null,
      similarityExpressible: true,
      rationale: 'Paraphrase sharing no rare tokens with the target memories.',
    })
  }

  /* 3. temporal — similarity plus a range predicate over time. */
  for (const f of factsWith('incident-cause', opts.perClass)) {
    const cut = 160
    const rel = byFact.get(f.id).filter((id) => byId.get(id).day <= cut)
    if (!rel.length) continue
    add({
      id: `Q-tmp-${f.id}`,
      class: 'temporal',
      text: `What had we established about ${f.slots.service} before day ${cut}?`,
      targetFactId: f.id,
      relevant: rel,
      predicate: { field: 'day', op: '<=', value: cut },
      similarityExpressible: false,
      rationale: 'Correct answer depends on a range restriction the index cannot apply.',
    })
  }

  /* 4. provenance — a join from memory to the session that produced it. */
  for (const s of sample(r, sessions.filter((s) => s.turns > 3), opts.perClass)) {
    const rel = memories.filter((m) => m.sessionId === s.id).map((m) => m.id)
    if (rel.length < 2) continue
    add({
      id: `Q-prv-${s.id}`,
      class: 'provenance',
      text: `Everything I recorded during session ${s.id}.`,
      targetFactId: null,
      relevant: rel,
      predicate: { field: 'sessionId', op: '=', value: s.id },
      similarityExpressible: false,
      rationale: 'An equality join on a foreign key. Text similarity is irrelevant to correctness.',
    })
  }

  /* 5. currency — the answer is the surviving version, not the closest text. */
  for (const sup of sample(r, supersessions, opts.perClass)) {
    add({
      id: `Q-cur-${sup.factId}`,
      class: 'currency',
      text: `What is the current position on ${facts.find((f) => f.id === sup.factId).tokens[0]}?`,
      targetFactId: sup.factId,
      relevant: [sup.current],
      predicate: { field: 'supersededBy', op: 'is null', value: null },
      similarityExpressible: false,
      rationale: 'Superseded restatements match the query text at least as well as the current one.',
    })
  }

  /* 6. aggregate — the answer is a count, not a document. */
  for (const f of sample(r, facts.filter((f) => (byFact.get(f.id) ?? []).length >= 4), opts.perClass)) {
    add({
      id: `Q-agg-${f.id}`,
      class: 'aggregate',
      text: `How many times did I record something about ${f.tokens[0]}?`,
      targetFactId: f.id,
      relevant: byFact.get(f.id).slice(),
      expectedCount: byFact.get(f.id).length,
      predicate: { field: 'factId', op: 'count', value: f.id },
      similarityExpressible: false,
      rationale: 'A cardinality question. Top-k truncation makes the answer wrong by construction.',
    })
  }

  /* 7. negation — a filter that removes what similarity would return first. */
  for (const sup of sample(r, supersessions, opts.perClass)) {
    const f = facts.find((x) => x.id === sup.factId)
    add({
      id: `Q-neg-${sup.factId}`,
      class: 'negation',
      text: `Everything about ${f.tokens[0]} that has not been corrected since.`,
      targetFactId: sup.factId,
      relevant: [sup.current],
      predicate: { field: 'supersededBy', op: 'is null', value: null },
      similarityExpressible: false,
      rationale: 'The excluded rows are the highest-similarity rows.',
    })
  }

  /* 8. hybrid — an identifier and a paraphrase in the same question. */
  for (const f of sample(r, facts.filter((f) => (byFact.get(f.id) ?? []).length >= 3), opts.perClass)) {
    add({
      id: `Q-hyb-${f.id}`,
      class: 'hybrid',
      text: `On ${f.tokens[0]}, remind me about ${f.concept}.`,
      targetFactId: f.id,
      relevant: byFact.get(f.id).slice(),
      predicate: null,
      similarityExpressible: true,
      rationale: 'Rewards a retriever that can use both an exact token and a paraphrase.',
    })
  }

  return queries
}

/* ------------------------------------------------------------------ build */

/**
 * The world has to be sized from the memory target, not fixed, or the corpus
 * saturates: facts are rendered ~3.2 times on average, so a target of 32,000
 * memories needs on the order of 10,000 facts to reach it. The mix below keeps
 * the ratio of fact kinds constant as the corpus grows, so a scaling curve
 * measures scale rather than a drifting workload.
 */
function worldFor(target) {
  const facts = Math.max(180, Math.round(target / 3.2))
  return {
    configs: Math.round(facts * 0.40),
    incidents: Math.round(facts * 0.26),
    decisions: Math.round(facts * 0.19),
    people: Math.round(facts * 0.08),
    procedures: Math.max(5, Math.round(facts * 0.07)),
    services: Math.max(20, Math.round(facts * 0.10)),
  }
}

export function generate(opts = {}) {
  const o = {
    seed: 20260809,
    target: 8000,
    memoriesPerSession: 24,
    maxRestatements: 14,
    distractorRatio: 0.18,
    supersededRatio: 0.12,
    perClass: 40,
    ...opts,
  }
  o.world = opts.world ?? worldFor(o.target)
  const r = rng(o.seed)
  const world = buildWorld(r, o.world)
  const facts = buildFacts(r, world)
  const mem = buildMemories(r, facts, o)
  const queries = buildQueries(r, world, facts, mem, o)

  return {
    options: o,
    world,
    facts,
    sessions: mem.sessions,
    memories: mem.memories,
    supersessions: mem.supersessions,
    queries,
    stats: {
      facts: facts.length,
      memories: mem.memories.length,
      grounded: mem.memories.filter((m) => m.factId).length,
      distractors: mem.memories.filter((m) => !m.factId).length,
      superseded: mem.memories.filter((m) => m.supersededBy).length,
      sessions: mem.sessions.length,
      queries: queries.length,
      byClass: Object.fromEntries(
        [...new Set(queries.map((q) => q.class))].map((c) => [c, queries.filter((q) => q.class === c).length]),
      ),
      similarityExpressible: queries.filter((q) => q.similarityExpressible).length,
      bytes: mem.memories.reduce((s, m) => s + Buffer.byteLength(m.body), 0),
    },
  }
}

/** Scale variants reuse the same generator with a larger memory target. */
export const SCALES = [500, 2000, 8000, 32000]

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('corpus.mjs')) {
  fs.mkdirSync(OUT, { recursive: true })
  const main = generate()
  fs.writeFileSync(path.join(OUT, 'corpus.json'), JSON.stringify(main))
  const scales = {}
  for (const n of SCALES) {
    const c = generate({ target: n, perClass: n === main.options.target ? 40 : 12 })
    scales[n] = { memories: c.memories, queries: c.queries, stats: c.stats }
  }
  fs.writeFileSync(path.join(OUT, 'corpus.scales.json'), JSON.stringify(scales))
  console.log('corpus:', JSON.stringify(main.stats, null, 2))
  console.log('scales:', Object.entries(scales).map(([k, v]) => `${k}->${v.memories.length}`).join(' '))
}
