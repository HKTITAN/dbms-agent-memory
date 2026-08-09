/**
 * The single read point for the dataset.
 *
 * Every number in the paper — in prose, in a table, in a chart axis — comes
 * through this module. Components never hold a literal measurement, so a claim
 * in a sentence and the bar next to it cannot drift apart: there is one source
 * and it is a build-time artifact.
 */

import raw from '@/data/capture.json'
import type { Capture, EngineResult, Family, QueryClass } from './types'

export const capture = raw as unknown as Capture

export const getCapture = (): Capture => capture

/* ------------------------------------------------------------- selectors */

export const engines = (): EngineResult[] => capture.engines.filter((e) => !e.failed)

export const engine = (id: string): EngineResult => {
  const e = capture.engines.find((x) => x.id === id)
  if (!e) throw new Error(`no engine "${id}" in capture`)
  return e
}

export const byFamily = (f: Family): EngineResult[] => engines().filter((e) => e.family === f)

export const classes = (): QueryClass[] =>
  capture.expressibility.classes.map((c) => c.class)

export const classMeta = (c: QueryClass) => {
  const m = capture.expressibility.classes.find((x) => x.class === c)
  if (!m) throw new Error(`no query class "${c}"`)
  return m
}

/** nDCG for one engine on one class. */
export const cellNdcg = (e: EngineResult, c: QueryClass): number | null =>
  e.quality.byClass.find((b) => b.class === c)?.ndcg ?? null

export const cellMetric = (e: EngineResult, c: QueryClass, key: 'p' | 'r' | 'f1' | 'mrr' | 'ndcg') =>
  e.quality.byClass.find((b) => b.class === c)?.[key] ?? null

/* --------------------------------------------------------------- summary */

/**
 * The figures the abstract and conclusion quote. Derived, never typed in.
 * `best` is chosen by nDCG so that "the best arm" always names whichever arm
 * actually won this run rather than whichever one won when the prose was
 * written.
 */
export function summarise(c: Capture = capture) {
  const live = c.engines.filter((e) => !e.failed)
  const best = live.reduce((a, b) => (b.quality.overall.ndcg > a.quality.overall.ndcg ? b : a))
  const worst = live.reduce((a, b) => (b.quality.overall.ndcg < a.quality.overall.ndcg ? b : a))

  const vec = c.engines.find((e) => e.id === 'file-vec')!
  const jsonl = c.engines.find((e) => e.id === 'file-jsonl')!
  const fts = c.engines.find((e) => e.id === 'sqlite-fts')!
  const hybrid = c.engines.find((e) => e.id === 'pg-hybrid')!
  const hnsw = c.engines.find((e) => e.id === 'pg-hnsw')!

  const structural = c.expressibility.classes.filter((x) => !x.similarityExpressible)
  const structuralQueries = structural.reduce((s, x) => s + x.queries, 0)

  // How badly the pure-vector arm does on the classes it cannot express, versus
  // the same index once a relational engine applies the predicate for it.
  const meanOn = (e: EngineResult, only: 'structural' | 'similarity') => {
    const want = c.expressibility.classes
      .filter((x) => (only === 'structural' ? !x.similarityExpressible : x.similarityExpressible))
      .map((x) => x.class)
    const rows = e.quality.byClass.filter((b) => want.includes(b.class))
    return rows.reduce((s, b) => s + b.ndcg, 0) / rows.length
  }

  const lostFile = c.concurrency.results.file
  const rewrite = c.durability.find((d) => d.kind === 'file-rewrite')
  const append = c.durability.find((d) => d.kind === 'file-append')
  const sqliteDur = c.durability.find((d) => d.kind === 'sqlite')
  const pgDur = c.durability.find((d) => d.kind === 'postgres')

  return {
    memories: c.corpus.stats.memories,
    facts: c.corpus.stats.facts,
    sessions: c.corpus.stats.sessions,
    tokens: c.corpus.stats.tokens,
    queries: c.corpus.queriesUsed,
    classCount: c.expressibility.classes.length,
    engines: live.length,
    k: c.k,

    best,
    worst,
    bestNdcg: best.quality.overall.ndcg,
    worstNdcg: worst.quality.overall.ndcg,

    similarityExpressible: c.expressibility.similarityExpressible,
    similarityShare: c.expressibility.similarityShare,
    structuralQueries,
    structuralShare: Number((structuralQueries / c.expressibility.total).toFixed(4)),
    structuralClasses: structural.map((x) => x.class),

    vecLexicalNdcg: cellNdcg(vec, 'lexical' as QueryClass) ?? 0,
    ftsLexicalNdcg: cellNdcg(fts, 'lexical' as QueryClass) ?? 0,
    vecStructuralMean: Number(meanOn(vec, 'structural').toFixed(4)),
    hnswStructuralMean: Number(meanOn(hnsw, 'structural').toFixed(4)),
    hybridStructuralMean: Number(meanOn(hybrid, 'structural').toFixed(4)),

    denseFirstRank: c.corpus.denseFailure?.medianFirstRelevantRank ?? null,
    denseDistractorRate: c.corpus.denseFailure?.topIsDistractorRate ?? null,

    ftsP50: fts.quality.overall.p50Ms,
    jsonlP50: jsonl.quality.overall.p50Ms,
    scanSpeedup: Number((jsonl.quality.overall.p50Ms / fts.quality.overall.p50Ms).toFixed(1)),

    bytesFts: fts.bytesPerMemory,
    bytesHybrid: hybrid.bytesPerMemory,
    vectorOverhead: Number((hybrid.bytesPerMemory / fts.bytesPerMemory).toFixed(1)),

    lostUpdates: lostFile.lost,
    lostUpdatePct: Number(((lostFile.lost / lostFile.expected) * 100).toFixed(1)),
    rewriteUnreadable: rewrite?.unreadable ?? 0,
    rewriteTrials: rewrite?.trials ?? 0,
    appendUnreadable: append?.unreadable ?? 0,
    sqliteUnreadable: sqliteDur?.unreadable ?? 0,
    pgUnreadable: pgDur?.unreadable ?? 0,

    restatementsMean: c.anomaly.restatementsPerFact.mean,
    restatementsMax: c.anomaly.restatementsPerFact.max,
    staleAfterRepair: Number((c.anomaly.topKRepair.staleFraction * 100).toFixed(1)),

    postFilterFillAt1: Number(((c.postFilter[0]?.slotFillRate ?? 0) * 100).toFixed(1)),
    postFilterBest: c.postFilter[c.postFilter.length - 1],

    exactCountEngines: live.filter((e) =>
      e.quality.byClass.find((b) => b.class === 'aggregate')?.exactCountRate === 1).length,

    captured: c.capturedAt.slice(0, 10),
  }
}

/* ------------------------------------------------------------ formatting */

export const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`

export const bytes = (n: number) => {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export const ms = (n: number) => (n < 1 ? `${n.toFixed(2)} ms` : n < 100 ? `${n.toFixed(1)} ms` : `${Math.round(n)} ms`)

export const num = (n: number) => n.toLocaleString('en-US')

/** The palette index a family maps to, so colour means the same thing everywhere. */
export const familyTone: Record<Family, string> = {
  file: 'var(--data-1)',
  sqlite: 'var(--data-3)',
  postgres: 'var(--data-4)',
}

export const indexTone: Record<string, string> = {
  none: 'var(--data-1)',
  btree: 'var(--data-2)',
  inverted: 'var(--data-3)',
  vector: 'var(--data-1)',
  hybrid: 'var(--data-4)',
}
