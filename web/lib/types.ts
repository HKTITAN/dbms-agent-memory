/**
 * The shape of `data/capture.json`.
 *
 * Written by tools/capture.mjs and read by every component in the paper. If a
 * figure and a sentence disagree, one of them is not reading this file.
 */

export type Family = 'file' | 'sqlite' | 'postgres'
export type IndexKind = 'none' | 'btree' | 'inverted' | 'vector' | 'hybrid'
export type QueryClass =
  | 'lexical' | 'semantic' | 'temporal' | 'provenance'
  | 'currency' | 'aggregate' | 'negation' | 'hybrid'

export interface Machine {
  cpu: string
  cores: number
  totalMemGB: number
  platform: string
  arch: string
  release: string
}

export interface Toolchain {
  node: string
  sqlite: string
  postgres: string
  pglite: string
  pgvector: string
  embeddingModel: string
  embeddingDim: number
  tokenizer: string
}

export interface ClassValidation {
  class: QueryClass
  queries: number
  pairs: number
  meanTermOverlap: number
  meanRareTermOverlap: number
  meanIdentifierOverlap: number
  queriesCarryingIdentifier: number
  meanCosine: number
  meanRelevantPerQuery: number
  similarityExpressible: boolean
  rationale: string
}

export interface Metrics {
  p: number
  r: number
  f1: number
  mrr: number
  ndcg: number
}

export interface ClassResult extends Metrics {
  class: QueryClass
  queries: number
  meanReturned: number
  medianMs: number
  exactCountRate: number | null
}

export interface OverallResult extends Metrics {
  queries: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
  maxMs: number
}

export interface StorageLine {
  name: string
  kind: 'heap' | 'btree' | 'inverted' | 'vector'
  bytes: number
  pages?: number
}

export interface Storage {
  totalBytes: number
  clusterBytes?: number
  breakdown: StorageLine[]
}

export interface BudgetPoint {
  k: number
  ndcg: number
  recall: number
  meanTokens: number
}

/** What one engine actually returned for one query — the qualitative record. */
export interface ShowcaseEntry {
  queryId: string
  class: QueryClass
  text: string
  relevantCount: number
  returned: Array<{
    rank: number
    id: string
    relevant: boolean
    distractor: boolean | null
    body: string
    sessionId: string | null
    day: number | null
    supersededBy: string | null
  }>
}

export interface PlanRecord {
  class: QueryClass
  query: string
  text: string
  sql: string | null
  plan: unknown
}

export interface EngineResult {
  id: string
  label: string
  short: string
  family: Family
  engine: string
  index: IndexKind
  note: string
  supports: {
    predicates: boolean | 'post'
    joins: boolean
    aggregates: boolean
    transactions: boolean
    vector: boolean | 'scan' | 'hnsw'
  }
  load: { ingestMs: number; indexMs: number }
  quality: {
    perQuery: Array<{ id: string; class: QueryClass; ms: number; returned: number } & Metrics>
    byClass: ClassResult[]
    overall: OverallResult
  }
  storage: Storage
  budget: BudgetPoint[]
  plans: PlanRecord[]
  /** Present from the capture that introduced it; guard before reading. */
  showcase?: ShowcaseEntry[]
  bytesPerMemory: number
  failed?: string
}

export interface SchemaAttr {
  name: string
  type: string
  pk?: boolean
  fk?: string
  nullable?: boolean
  recursive?: boolean
  discriminator?: boolean
  partialKey?: boolean
  partOfNaturalKey?: boolean
}

export interface SchemaEntity {
  name: string
  kind: 'strong' | 'weak' | 'bridge'
  label: string
  blurb: string
  pk: string[]
  naturalKey?: string[]
  partialKey?: string
  identifyingParent?: string
  specialization?: {
    discriminator: string
    disjoint: boolean
    total: boolean
    subtypes: Array<{ name: string; blurb: string }>
  }
  attrs: SchemaAttr[]
}

export interface SchemaRelationship {
  name: string
  from: string
  to: string
  card: '1:1' | '1:N' | 'N:1' | 'M:N'
  label: string
  fromCard: string
  toCard: string
  identifying?: boolean
  recursive?: boolean
  via?: string
  participation?: 'total' | 'partial'
}

export interface NormalizationStep {
  form: string
  relation: string
  violation: string | null
  rule: string
  anomaly: string | null
  fix: string
}

export interface Capture {
  capturedAt: string
  fast: boolean
  machine: Machine
  toolchain: Toolchain
  k: number
  corpus: {
    stats: {
      facts: number
      memories: number
      grounded: number
      distractors: number
      superseded: number
      sessions: number
      queries: number
      byClass: Record<string, number>
      similarityExpressible: number
      bytes: number
      tokens: number
      meanTokensPerMemory: number
    }
    options: Record<string, unknown>
    referentialClosureCleared: number
    validation: {
      byClass: ClassValidation[]
      randomPairCosine: number
      randomPairs: number
    }
    denseFailure?: {
      class: QueryClass
      topIsDistractorRate: number
      medianFirstRelevantRank: number
      samples: Array<{
        query: string
        corpusSize: number
        relevantCount: number
        firstRelevantRank: number
        firstRelevantPercentile: number
        topCosine: number
        bestRelevantCosine: number | null
        topBody: string
        topIsDistractor: boolean
        relevantBody: string
      }>
    }
    queriesUsed: number
    sampleMemories: Array<{
      id: string; sessionId: string; turn: number; kind: string; body: string
      factId: string | null; day: number; source: string; confidence: number
      supersededBy: string | null; tokens: number
    }>
    sampleQueries: Array<{
      id: string; class: QueryClass; text: string; relevantCount: number
      predicate: { field: string; op: string; value: unknown } | null
      similarityExpressible: boolean; rationale: string
    }>
  }
  schema: {
    entities: SchemaEntity[]
    relationships: SchemaRelationship[]
    normalization: NormalizationStep[]
    fds: Array<{ lhs: string; rhs: string; in: string; note?: string }>
    secondaryIndexes: Array<{ name: string; table: string; cols: string[]; serves: string; kind: string }>
    ddl: { sqlite: string[]; postgres: string[] }
  }
  families: Record<Family, { label: string; blurb: string }>
  engines: EngineResult[]
  expressibility: {
    classes: Array<{
      class: QueryClass
      queries: number
      share: number
      similarityExpressible: boolean
      rationale: string
      predicate: { field: string; op: string } | null
      example: string
    }>
    similarityExpressible: number
    total: number
    similarityShare: number
  }
  postFilter: Array<{
    overfetch: number
    fetched: number
    meanSurvivingSlots: number
    slotFillRate: number
    recall: number
    meanMs: number
    scanFraction: number
  }>
  scaling: Array<{
    target: number
    memories: number
    queries: number
    engines: Array<{
      id: string
      ingestMs?: number
      indexMs?: number
      p50Ms?: number
      p95Ms?: number
      ndcg?: number
      recall?: number
      bytes?: number
      bytesPerMemory?: number
      failed?: string
    }>
  }>
  durability: Array<{
    kind: string
    trials: number
    reachedSteadyState: number
    seedRecords: number
    caughtMidWrite: number
    reopenedOk: number
    unreadable: number
    corruptTrials: number
    meanDurable: number
    meanAnnounced: number
    integrity: string | null
    note: string
    runs: Array<{ announced: number; durable: number; reopened: boolean; corrupt: number; bytes: number | null }>
  }>
  concurrency: {
    writers: number
    rounds: number
    results: Record<string, { expected: number; observed: number; lost: number; mechanism: string }>
  }
  anomaly: {
    factsWithRestatements: number
    restatementsPerFact: { mean: number; median: number; p90: number; max: number }
    rowsToUpdate: { normalised: number; denormalisedMean: number; denormalisedMax: number }
    topKRepair: {
      k: number; factsProbed: number; meanReached: number; meanTotal: number; staleFraction: number
    }
    examples: Array<{ factId: string; restatements: number; reachedByTopK: number; stale: number }>
  }
}
