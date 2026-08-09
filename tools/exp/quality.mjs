/**
 * Retrieval quality, and the validation that makes it mean anything.
 *
 * Two experiments live here because the second is worthless without the first.
 *
 * `validateCorpus` checks that the query classes actually have the properties
 * the design claims: that lexical queries share rare tokens with their targets
 * and semantic ones do not, and that the semantic pairs really are close in
 * embedding space. If those did not hold, a lexical-versus-vector result would
 * be measuring nothing. The paper reports these numbers in the methodology
 * rather than asserting the design worked.
 *
 * `runQuality` then scores every engine on every query, broken down by class.
 */

import { tokenize, rareTerms, scoreOne, percentile, cosine, DEFAULT_K } from '../../engines/contract.mjs'

/**
 * A true identifier: the minted keys of the world model. Distinct from
 * `rareTerms`, which also catches ordinary hyphenated words like `checkout-7`.
 * The design claim — that semantic queries share no identifier with their
 * targets while lexical ones do — is only meaningful against this stricter test.
 */
const ID_RE = /^(svc|cfg|inc|adr|run|per|repo|[ms])-\d+$/
export const identifiers = (s) => tokenize(s).filter((t) => ID_RE.test(t))

/* ------------------------------------------------------- corpus validation */

export function validateCorpus(corpus, embed) {
  const byId = new Map(corpus.memories.map((m) => [m.id, m]))
  const classes = [...new Set(corpus.queries.map((q) => q.class))]
  const rows = []

  for (const cls of classes) {
    const qs = corpus.queries.filter((q) => q.class === cls)
    let overlapSum = 0, cosSum = 0, n = 0, rareSum = 0, idSum = 0, idPairs = 0
    for (const q of qs) {
      const qTerms = new Set(tokenize(q.text))
      const qRare = new Set(rareTerms(q.text))
      const qIds = new Set(identifiers(q.text))
      const qv = embed.get(q.text)
      for (const id of q.relevant) {
        const m = byId.get(id)
        if (!m) continue
        const mTerms = new Set(tokenize(m.body))
        const mRare = new Set(rareTerms(m.body))
        const mIds = new Set(identifiers(m.body))
        let hit = 0
        for (const t of qTerms) if (mTerms.has(t)) hit++
        overlapSum += qTerms.size ? hit / qTerms.size : 0
        let rhit = 0
        for (const t of qRare) if (mRare.has(t)) rhit++
        rareSum += qRare.size ? rhit / qRare.size : 0
        if (qIds.size) {
          let ihit = 0
          for (const t of qIds) if (mIds.has(t)) ihit++
          idSum += ihit / qIds.size
          idPairs++
        }
        cosSum += cosine(embed.get(m.body), qv)
        n++
      }
    }
    rows.push({
      class: cls,
      queries: qs.length,
      pairs: n,
      meanTermOverlap: n ? Number((overlapSum / n).toFixed(4)) : 0,
      meanRareTermOverlap: n ? Number((rareSum / n).toFixed(4)) : 0,
      // The one that matters: does the query name the target by its key?
      meanIdentifierOverlap: idPairs ? Number((idSum / idPairs).toFixed(4)) : 0,
      queriesCarryingIdentifier: qs.filter((q) => identifiers(q.text).length > 0).length,
      meanCosine: n ? Number((cosSum / n).toFixed(4)) : 0,
      meanRelevantPerQuery: qs.length
        ? Number((qs.reduce((s, q) => s + q.relevant.length, 0) / qs.length).toFixed(2)) : 0,
      similarityExpressible: qs[0]?.similarityExpressible ?? false,
      rationale: qs[0]?.rationale ?? '',
    })
  }

  // A random-pair baseline for cosine, so "0.62 is high" is a claim with a
  // reference rather than an intuition.
  let base = 0
  const N = 400
  for (let i = 0; i < N; i++) {
    const a = corpus.memories[(i * 7919) % corpus.memories.length]
    const b = corpus.memories[(i * 104729 + 13) % corpus.memories.length]
    const av = embed.get(a.body), bv = embed.get(b.body)
    let d = 0
    for (let j = 0; j < av.length; j++) d += av[j] * bv[j]
    base += d
  }

  return { byClass: rows, randomPairCosine: Number((base / N).toFixed(4)), randomPairs: N }
}

/* ------------------------------------------------------ failure forensics */

/**
 * Why dense retrieval fails on an identifier query.
 *
 * A score of "approximately zero" invites the reader to assume a bug, so this
 * records the whole picture for a handful of queries: where the first genuinely
 * relevant memory ranked, what the embedding preferred instead, and the cosine
 * of each. The pattern it exposes is the argument — the top hit is a memory
 * that shares the query's *shape* ("looked something up, it was unrelated")
 * while the memory that actually answers the question sits hundreds of rows
 * down, because a few subword pieces of a key do not survive mean pooling into
 * 384 dimensions.
 */
export function probeDenseFailure(memories, queries, embed, { cls = 'lexical', samples = 6, dim = 384 } = {}) {
  const vecs = new Float32Array(memories.length * dim)
  memories.forEach((m, i) => vecs.set(embed.get(m.body), i * dim))

  const out = []
  for (const q of queries.filter((x) => x.class === cls).slice(0, samples)) {
    const e = embed.get(q.text)
    const scored = memories.map((m, i) => {
      let d = 0
      const o = i * dim
      for (let j = 0; j < dim; j++) d += vecs[o + j] * e[j]
      return { d, m }
    })
    scored.sort((a, b) => b.d - a.d)
    const rel = new Set(q.relevant)
    const firstRank = scored.findIndex((s) => rel.has(s.m.id)) + 1
    const best = scored.find((s) => rel.has(s.m.id))
    out.push({
      query: q.text,
      corpusSize: memories.length,
      relevantCount: q.relevant.length,
      firstRelevantRank: firstRank,
      firstRelevantPercentile: Number(((firstRank / memories.length) * 100).toFixed(2)),
      topCosine: Number(scored[0].d.toFixed(4)),
      bestRelevantCosine: best ? Number(best.d.toFixed(4)) : null,
      topBody: scored[0].m.body,
      topIsDistractor: scored[0].m.factId === null,
      relevantBody: best?.m.body ?? '',
    })
  }
  return {
    class: cls,
    samples: out,
    topIsDistractorRate: Number((out.filter((o) => o.topIsDistractor).length / out.length).toFixed(3)),
    medianFirstRelevantRank: percentile(out.map((o) => o.firstRelevantRank), 50),
  }
}

/* --------------------------------------------------------- quality sweep */

export async function runQuality(engine, queries, { k = DEFAULT_K, repeats = 3 } = {}) {
  const perQuery = []
  const latencies = []

  for (const q of queries) {
    // Warm once so the first query of each engine does not carry the cost of
    // whatever the engine lazily initialises, then take the median of `repeats`.
    let ids = []
    let extra = {}
    const samples = []
    for (let i = 0; i <= repeats; i++) {
      const t = process.hrtime.bigint()
      const res = await engine.recall({ ...q, k })
      const ms = Number(process.hrtime.bigint() - t) / 1e6
      if (i > 0) samples.push(ms)
      ids = res.ids
      extra = res
    }
    samples.sort((a, b) => a - b)
    const ms = samples[Math.floor(samples.length / 2)]
    latencies.push(ms)

    const s = scoreOne(ids, q.relevant, k)
    let exactCount = null
    if (q.class === 'aggregate' && engine.aggregate) {
      const n = await engine.aggregate(q)
      exactCount = n === q.expectedCount
    } else if (q.class === 'aggregate') {
      exactCount = false
    }

    perQuery.push({
      id: q.id,
      class: q.class,
      ms: Number(ms.toFixed(4)),
      returned: ids.length,
      relevantCount: q.relevant.length,
      ...s,
      exactCount,
      fetched: extra.fetched ?? null,
      survived: extra.survived ?? null,
    })
  }

  const classes = [...new Set(queries.map((q) => q.class))]
  const byClass = classes.map((cls) => {
    const rows = perQuery.filter((r) => r.class === cls)
    const mean = (f) => Number((rows.reduce((s, r) => s + f(r), 0) / rows.length).toFixed(4))
    const aggRows = rows.filter((r) => r.exactCount !== null)
    return {
      class: cls,
      queries: rows.length,
      p: mean((r) => r.p),
      r: mean((r) => r.r),
      f1: mean((r) => r.f1),
      mrr: mean((r) => r.mrr),
      ndcg: mean((r) => r.ndcg),
      meanReturned: mean((r) => r.returned),
      medianMs: Number(percentile(rows.map((r) => r.ms), 50).toFixed(4)),
      exactCountRate: aggRows.length
        ? Number((aggRows.filter((r) => r.exactCount).length / aggRows.length).toFixed(4)) : null,
    }
  })

  const overall = (f) => Number((perQuery.reduce((s, r) => s + f(r), 0) / perQuery.length).toFixed(4))
  return {
    perQuery,
    byClass,
    overall: {
      queries: perQuery.length,
      p: overall((r) => r.p),
      r: overall((r) => r.r),
      f1: overall((r) => r.f1),
      mrr: overall((r) => r.mrr),
      ndcg: overall((r) => r.ndcg),
      p50Ms: Number(percentile(latencies, 50).toFixed(4)),
      p95Ms: Number(percentile(latencies, 95).toFixed(4)),
      p99Ms: Number(percentile(latencies, 99).toFixed(4)),
      maxMs: Number(Math.max(...latencies).toFixed(4)),
    },
  }
}

/* -------------------------------------------------- context-budget sweep */

/**
 * Retrieval is not free at the point of use: everything returned is pasted into
 * a context window and paid for per token. This sweeps k and records both the
 * quality obtained and the tokens spent obtaining it, so §6.9 can plot one
 * against the other instead of reporting quality at a single arbitrary k.
 */
export async function runBudget(engine, queries, tokenLen, ks = [1, 3, 5, 10, 20, 50]) {
  const out = []
  for (const k of ks) {
    let ndcg = 0, rec = 0, tokens = 0, n = 0
    for (const q of queries) {
      const res = await engine.recall({ ...q, k })
      const s = scoreOne(res.ids, q.relevant, k)
      ndcg += s.ndcg
      rec += s.r
      tokens += res.ids.reduce((acc, id) => acc + (tokenLen.get(id) ?? 0), 0)
      n++
    }
    out.push({
      k,
      ndcg: Number((ndcg / n).toFixed(4)),
      recall: Number((rec / n).toFixed(4)),
      meanTokens: Math.round(tokens / n),
    })
  }
  return out
}
