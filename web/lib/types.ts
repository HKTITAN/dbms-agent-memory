/**
 * The shape of `data/capture.json`.
 *
 * The harness writes this file and the paper reads it. Typing it here is the
 * only guard against the two drifting: if the harness stops emitting a field the
 * prose depends on, the build fails rather than the page rendering `undefined`
 * where a number should be.
 */

export interface Machine {
  platform: string
  arch: string
  cpu: string
  cores: number
  memoryGb: number
}

export interface Toolchain {
  node: string
  pglite: string | null
  sqlite: string
  commit: string | null
}

export interface VaultDatabase {
  name: string
  icon: string
  title: string
  entity: string
}

export interface Subject {
  name: string
  repo: string
  vendor: string
  license: string
  substrate: string
  databases: VaultDatabase[]
  predicates: { generic: string[]; profile: string[]; system: string[]; legacy: string[] }
  surfaces: string[]
}

export interface ApiLimits {
  pageSizeDefault: number
  pageSizeMax: number
  requestsPerSecond: number
  richTextChars: number
  relationPages: number
  multiSelectOptions: number
  payloadBytes: number
  blocksPerRequest: number
  searchMatches: string
  conditionalWrites: string
  joins: string
  aggregates: string
  sources: Record<string, string>
}

export interface Attr {
  name: string
  type: 'text' | 'integer' | 'real'
  pk?: boolean
  fk?: string
  nullable?: boolean
  notion?: string
  lore?: string
  domain?: string[]
  title?: boolean
  discriminator?: boolean
  system?: boolean
  derived?: boolean
  modelled?: boolean
  recursive?: boolean
  repeatingGroup?: boolean
  temporal?: 'valid' | 'transaction'
  subtypeOnly?: string
  cardinality?: string
  note?: string
}

export interface Subtype { name: string; blurb: string; own: string[] }

export interface EntityDef {
  name: string
  db: string
  kind: 'strong' | 'bridge'
  label: string
  blurb: string
  pk: string[]
  attrs: Attr[]
  specialization?: {
    discriminator: string
    disjoint: boolean
    total: boolean
    subtypes: Subtype[]
  }
  derivedFrom?: { entity: string; attr: string; notion: string; synthetic?: boolean }
}

export interface RelationshipDef {
  name: string
  from: string
  to: string
  card: string
  label: string
  fromCard: string
  toCard: string
  participation?: string
  via?: string
  recursive?: boolean
  weakSide?: boolean
  synthetic?: boolean
  note?: string
}

export interface NormalizationStep {
  form: string
  relation: string
  violation: string | null
  rule: string
  anomaly: string | null
  fix: string
  survives?: boolean
  surviveNote?: string
  citation?: string
}

export interface Fd {
  lhs: string
  rhs: string
  in: string
  violation?: string
  note?: string
}

export interface Invariant {
  id: string
  statement: string
  declarative: string
  enforcedBy: string
  breaks: string
  admitted?: string
}

export interface IndexDef {
  name: string
  table: string
  cols: string[]
  serves: string
  kind: string
}

export interface SchemaBlock {
  entities: EntityDef[]
  relationships: RelationshipDef[]
  normalization: NormalizationStep[]
  fds: Fd[]
  invariants: Invariant[]
  indexes: IndexDef[]
  notionTypes: Record<string, { label: string; limit: number | null; note: string }>
  source: {
    repo: string
    commit: string
    commitDate: string
    version: string
    license: string
    schemaFile: string
    files: { path: string; why: string }[]
  }
  propertyCounts: Record<string, {
    total: number
    modelled: number
    relations: number
    derived: number
    systemManaged: number
  }>
  confidenceModel: {
    seed: Record<string, number>
    bumpRate: number
    decrementFactor: number
    decayRate: number
    staleGraceDays: number
    retrievalFactor: number
    retrievalNote: string
  }
  scanCaps: { name: string; value: number; where: string; note: string }[]
  functionalPredicates: string[]
  agentWritablePredicates: string[]
  ddl: { sqlite: string[]; postgres: string[] }
  extraConstraints: {
    sqlite: { id: string; sql: string; note?: string }[]
    postgres: { id: string; sql: string; note?: string }[]
  }
}

export interface QuestionClass {
  id: string
  label: string
  surface: string
  algebra: string[]
  needsJoin: boolean
  needsAggregate: boolean
  needsRecursion: boolean
  notion: 'expressible' | 'partial' | 'client-side join' | 'not expressible'
  blurb: string
}

export interface ArmReport {
  id: string
  family: string
  label: string
  blurb: string
  emulated: boolean
  loadMs: number
  loadInfo: unknown
}

export interface Agg {
  n: number
  f1: number
  exact: number
  precision: number
  recall: number
  roundTrips: number
  roundTripsMedian: number
  roundTripsP95: number
  roundTripsMax: number
  bytesIn: number
  rowsClientSide: number
  rateLimitFloorMs: number
  ms: number
}

export interface Amplification {
  roundTrips: number
  bytesIn: number
  rowsClientSide: number
  notionRoundTrips: number
  sqlStatements: number
  notionFloorSeconds: number
}

export interface Row {
  arm: string
  q: string
  class: string
  ms: number
  expected: number
  returned: number
  p: number
  r: number
  f1: number
  exact: number
  tp: number
  fp: number
  fn: number
  roundTrips: number
  bytesIn: number
  bytesOut: number
  rowsReturned: number
  rowsClientSide: number
  unsupported: string[]
}

export interface Experiments {
  dangling: {
    archivedMemories: number
    citedByFacts: number
    notion: { danglingPointers: number; detectedAtWriteTime: number; refusedWrites: number; note: string }
    sql: { refusedWrites: number; allowedWrites: number; danglingPointers: number; note: string }
  }
  concurrency: {
    writers: number
    rounds: number
    writesAttempted: number
    notion: { rows: number; duplicateRows: number; lostUpdates: number; lostUpdateRate: number; note: string }
    sql: { rows: number; duplicateRows: number; lostUpdates: number; lostUpdateRate: number; note: string }
  }
  concurrencySweep: {
    writers: number
    notionLostUpdateRate: number
    notionDuplicateRows: number
    sqlLostUpdateRate: number
  }[]
  temporal: {
    functionalFacts: number
    trueConflictPairs: number
    trueConflictKeys: number
    injectedOverlaps: number
    notion: { rejectedWrites: number; contradictionsAdmitted: number; detection: string; note: string }
    postgres: {
      addConstraintToExistingVault: { created: boolean; error: string | null; detail: string | null }
      insertedUnderConstraint: { accepted: number; rejected: number; rowsHeld: number }
      rejectedKeys: number
      detection: string
      note: string
    }
  }
  resolution: {
    duplicatePairs: number
    entities: number
    duplicateRate: number
    factsOnCanonical: number
    factsOnDuplicate: number
    splitSubjects: number
    splitExamples: { canonical?: string; duplicate?: string; onCanonical: number; onDuplicate: number }[]
    contestedAliases: number
    duplicateNames: number
    staleSubjectStrings: number
    staleSubjectRate: number
    merge: {
      pageUpdatesPerMerge: number
      maxPageUpdates: number
      totalPageUpdates: number
      sqlStatements: number
      note: string
    }
  }
  anomaly: {
    closedFacts: number
    staleRestatements: number
    meanPerClosedFact: number
    medianWhenPresent: number
    p95WhenPresent: number
    factsWhoseStaleCopiesFillTopK: number
    restatementMean: number
    restatementMax: number
    note: string
  }
  alias: {
    terms: number
    exactMatches: number
    candidatesFetched: number
    rowsFetchedAndDiscarded: number
    overMatchRatio: number
    wastedShare: number
    worstTerms: { term: string; candidates: number; exact: number; wasted: number }[]
    contestedAliases: number
    collidingInjected: number
    sql: { rowsFetched: number; note: string }
  }
  bitemporal: {
    facts: number
    withValidTime: number
    closedIntervals: number
    retractionsLaggingReality: number
    lagDaysMedian: number
    lagDaysP95: number
    writtenDownAfterBecomingTrue: number
    observationLagMedian: number
    disagreements: { day: number; rowsWhereAxesDisagree: number; share: number }[]
    note: string
  }
  fulltext: {
    terms: {
      term: string
      lexemes: string
      substring: number
      fts5: number
      gin: number
      notionTitleSearch: number
      fts5VsSubstring: number
      ginVsSubstring: number
      ginVsFts5: number
    }[]
    termsWhereIndexesDisagree: number
    termsTotal: number
    worst: { term: string; substring: number; fts5: number; gin: number } | null
    notionReachesBodies: boolean
    note: string
  }
  wakeup: {
    config: { recentMemories: number; activeFacts: number; openTasks: number; digestWindowDays: number }
    rps: number
    points: {
      fraction: number
      memories: number
      facts: number
      notion: {
        roundTrips: number
        bytesIn: number
        rateLimitFloorMs: number
        injectedChars: number
        injectedTokensApprox: number
      }
      sqlite: { statements: number; ms: number; injectedChars: number; injectedTokensApprox: number }
    }[]
  }
  ceiling: {
    titleOnly: { requests: number; note: string }
    now: CeilingPoint
    x10: CeilingPoint
    x100: CeilingPoint
    invertedIndex: { requests: number; note: string }
  }
  storage: {
    memories: number
    bodyBytes: number
    memoryPropertyBytes: number
    factBytes: number
    entityBytes: number
    bytesPerMemory: number
    bytesPerFact: number
    note: string
  }
  limits: {
    richTextLimit: number
    relationLimit: number
    longestBody: number
    medianBody: number
    bodiesOverRichTextLimit: number
    maxRelationsPerMemory: number
    maxFactsPerSourceMemory: number
    note: string
  }
}

export interface CeilingPoint {
  rows: number
  listRequests: number
  bodyRequests: number
  totalRequests: number
  floorSeconds: number
  floorMinutes: number
  bytesTransferred: number
}

export interface VaultStats {
  projects: number
  topics: number
  memories: number
  archivedMemories: number
  memoryTags: number
  entities: number
  aliases: number
  facts: number
  sessions: number
  questions: number
  restatementMean: number
  restatementMax: number
  predicates: Record<string, number>
  kinds: Record<string, number>
  systemPredicateShare: number
  openIntervals: number
  closedIntervals: number
  aliasCells: number
  aliasesPerCell: number
  bodyChars: number
  confidenceMean: number
}

export interface Capture {
  capturedAt: string
  durationMs: number
  machine: Machine
  toolchain: Toolchain
  runs: number
  subject: Subject
  apiLimits: ApiLimits
  vault: VaultStats
  vaultMeta: { seed: number; scale: number; generatedAt: string; days: number }
  injected: {
    duplicateEntities: { canonical: string; duplicate: string; key: string }[]
    staleSubjectFacts: string[]
    overlappingIntervals: string[]
    danglingProvenance: string[]
    collidingAliases: { entity_id: string; base: string; extended: string }[]
    distractorMemories: number
  }
  schema: SchemaBlock
  workload: {
    classes: QuestionClass[]
    instances: number
    perClass: Record<string, number>
    emptyAnswers: number
  }
  families: Record<string, { label: string; blurb: string; emulated: boolean }>
  arms: ArmReport[]
  byArm: Record<string, Agg>
  byArmClass: Record<string, Record<string, Agg | null>>
  amplification: Record<string, Amplification>
  expressibility: {
    byClass: Record<string, number>
    byInstance: Record<string, number>
    classes: number
    instances: number
    shareNeedingMoreThanFilter: number
    shareNeedingJoin: number
    shareNeedingAggregate: number
    shareNeedingRecursion: number
  }
  plans: Record<string, Record<string, unknown>>
  experiments: Experiments
  rows: Row[]
}
