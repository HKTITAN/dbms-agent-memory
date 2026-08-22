/**
 * The workload, the oracle, and the cost model.
 *
 * Three things live here and nowhere else.
 *
 * 1. THE WORKLOAD. Ten question classes, each named for the Lore surface that
 *    raises it and each annotated with the relational algebra it needs. The
 *    classes are not chosen to make a point; they are read off Lore's own
 *    documented commands and hooks. If `lore ask <entity>` exists, the workload
 *    contains an ask-entity question.
 *
 * 2. THE ORACLE. Every question's correct answer is computed in plain JavaScript
 *    over the generated vault, once, before any store is built. No store scores
 *    itself, and no answer is judged by looking at what a store returned. The
 *    vault is generated from facts downward — see tools/vault.mjs — so the
 *    correct answer to "what is currently true about E" is definitional, not
 *    an opinion.
 *
 * 3. THE COST MODEL. Round trips, bytes over the wire, and rows the client had
 *    to scan itself. These are the metrics that survive the fact that our Notion
 *    arm is an emulator rather than the live service: a round trip is a round
 *    trip whether the socket is real or not, and the count is fixed by the API's
 *    shape rather than by anyone's network. Wall-clock is recorded only for the
 *    two arms where a real engine executes the query.
 */

import { FUNCTIONAL_PREDICATES } from './schema.mjs'

/* ------------------------------------------------------------- tokenising */

const STOP = new Set(['the', 'a', 'an', 'is', 'was', 'were', 'are', 'be', 'been', 'to', 'of',
  'in', 'on', 'at', 'for', 'and', 'or', 'it', 'its', 'that', 'this', 'with', 'as', 'we',
  'i', 'me', 'my', 'do', 'did', 'does', 'what', 'when', 'which', 'who', 'how', 'about',
  'from', 'by', 'so', 'if', 'not', 'no', 'have', 'has', 'had', 'you', 'your', 'their'])

export function tokenize(s) {
  return String(s)
    .toLowerCase()
    .split(/[^a-z0-9_.-]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
}

/* --------------------------------------------------------- question classes */

/**
 * `algebra` is the minimum relational algebra the question needs. `notion` says
 * what the Notion Data API can do about it, using only operations the public
 * reference documents.
 */
export const QUESTION_CLASSES = [
  {
    id: 'wake-up',
    label: 'Wake-up context',
    surface: 'lore hooks wakeup',
    algebra: ['σ', 'π', 'sort', 'limit'],
    needsJoin: false,
    needsAggregate: false,
    needsRecursion: false,
    notion: 'expressible',
    blurb: 'Recent memories and active facts for the current project, newest first.',
  },
  {
    id: 'ask-entity',
    label: 'Everything about an entity',
    surface: 'lore ask <entity>',
    algebra: ['σ', '∪', '⋈'],
    needsJoin: true,
    needsAggregate: false,
    needsRecursion: false,
    notion: 'partial',
    blurb: 'Facts where the entity is subject or object, resolved through its aliases.',
  },
  {
    id: 'provenance',
    label: 'Where did this claim come from',
    surface: 'lore-fact action=query',
    algebra: ['σ', '⋈'],
    needsJoin: true,
    needsAggregate: false,
    needsRecursion: false,
    notion: 'client-side join',
    blurb: 'A fact, its source memory, and the author who wrote it.',
  },
  {
    id: 'as-of',
    label: 'What did we believe on date D',
    surface: 'temporal recall',
    algebra: ['σ', 'range'],
    needsJoin: false,
    needsAggregate: false,
    needsRecursion: false,
    notion: 'expressible',
    blurb: 'Facts whose validity interval contains an instant in the past.',
  },
  {
    id: 'current',
    label: 'What is true now',
    surface: 'lore-context action=wake-up',
    algebra: ['σ'],
    needsJoin: false,
    needsAggregate: false,
    needsRecursion: false,
    notion: 'expressible',
    blurb: 'Facts with an open validity interval.',
  },
  {
    id: 'aggregate',
    label: 'Counting and grouping',
    surface: 'lore status, digest synthesis',
    algebra: ['σ', 'γ'],
    needsJoin: false,
    needsAggregate: true,
    needsRecursion: false,
    notion: 'not expressible',
    blurb: 'How many memories of each kind this project produced in a window.',
  },
  {
    id: 'conflict-scan',
    label: 'Find contradictions',
    surface: 'lore conflicts scan',
    algebra: ['σ', '⋈ (self)', 'γ'],
    needsJoin: true,
    needsAggregate: true,
    needsRecursion: false,
    notion: 'not expressible',
    blurb: 'Subject-predicate pairs asserting two different objects over overlapping validity.',
  },
  {
    id: 'supersession',
    label: 'Follow a decision chain',
    surface: 'lore-decision action=supersede',
    algebra: ['σ', 'transitive closure'],
    needsJoin: true,
    needsAggregate: false,
    needsRecursion: true,
    notion: 'not expressible',
    blurb: 'The decision that finally replaced this one, through every intermediate step.',
  },
  {
    id: 'body-search',
    label: 'Search what a memory says',
    surface: 'lore search <query>',
    algebra: ['σ (full text)'],
    needsJoin: false,
    needsAggregate: false,
    needsRecursion: false,
    notion: 'not expressible',
    blurb: 'Memories whose body discusses a term. The body is blocks, not a property.',
  },
  {
    id: 'cross-db',
    label: 'Two joins deep',
    surface: 'digest synthesis',
    algebra: ['σ', '⋈', '⋈'],
    needsJoin: true,
    needsAggregate: false,
    needsRecursion: false,
    notion: 'client-side join',
    blurb: 'Facts about entities that were introduced by memories a given author wrote.',
  },
]

export const CLASS_BY_ID = Object.fromEntries(QUESTION_CLASSES.map((c) => [c.id, c]))

/* ------------------------------------------------------------------ oracle */

/** Is a fact believed at instant `day`? Null valid_until means "still believed". */
export function validAt(f, day) {
  const from = f.valid_from ?? -Infinity
  const until = f.valid_until ?? Infinity
  return from <= day && day < until
}

/** Do two validity intervals overlap on the half-open convention [from, until)? */
export function overlaps(a, b) {
  const af = a.valid_from ?? -Infinity
  const au = a.valid_until ?? Infinity
  const bf = b.valid_from ?? -Infinity
  const bu = b.valid_until ?? Infinity
  return af < bu && bf < au
}

/**
 * Answer every question against the vault in plain JavaScript.
 *
 * This is the reference semantics. It is deliberately slow and obvious: a
 * nested loop that any reader can check by eye beats a clever one that has to be
 * trusted. Correctness for every arm is measured against what this returns.
 */
export function oracle(vault, q) {
  // Archived pages are in the trash. No arm can read them, so none of them is
  // part of any correct answer. The rows that cite them are measured separately,
  // as an integrity defect, rather than smuggled into the expressibility scores.
  const memories = vault.memories.filter((m) => !m.archived)
  const live = new Set(memories.map((m) => m.memory_id))
  const facts = vault.facts
  const entities = vault.entities
  const memoryProjects = vault.memoryProjects

  switch (q.class) {
    case 'wake-up': {
      const inProject = new Set(memoryProjects.filter((mp) => mp.project_id === q.project_id).map((mp) => mp.memory_id))
      return memories
        .filter((m) => inProject.has(m.memory_id) && m.created_time >= q.since)
        .sort((a, b) => b.created_time - a.created_time || (a.memory_id < b.memory_id ? -1 : 1))
        .slice(0, q.limit)
        .map((m) => m.memory_id)
    }

    case 'ask-entity': {
      const ids = resolveEntity(vault, q.term)
      return facts
        .filter((f) => ids.has(f.subject_entity_id) || ids.has(f.object_entity_id))
        .map((f) => f.fact_id)
        .sort()
    }

    case 'provenance': {
      const byId = new Map(memories.map((m) => [m.memory_id, m]))
      return facts
        .filter((f) => {
          const m = byId.get(f.source_memory_id)
          return m && m.author === q.author && f.predicate === q.predicate
        })
        .map((f) => f.fact_id)
        .sort()
    }

    case 'as-of': {
      const ids = resolveEntity(vault, q.term)
      return facts
        .filter((f) => ids.has(f.subject_entity_id) && validAt(f, q.day))
        .map((f) => f.fact_id)
        .sort()
    }

    case 'current': {
      const ids = resolveEntity(vault, q.term)
      return facts
        .filter((f) => ids.has(f.subject_entity_id) && f.valid_until == null)
        .map((f) => f.fact_id)
        .sort()
    }

    case 'aggregate': {
      const inProject = new Set(memoryProjects.filter((mp) => mp.project_id === q.project_id).map((mp) => mp.memory_id))
      const counts = new Map()
      for (const m of memories) {
        if (!inProject.has(m.memory_id)) continue
        if (m.created_time < q.since) continue
        counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1)
      }
      // An aggregate answer is a set of group/count pairs, encoded so the same
      // set-comparison scorer works for it.
      return [...counts.entries()].sort().map(([k, n]) => `${k}=${n}`)
    }

    case 'conflict-scan': {
      const out = new Set()
      const groups = new Map()
      for (const f of facts) {
        if (!FUNCTIONAL_PREDICATES.has(f.predicate)) continue
        if (!f.subject_entity_id) continue
        const key = `${f.subject_entity_id}|${f.predicate}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(f)
      }
      for (const [key, group] of groups) {
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            if (group[i].object !== group[j].object && overlaps(group[i], group[j])) {
              out.add(key)
            }
          }
        }
      }
      return [...out].sort()
    }

    case 'supersession': {
      // Walk the Supersedes self-relation forward. A memory's `supersedes_id`
      // names the memory it replaced, so the chain from an old decision to the
      // one in force is found by asking, repeatedly, who points at me.
      const replacedBy = new Map() // replaced memory -> replacing memory
      for (const m of memories) {
        if (m.supersedes_id) replacedBy.set(m.supersedes_id, m.memory_id)
      }
      let head = q.term
      const seen = new Set([head])
      const chain = []
      while (replacedBy.has(head)) {
        head = replacedBy.get(head)
        if (seen.has(head)) break // a cycle; a single_property relation cannot prevent one
        seen.add(head)
        chain.push(head)
      }
      return chain
    }

    case 'body-search': {
      const needle = q.term.toLowerCase()
      return memories
        .filter((m) => m.body.toLowerCase().includes(needle))
        .map((m) => m.memory_id)
        .sort()
    }

    case 'cross-db': {
      const authored = new Set(memories.filter((m) => m.author === q.author).map((m) => m.memory_id))
      const introduced = new Set(entities.filter((e) => authored.has(e.source_memory_id) && live.has(e.source_memory_id)).map((e) => e.entity_id))
      return facts
        .filter((f) => introduced.has(f.subject_entity_id))
        .map((f) => f.fact_id)
        .sort()
    }

    default:
      throw new Error(`no oracle for class ${q.class}`)
  }

  function resolveEntity(v, term) {
    const t = term.toLowerCase()
    const ids = new Set()
    for (const e of v.entities) if (e.name.toLowerCase() === t) ids.add(e.entity_id)
    for (const a of v.aliases) if (a.alias.toLowerCase() === t) ids.add(a.entity_id)
    return ids
  }
}

/** Exposed so engines can use exactly the same alias semantics the oracle uses. */
export function resolveEntityIds(vault, term) {
  const t = String(term).toLowerCase()
  const ids = new Set()
  for (const e of vault.entities) if (e.name.toLowerCase() === t) ids.add(e.entity_id)
  for (const a of vault.aliases) if (a.alias.toLowerCase() === t) ids.add(a.entity_id)
  return ids
}

/* ----------------------------------------------------------------- scoring */

/**
 * Answers here are *sets*, not ranked lists, because every question in this
 * workload has a definite answer rather than a best guess. Set F1 is therefore
 * the honest measure: a store that returns ten plausible rows when the answer is
 * three specific rows is not 70% right, it is wrong in a way the agent cannot
 * detect.
 *
 * `exact` is reported alongside because for a memory system it is the number
 * that matters. An agent acting on a nearly-correct set of facts acts wrongly.
 */
export function scoreSet(returned, expected) {
  const R = new Set(returned)
  const E = new Set(expected)
  if (E.size === 0 && R.size === 0) return { p: 1, r: 1, f1: 1, exact: 1, tp: 0, fp: 0, fn: 0 }
  let tp = 0
  for (const x of R) if (E.has(x)) tp++
  const fp = R.size - tp
  const fn = E.size - tp
  const p = R.size ? tp / R.size : (E.size ? 0 : 1)
  const r = E.size ? tp / E.size : 1
  const f1 = p + r === 0 ? 0 : (2 * p * r) / (p + r)
  return { p, r, f1, exact: fp === 0 && fn === 0 ? 1 : 0, tp, fp, fn }
}

/* -------------------------------------------------------------- cost model */

/**
 * One accounting ledger per answered question.
 *
 * `roundTrips` is the number of HTTP requests the arm would issue. For SQL arms
 * it is the number of statements executed, which is one for every question in
 * this workload — that is the finding, not an artefact.
 *
 * `rowsClientSide` counts rows the arm had to transfer and examine in the client
 * because the store could not apply the predicate itself. It is the number that
 * separates "the store answered" from "the store shipped its contents to
 * somebody who answered".
 */
export function newLedger() {
  return { roundTrips: 0, bytesOut: 0, bytesIn: 0, rowsReturned: 0, rowsClientSide: 0, unsupported: [] }
}

export function mergeLedger(a, b) {
  return {
    roundTrips: a.roundTrips + b.roundTrips,
    bytesOut: a.bytesOut + b.bytesOut,
    bytesIn: a.bytesIn + b.bytesIn,
    rowsReturned: a.rowsReturned + b.rowsReturned,
    rowsClientSide: a.rowsClientSide + b.rowsClientSide,
    unsupported: [...a.unsupported, ...b.unsupported],
  }
}

/**
 * Notion documents "an average of three requests per second" per connection. We
 * do not sleep through it — that would make a capture run take hours and would
 * measure our own timers rather than the API. We report the floor it implies,
 * clearly labelled as derived: a sequence of N dependent round trips cannot
 * complete faster than N/3 seconds against one token, whatever the network does.
 */
export const NOTION_RPS = 3
export function rateLimitFloorMs(roundTrips) {
  return (roundTrips / NOTION_RPS) * 1000
}

/** Notion pagination: default 10 items, maximum 100. */
export const NOTION_PAGE_DEFAULT = 10
export const NOTION_PAGE_MAX = 100

/* --------------------------------------------------------------- timing */

/** Median of n runs. A median, not a mean: one GC pause should not set the number. */
export async function timed(fn, runs = 1) {
  const samples = []
  let last
  for (let i = 0; i < runs; i++) {
    const t = process.hrtime.bigint()
    last = await fn()
    samples.push(Number(process.hrtime.bigint() - t) / 1e6)
  }
  const sorted = samples.slice().sort((a, b) => a - b)
  return { value: last, ms: sorted[Math.floor(sorted.length / 2)], samples }
}

export function percentile(xs, p) {
  if (!xs.length) return 0
  const a = xs.slice().sort((x, y) => x - y)
  const i = Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1))
  return a[i]
}

export function mean(xs) {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0
}
