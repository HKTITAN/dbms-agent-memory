/**
 * The contract every store implements, plus the scoring that is deliberately
 * kept *outside* the stores.
 *
 * No engine computes its own quality metrics. Each one is handed a query and
 * returns an ordered list of memory ids; the harness compares that list against
 * ground truth. An engine cannot flatter itself.
 *
 * A query arrives as:
 *   { id, class, text, terms[], embedding: Float32Array, predicate, k }
 *
 * Engines that cannot apply `predicate` are expected to ignore it rather than
 * fail. That is not a bug in the engine — it is the measurement. Section 6.5
 * counts exactly how much correctness is lost that way.
 */

/* ------------------------------------------------------------ tokenisation */

const STOP = new Set(['the', 'a', 'an', 'is', 'was', 'were', 'are', 'be', 'been', 'to', 'of',
  'in', 'on', 'at', 'for', 'and', 'or', 'it', 'its', 'that', 'this', 'with', 'as', 'we',
  'i', 'me', 'my', 'do', 'did', 'does', 'what', 'when', 'which', 'who', 'how', 'about',
  'from', 'by', 'so', 'if', 'not', 'no', 'have', 'has', 'had', 'you', 'your', 'their'])

/** Lowercase, split on non-alphanumerics, keep underscores and hyphens inside identifiers. */
export function tokenize(s) {
  return String(s)
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
}

/** Terms that look like identifiers: they carry the discriminating power. */
export function rareTerms(s) {
  return tokenize(s).filter((t) => /\d/.test(t) || t.includes('_') || t.includes('-'))
}

/* ---------------------------------------------------------------- vectors */

export function cosine(a, b) {
  let d = 0
  for (let i = 0; i < a.length; i++) d += a[i] * b[i]
  return d // embeddings are L2-normalised at build time, so dot == cosine
}

/* --------------------------------------------------------------- fusion */

/**
 * Reciprocal rank fusion. The constant 60 is the value from Cormack, Clarke and
 * Buettcher (2009) and we keep it rather than tuning, because a tuned constant
 * would make the hybrid arm win by fitting the corpus.
 */
export const RRF_K = 60

export function rrf(lists, k) {
  const score = new Map()
  for (const list of lists) {
    for (let i = 0; i < list.length; i++) {
      score.set(list[i], (score.get(list[i]) ?? 0) + 1 / (RRF_K + i + 1))
    }
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, k)
    .map(([id]) => id)
}

/* --------------------------------------------------------------- metrics */

/** Fraction of the returned list that is relevant. */
export function precisionAt(ret, rel, k) {
  if (!ret.length) return 0
  const top = ret.slice(0, k)
  return top.filter((id) => rel.has(id)).length / top.length
}

/** Fraction of the relevant set that was returned. */
export function recallAt(ret, rel, k) {
  if (!rel.size) return 1
  const top = ret.slice(0, k)
  return top.filter((id) => rel.has(id)).length / rel.size
}

/** Reciprocal of the rank of the first relevant result. */
export function reciprocalRank(ret, rel) {
  for (let i = 0; i < ret.length; i++) if (rel.has(ret[i])) return 1 / (i + 1)
  return 0
}

/** Binary-gain nDCG. Ideal DCG assumes every relevant item could have been ranked first. */
export function ndcgAt(ret, rel, k) {
  if (!rel.size) return 1
  let dcg = 0
  const top = ret.slice(0, k)
  for (let i = 0; i < top.length; i++) if (rel.has(top[i])) dcg += 1 / Math.log2(i + 2)
  let idcg = 0
  for (let i = 0; i < Math.min(rel.size, k); i++) idcg += 1 / Math.log2(i + 2)
  return idcg === 0 ? 0 : dcg / idcg
}

/** F1 over the top-k set. */
export function f1At(ret, rel, k) {
  const p = precisionAt(ret, rel, k)
  const r = recallAt(ret, rel, k)
  return p + r === 0 ? 0 : (2 * p * r) / (p + r)
}

export function scoreOne(returned, relevantIds, k) {
  const rel = new Set(relevantIds)
  return {
    p: precisionAt(returned, rel, k),
    r: recallAt(returned, rel, k),
    f1: f1At(returned, rel, k),
    mrr: reciprocalRank(returned, rel),
    ndcg: ndcgAt(returned, rel, k),
  }
}

/* ------------------------------------------------------------ preparation */

/**
 * Referential closure over a memory set.
 *
 * `superseded_by` is a self-reference, so any subset of a corpus can contain a
 * pointer to a row outside it. The relational arms refuse such a set — correctly,
 * that is what a foreign key is for — while the file arms would happily store
 * the dangling pointer and return a broken answer later.
 *
 * Rather than let that difference decide the experiment, the dangling pointers
 * are cleared here, once, before any engine sees the data. Every arm therefore
 * loads exactly the same rows. The fact that only some arms would have caught
 * the problem is reported in §6.8 instead of being smuggled into the scores.
 */
export function referentialClosure(memories) {
  const present = new Set(memories.map((m) => m.id))
  let cleared = 0
  const out = memories.map((m) => {
    if (m.supersededBy && !present.has(m.supersededBy)) {
      cleared++
      return { ...m, supersededBy: null }
    }
    return m
  })
  return { memories: out, cleared }
}

/* ------------------------------------------------------------ predicates */

/**
 * The reference semantics of a structural predicate, applied in plain JS.
 * Engines that support predicates must agree with this; engines that do not
 * simply never call it. Having one definition means "correct" is the same
 * target for every arm.
 */
export function applyPredicate(rows, predicate) {
  if (!predicate) return rows
  switch (predicate.op) {
    case '<=': return rows.filter((m) => m[predicate.field] <= predicate.value)
    case '>=': return rows.filter((m) => m[predicate.field] >= predicate.value)
    case '=': return rows.filter((m) => m[predicate.field] === predicate.value)
    case 'is null': return rows.filter((m) => m[predicate.field] == null)
    case 'count': return rows.filter((m) => m.factId === predicate.value)
    default: return rows
  }
}

/* --------------------------------------------------------------- timing */

/** Median of n timed runs. Medians, not means: one GC pause should not set the number. */
export async function timed(fn, runs = 1) {
  const samples = []
  let last
  for (let i = 0; i < runs; i++) {
    const t = process.hrtime.bigint()
    last = await fn()
    samples.push(Number(process.hrtime.bigint() - t) / 1e6)
  }
  samples.sort((a, b) => a - b)
  return { value: last, ms: samples[Math.floor(samples.length / 2)], samples }
}

export function percentile(xs, p) {
  if (!xs.length) return 0
  const a = xs.slice().sort((x, y) => x - y)
  const i = Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1))
  return a[i]
}

export const DEFAULT_K = 10
