/**
 * The logical model, declared once.
 *
 * The entity-relationship diagram in §4, the DDL executed by the SQLite and
 * Postgres arms, and the normalization argument in §5 all read this file. They
 * cannot drift apart, because there is only one description of the schema and
 * everything else is generated from it. If the diagram shows a foreign key, a
 * foreign key was created; if it shows a cardinality, the loader enforced it.
 *
 * Design notes that matter for the paper:
 *
 *  - MEMORY is a *weak entity*. A memory has no identity outside the session
 *    that produced it: its natural key is (session_id, turn_no), and turn_no is
 *    the partial key. We carry a surrogate id as well because every engine needs
 *    a stable handle for scoring, but the natural key is the real one.
 *
 *  - MEMORY carries a *disjoint, total specialization* on `kind` into episodic,
 *    semantic and procedural memory — the standard tripartite division from the
 *    cognitive-architecture literature, which lands in the relational model as a
 *    single-table specialization with a discriminator.
 *
 *  - SUPERSEDES is a *recursive* relationship on MEMORY, and it is the one the
 *    similarity-only architectures cannot see. It is what makes "the current
 *    answer" different from "the closest text".
 */

/* ------------------------------------------------------------- attributes */

const A = (name, type, opts = {}) => ({ name, type, ...opts })

export const ENTITIES = [
  {
    name: 'agent',
    kind: 'strong',
    label: 'AGENT',
    blurb: 'The model instance that owns a body of memory.',
    pk: ['agent_id'],
    attrs: [
      A('agent_id', 'text', { pk: true }),
      A('model', 'text'),
      A('family', 'text'),
    ],
  },
  {
    name: 'session',
    kind: 'strong',
    label: 'SESSION',
    blurb: 'One continuous run of the agent. Memories are written inside a session.',
    pk: ['session_id'],
    attrs: [
      A('session_id', 'text', { pk: true }),
      A('agent_id', 'text', { fk: 'agent.agent_id' }),
      A('started_day', 'integer'),
    ],
  },
  {
    name: 'entity',
    kind: 'strong',
    label: 'ENTITY',
    blurb: 'A thing the world contains: a service, an incident, a person, a config record.',
    pk: ['entity_id'],
    attrs: [
      A('entity_id', 'text', { pk: true }),
      A('entity_kind', 'text'),
      A('display_name', 'text'),
    ],
  },
  {
    name: 'fact',
    kind: 'strong',
    label: 'FACT',
    blurb: 'The atom of truth a memory is a restatement of. Ground truth is defined here.',
    pk: ['fact_id'],
    attrs: [
      A('fact_id', 'text', { pk: true }),
      A('subject_id', 'text', { fk: 'entity.entity_id' }),
      A('predicate', 'text'),
      A('object_value', 'text'),
      A('memory_kind', 'text'),
      A('valid_from_day', 'integer'),
    ],
  },
  {
    name: 'memory',
    kind: 'weak',
    label: 'MEMORY',
    blurb: 'One thing the agent wrote down. Existence-dependent on its session.',
    pk: ['memory_id'],
    naturalKey: ['session_id', 'turn_no'],
    partialKey: 'turn_no',
    identifyingParent: 'session',
    specialization: {
      discriminator: 'kind',
      disjoint: true,
      total: true,
      subtypes: [
        { name: 'episodic', blurb: 'Something that happened, tied to a time and a session.' },
        { name: 'semantic', blurb: 'A standing fact about the world, time-independent.' },
        { name: 'procedural', blurb: 'An ordered way of doing something.' },
      ],
    },
    attrs: [
      A('memory_id', 'text', { pk: true }),
      A('session_id', 'text', { fk: 'session.session_id', partOfNaturalKey: true }),
      A('turn_no', 'integer', { partialKey: true }),
      A('seq', 'integer'),
      A('kind', 'text', { discriminator: true }),
      A('body', 'text'),
      A('fact_id', 'text', { fk: 'fact.fact_id', nullable: true }),
      A('created_day', 'integer'),
      A('source', 'text'),
      A('confidence', 'real'),
      A('superseded_by', 'text', { fk: 'memory.memory_id', nullable: true, recursive: true }),
    ],
  },
  {
    name: 'memory_entity',
    kind: 'bridge',
    label: 'MEMORY_ENTITY',
    blurb: 'Resolves the many-to-many between what a memory says and what it is about.',
    pk: ['memory_id', 'entity_id'],
    attrs: [
      A('memory_id', 'text', { pk: true, fk: 'memory.memory_id' }),
      A('entity_id', 'text', { pk: true, fk: 'entity.entity_id' }),
    ],
  },
  {
    name: 'embedding',
    kind: 'strong',
    label: 'EMBEDDING',
    blurb: 'The vector for a memory. One-to-one, and separated so the model can change without touching the memory.',
    pk: ['memory_id'],
    attrs: [
      A('memory_id', 'text', { pk: true, fk: 'memory.memory_id' }),
      A('model', 'text'),
      A('dim', 'integer'),
      A('vec', 'vector'),
    ],
  },
]

/* ---------------------------------------------------------- relationships */

export const RELATIONSHIPS = [
  { name: 'runs', from: 'agent', to: 'session', card: '1:N', label: 'runs', fromCard: '1', toCard: 'N', participation: 'total' },
  { name: 'records', from: 'session', to: 'memory', card: '1:N', label: 'records', fromCard: '1', toCard: 'N', identifying: true, participation: 'total' },
  { name: 'restates', from: 'memory', to: 'fact', card: 'N:1', label: 'restates', fromCard: 'N', toCard: '1', participation: 'partial' },
  { name: 'concerns', from: 'memory', to: 'entity', card: 'M:N', label: 'concerns', fromCard: 'M', toCard: 'N', via: 'memory_entity' },
  { name: 'about', from: 'fact', to: 'entity', card: 'N:1', label: 'about', fromCard: 'N', toCard: '1', participation: 'total' },
  { name: 'supersedes', from: 'memory', to: 'memory', card: '1:N', label: 'supersedes', fromCard: '1', toCard: 'N', recursive: true, participation: 'partial' },
  { name: 'vectorises', from: 'memory', to: 'embedding', card: '1:1', label: 'vectorises', fromCard: '1', toCard: '1', participation: 'total' },
]

/* ---------------------------------------- functional dependencies and NFs */

/**
 * The unnormalised starting point is the shape the file baselines actually
 * store: one self-contained record per memory, with the session, the agent, the
 * entity list and the restated fact all inlined. Each step below removes one
 * class of anomaly, and §6.7 measures the anomaly the unnormalised form leaves
 * behind.
 */
export const NORMALIZATION = [
  {
    form: 'UNF',
    relation: 'memory_blob(memory_id, session_id, turn_no, agent_model, session_day, body, entities[], fact_text, fact_id, source, confidence)',
    violation: 'entities[] is a repeating group held inside one attribute.',
    rule: 'A relation is in 1NF when every attribute holds a single atomic value.',
    anomaly: 'You cannot ask "which memories mention SVC-4470" without parsing an array in application code, so the DBMS cannot index it.',
    fix: 'Project the repeating group into MEMORY_ENTITY, keyed by (memory_id, entity_id).',
  },
  {
    form: '1NF',
    relation: 'memory_flat(memory_id, session_id, turn_no, agent_model, session_day, body, fact_text, fact_id, source, confidence)',
    violation: 'session_day depends on session_id alone, which is only part of the natural key (session_id, turn_no).',
    rule: 'A relation is in 2NF when no non-prime attribute is partially dependent on a candidate key.',
    anomaly: 'A session\'s date is restated on every memory it produced. Correcting it means rewriting every row, and missing one splits the session in two.',
    fix: 'Move session_day into SESSION.',
  },
  {
    form: '2NF',
    relation: 'memory_2nf(memory_id, session_id, turn_no, agent_model, body, fact_text, fact_id, source, confidence)',
    violation: 'memory_id → session_id → agent_model is a transitive dependency.',
    rule: 'A relation is in 3NF when no non-prime attribute is transitively dependent on a candidate key.',
    anomaly: 'The agent model is stored once per memory rather than once per session. It cannot be corrected atomically, and a session with no memories cannot record which model ran it at all.',
    fix: 'Move agent_model into AGENT and reference it from SESSION.',
  },
  {
    form: '3NF',
    relation: 'memory_3nf(memory_id, session_id, turn_no, body, fact_text, fact_id, source, confidence)',
    violation: 'fact_id → fact_text, and fact_id is not a superkey of MEMORY.',
    rule: 'A relation is in BCNF when every determinant is a candidate key.',
    anomaly: 'This is the one that hurts an agent. The same fact is restated across many memories; when the fact changes, every restatement is now a claim the agent will retrieve and believe. §6.7 measures how many contradictions this produces.',
    fix: 'Move fact_text into FACT and leave MEMORY holding only the reference.',
  },
  {
    form: 'BCNF',
    relation: 'memory(memory_id, session_id, turn_no, seq, kind, body, fact_id, created_day, source, confidence, superseded_by)',
    violation: null,
    rule: 'Every determinant is a candidate key.',
    anomaly: null,
    fix: 'This is the schema the SQLite and Postgres arms were measured on.',
  },
]

export const FDS = [
  { lhs: 'memory_id', rhs: 'session_id, turn_no, seq, kind, body, fact_id, created_day, source, confidence, superseded_by', in: 'memory' },
  { lhs: 'session_id, turn_no', rhs: 'memory_id', in: 'memory', note: 'the natural key of the weak entity' },
  { lhs: 'session_id', rhs: 'agent_id, started_day', in: 'session' },
  { lhs: 'agent_id', rhs: 'model, family', in: 'agent' },
  { lhs: 'fact_id', rhs: 'subject_id, predicate, object_value, memory_kind, valid_from_day', in: 'fact' },
  { lhs: 'memory_id', rhs: 'model, dim, vec', in: 'embedding' },
]

/* -------------------------------------------------------------- DDL build */

const SQL_TYPE = {
  sqlite: { text: 'TEXT', integer: 'INTEGER', real: 'REAL', vector: 'BLOB' },
  postgres: { text: 'TEXT', integer: 'INTEGER', real: 'REAL', vector: 'VECTOR(384)' },
}

/** Table DDL for one dialect, generated from ENTITIES so it cannot diverge. */
export function ddl(dialect, { vector = true } = {}) {
  const t = SQL_TYPE[dialect]
  const out = []
  for (const e of ENTITIES) {
    if (e.name === 'embedding' && !vector) continue
    const cols = e.attrs.map((a) => {
      const type = a.type === 'vector' && dialect === 'postgres' ? t.vector : t[a.type]
      const nn = a.nullable ? '' : ' NOT NULL'
      return `  ${a.name} ${type}${nn}`
    })
    cols.push(`  PRIMARY KEY (${e.pk.join(', ')})`)
    for (const a of e.attrs) {
      if (!a.fk || a.pk === undefined) { /* fall through */ }
      if (a.fk) {
        const [rt, rc] = a.fk.split('.')
        if (rt === 'embedding' && !vector) continue
        cols.push(`  FOREIGN KEY (${a.name}) REFERENCES ${rt}(${rc})`)
      }
    }
    out.push(`CREATE TABLE ${e.name} (\n${cols.join(',\n')}\n)`)
  }
  return out
}

/** Secondary indexes. Split out because §6.3 measures the schema with and without them. */
export const SECONDARY_INDEXES = [
  { name: 'ix_memory_session', table: 'memory', cols: ['session_id'], serves: 'provenance', kind: 'btree' },
  { name: 'ix_memory_day', table: 'memory', cols: ['created_day'], serves: 'temporal', kind: 'btree' },
  { name: 'ix_memory_fact', table: 'memory', cols: ['fact_id'], serves: 'aggregate', kind: 'btree' },
  { name: 'ix_memory_superseded', table: 'memory', cols: ['superseded_by'], serves: 'currency, negation', kind: 'btree' },
  { name: 'ix_mement_entity', table: 'memory_entity', cols: ['entity_id'], serves: 'entity lookup', kind: 'btree' },
]

export const TABLE_COUNT = ENTITIES.length
