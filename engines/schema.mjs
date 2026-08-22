/**
 * Lore's vault, declared once as a logical schema.
 *
 * PROVENANCE. Every property name, type and enumeration below was read from
 * `src/notion/schema.ts` in makenotion/lore at commit 95c3558 (package version
 * 1.0.0, MIT, 4 August 2026). That file calls itself "the single source of truth
 * for every read and write on this database", and it is the source of truth for
 * this one too. Nothing here is inferred from prose.
 *
 * Lore is not a relational system and never claims to be. It creates five Notion
 * databases — Projects, Topics, Memories, Entities, Facts — and stores agent
 * memory as pages in them. "The schema" therefore exists as a TypeScript
 * property catalogue and as the shape the domain services assume, not as DDL.
 * This file restates it in the vocabulary of the relational model, so that it
 * can be analysed with the tools of the relational model and executed on two
 * engines that have them.
 *
 * Everything downstream reads this file and nothing else: the Chen diagram, the
 * DDL the SQLite and PostgreSQL arms execute, the property catalogue the Notion
 * emulator creates, and the normalisation argument with its dependencies. They
 * cannot drift. If the diagram draws a foreign key, a foreign key was created.
 *
 * FIVE MODELLING FACTS CARRY THE PAPER, all of them Lore's own.
 *
 *  1. MEMORY IS A SINGLE-TABLE SPECIALISATION with forty-one properties and a
 *     ten-valued discriminator. A task has `Task State`, `Blocked By` and
 *     `Done At`; a decision has `Alternatives`, `Consequences` and `Decided At`;
 *     a pinned block has `Pinned Priority` and `Mutability`. None of them is
 *     meaningful for the other kinds. Five databases hold at least ten logical
 *     entity types and pay for it in nullable columns.
 *
 *  2. ALIASES ARE A COMMA-JOINED STRING IN ONE CELL. Lore's comment says why,
 *     and the reason is a substrate limitation, not an oversight: "Multi-select
 *     option lists require a schema migration whenever a new alias appears...
 *     every new fact would force a `dataSources.update` round-trip." A repeating
 *     group is stored inside an attribute because normalising it would cost a
 *     schema migration per row. That is a 1NF violation with a documented
 *     rationale, and §7.4 measures what it costs to read back.
 *
 *  3. FACT CARRIES ITS SUBJECT TWICE. `Subject` is the Notion title, a string;
 *     `SubjectEntity` is a relation to the canonical Entity row. The relation
 *     determines the string, and neither is a candidate key of FACT — a
 *     Boyce-Codd violation in the centre of the knowledge graph. It is reachable:
 *     `mergeEntities` repoints every fact relation from loser to winner and
 *     never rewrites the `Subject` title, so after a merge the vault holds facts
 *     whose title says one name and whose relation points at another.
 *
 *  4. TWO COLUMNS EXIST BECAUSE NOTION HAS NO EXPRESSION INDEXES. `DedupKey` is
 *     a hash of normalised subject-predicate-object; `SubjectKey` is the
 *     lowercased, whitespace-collapsed subject. A relational engine writes
 *     `CREATE UNIQUE INDEX ON fact (lower(subject), predicate, lower(object))`
 *     and is done. Lore materialises the expression as a stored column and
 *     backfills it with a migration — and Lore's own comment explains the split:
 *     `SubjectKey` exists separately "because we need `contains` substring
 *     matching, which Notion doesn't run against hashed values."
 *
 *  5. FACT IS BITEMPORAL IN SCHEMA. `Valid From` / `Valid Until` are valid time;
 *     `Observed At` / `Invalidated At` are transaction time, with `Invalidated
 *     By` pointing at the memory that prompted the retraction. Lore's own
 *     comment names the design: "Together they implement the bitemporal axis
 *     used for as-of recall." §5 asks how much of that axis the query surface
 *     can actually reach.
 */

/* ------------------------------------------------------------- attributes */

const A = (name, type, opts = {}) => ({ name, type, ...opts })

/** Notion property types, retained so the emulator can enforce their real limits. */
export const NOTION_TYPES = {
  title: { label: 'title', limit: 2000, note: 'Exactly one per database. Cannot be a relation.' },
  rich_text: { label: 'rich_text', limit: 2000, note: 'Truncated at 2 000 characters by the API.' },
  select: { label: 'select', limit: null, note: 'One choice from a list an editor may extend by hand.' },
  multi_select: { label: 'multi_select', limit: 100, note: 'A repeating group inside one cell. Adding an option is a schema change.' },
  relation: { label: 'relation', limit: 100, note: 'An array of page ids. Max 100 related pages. Not a foreign key.' },
  date: { label: 'date', limit: null, note: 'ISO 8601, optionally a range.' },
  number: { label: 'number', limit: null, note: 'Float. No CHECK constraint available; Lore clamps in application code.' },
  checkbox: { label: 'checkbox', limit: null, note: 'Boolean. Cheap server-side filter.' },
  body: { label: 'page body', limit: null, note: 'Blocks, not a property. Invisible to property filters.' },
  timestamp: { label: 'timestamp', limit: null, note: 'created_time / last_edited_time. Overwritten in place; no history.' },
}

/**
 * `modelled: false` marks a property that is declared here for the diagram and
 * the DDL but left null by the vault generator, because the workload does not
 * exercise it. Saying so explicitly is cheaper than a footnote and harder to
 * forget.
 */
export const ENTITIES = [
  {
    name: 'project',
    db: 'Projects',
    kind: 'strong',
    label: 'PROJECT',
    blurb: 'A named scope. Directories map onto projects by longest-prefix match.',
    pk: ['project_id'],
    attrs: [
      A('project_id', 'text', { pk: true, notion: 'page id', system: true }),
      A('name', 'text', { notion: 'title', title: true, lore: 'Name' }),
      A('type', 'text', { notion: 'select', domain: ['project', 'person', 'agent'], lore: 'Type' }),
      A('path', 'text', { notion: 'rich_text', lore: 'Path' }),
      A('status', 'text', { notion: 'select', domain: ['active', 'archived'], lore: 'Status' }),
      A('description', 'text', { notion: 'rich_text', nullable: true, lore: 'Description' }),
    ],
  },
  {
    name: 'topic',
    db: 'Topics',
    kind: 'strong',
    label: 'TOPIC',
    blurb: 'A category. The Project relation is dual_property, so a topic may span projects.',
    pk: ['topic_id'],
    attrs: [
      A('topic_id', 'text', { pk: true, notion: 'page id', system: true }),
      A('name', 'text', { notion: 'title', title: true, lore: 'Name' }),
      A('description', 'text', { notion: 'rich_text', nullable: true, lore: 'Description' }),
      A('project_id', 'text', { notion: 'relation', fk: 'project.project_id', nullable: true, lore: 'Project', cardinality: 'M:N' }),
    ],
  },
  {
    name: 'memory',
    db: 'Memories',
    kind: 'strong',
    label: 'MEMORY',
    blurb: 'One thing an agent or a person wrote down. Forty-one properties, ten kinds.',
    pk: ['memory_id'],
    specialization: {
      discriminator: 'kind',
      disjoint: true,
      total: true,
      subtypes: [
        { name: 'note', blurb: 'Unstructured observation. No revision chain.', own: [] },
        { name: 'decision', blurb: 'An architectural choice.', own: ['alternatives', 'consequences', 'decided_at', 'supersedes'] },
        { name: 'incident', blurb: 'Something that broke.', own: [] },
        { name: 'runbook', blurb: 'An ordered procedure for an operator.', own: [] },
        { name: 'postmortem', blurb: 'Analysis after an incident.', own: [] },
        { name: 'policy', blurb: 'A standing rule.', own: [] },
        { name: 'state', blurb: 'Current-state record.', own: ['expires_at'] },
        { name: 'operational', blurb: 'Operational context with an expiry.', own: ['expires_on', 'expires_at'] },
        { name: 'task', blurb: 'Tracked follow-up work.', own: ['task_state', 'blocked_by', 'done_at'] },
        { name: 'procedure', blurb: 'Reviewed governance memory.', own: ['status'] },
      ],
    },
    attrs: [
      A('memory_id', 'text', { pk: true, notion: 'page id', system: true }),
      A('title', 'text', { notion: 'title', title: true, lore: 'Title' }),
      A('kind', 'text', { notion: 'select', discriminator: true, lore: 'Kind', domain: ['note', 'decision', 'incident', 'runbook', 'postmortem', 'policy', 'state', 'operational', 'task', 'procedure'] }),
      A('source', 'text', { notion: 'select', lore: 'Source', domain: ['conversation', 'autosave_learning', 'file', 'manual', 'agent_diary', 'digest'] }),
      A('status', 'text', { notion: 'select', lore: 'Status', domain: ['informational', 'proposed', 'accepted', 'superseded', 'deprecated', 'rejected'] }),
      A('task_state', 'text', { notion: 'select', nullable: true, lore: 'Task State', domain: ['open', 'in-progress', 'blocked', 'done', 'cancelled'], subtypeOnly: 'task' }),
      A('blocked_by', 'text', { notion: 'rich_text', nullable: true, lore: 'Blocked By', modelled: false, note: 'A pointer to another memory, stored as free text rather than a relation.' }),
      A('entity_text', 'text', { notion: 'rich_text', nullable: true, lore: 'Entity', modelled: false, note: 'An entity reference stored as free text beside the Entities database.' }),
      A('author', 'text', { notion: 'rich_text', lore: 'Author', note: 'A display name from LORE_USER_NAME. Not a foreign key to a user.' }),
      A('agent', 'text', { notion: 'rich_text', lore: 'Agent', note: 'Free text from LORE_AGENT_NAME.' }),
      A('session', 'text', { notion: 'rich_text', nullable: true, lore: 'Session' }),
      A('topic_key', 'text', { notion: 'rich_text', nullable: true, lore: 'Topic Key', note: 'The upsert key. Kebab-case path, validated on write, not unique in the store.' }),
      A('revision_count', 'integer', { notion: 'number', lore: 'Revision Count', system: true, note: 'Incremented on upsert. The revisions themselves are page blocks.' }),
      A('keywords', 'text', { notion: 'rich_text', nullable: true, lore: 'Keywords', modelled: false }),
      A('synopsis', 'text', { notion: 'rich_text', nullable: true, lore: 'Synopsis', modelled: false, note: 'Soft-capped at 500 chars so listings need no body fetch.' }),
      A('compare_notes', 'text', { notion: 'rich_text', nullable: true, lore: 'Compare Notes', modelled: false, note: 'An append-only NDJSON audit log inside one 2 000-character cell. Appending past the cap throws.' }),
      A('promotion_source_key', 'text', { notion: 'rich_text', nullable: true, lore: 'Promotion Source Key', modelled: false, system: true }),
      A('review_by', 'integer', { notion: 'date', nullable: true, lore: 'Review By', modelled: false }),
      A('done_at', 'integer', { notion: 'date', nullable: true, lore: 'Done At', modelled: false, subtypeOnly: 'task' }),
      A('decided_at', 'integer', { notion: 'date', nullable: true, lore: 'Decided At', modelled: false, subtypeOnly: 'decision' }),
      A('last_referenced_at', 'integer', { notion: 'date', nullable: true, lore: 'Last Referenced At', modelled: false, system: true, note: 'Read-citation time. Distinct from last_edited_time, which tracks writes.' }),
      A('alternatives', 'text', { notion: 'rich_text', nullable: true, lore: 'Alternatives', modelled: false, subtypeOnly: 'decision' }),
      A('consequences', 'text', { notion: 'rich_text', nullable: true, lore: 'Consequences', modelled: false, subtypeOnly: 'decision' }),
      A('scope_kind', 'text', { notion: 'select', nullable: true, lore: 'Scope Kind', modelled: false, domain: ['team', 'project', 'user', 'agent', 'role', 'session', 'run', 'environment', 'global'] }),
      A('scope_key', 'text', { notion: 'rich_text', nullable: true, lore: 'Scope Key', modelled: false }),
      A('audience', 'text', { notion: 'rich_text', nullable: true, lore: 'Audience', modelled: false }),
      A('lifetime', 'text', { notion: 'select', nullable: true, lore: 'Lifetime', modelled: false, domain: ['persistent', 'expires', 'session-only', 'until-task-closed', 'until-decision-superseded'] }),
      A('expires_at', 'integer', { notion: 'date', nullable: true, lore: 'Expires At', modelled: false }),
      A('expires_on', 'text', { notion: 'rich_text', nullable: true, lore: 'Expires On', modelled: false }),
      A('pinned', 'integer', { notion: 'checkbox', nullable: true, lore: 'Pinned', modelled: false }),
      A('pinned_priority', 'integer', { notion: 'number', nullable: true, lore: 'Pinned Priority', modelled: false }),
      A('mutability', 'text', { notion: 'select', nullable: true, lore: 'Mutability', modelled: false, domain: ['mutable', 'read-only'] }),
      A('supersedes_id', 'text', { notion: 'relation', fk: 'memory.memory_id', nullable: true, lore: 'Supersedes', recursive: true, note: 'A self-relation. single_property, so the reverse edge is not maintained.' }),
      A('affects_id', 'text', { notion: 'relation', fk: 'memory.memory_id', nullable: true, lore: 'Affects', recursive: true, modelled: false }),
      A('compared_with_id', 'text', { notion: 'relation', fk: 'memory.memory_id', nullable: true, lore: 'Compared With', recursive: true, modelled: false, note: 'Symmetry is written by the caller, not enforced by the store.' }),
      A('body', 'text', { notion: 'body', lore: 'page blocks', note: 'The text. Property filters cannot see it.' }),
      A('created_time', 'integer', { notion: 'timestamp', system: true }),
      A('last_edited_time', 'integer', { notion: 'timestamp', system: true, note: 'Overwritten in place. There is no edit history to query.' }),
      A('archived', 'integer', { notion: 'system', system: true, note: 'In the trash. Queries skip it; relations pointing at it do not.' }),
    ],
  },
  {
    name: 'memory_project',
    db: 'Memories.Project',
    kind: 'bridge',
    label: 'MEMORY_PROJECT',
    blurb: 'The projection of the Project relation. Notion relations are arrays, so scope is a set.',
    pk: ['memory_id', 'project_id'],
    attrs: [
      A('memory_id', 'text', { pk: true, fk: 'memory.memory_id' }),
      A('project_id', 'text', { pk: true, fk: 'project.project_id' }),
    ],
  },
  {
    name: 'memory_topic',
    db: 'Memories.Topic',
    kind: 'bridge',
    label: 'MEMORY_TOPIC',
    blurb: 'The same, for topics.',
    pk: ['memory_id', 'topic_id'],
    attrs: [
      A('memory_id', 'text', { pk: true, fk: 'memory.memory_id' }),
      A('topic_id', 'text', { pk: true, fk: 'topic.topic_id' }),
    ],
  },
  {
    name: 'memory_tag',
    db: 'Memories.Tags',
    kind: 'bridge',
    label: 'MEMORY_TAG',
    blurb: 'The projection of the Tags multi-select. In the vault this is one cell holding a list.',
    pk: ['memory_id', 'tag'],
    derivedFrom: { entity: 'memory', attr: 'Tags', notion: 'multi_select' },
    attrs: [
      A('memory_id', 'text', { pk: true, fk: 'memory.memory_id' }),
      A('tag', 'text', { pk: true }),
    ],
  },
  {
    name: 'entity',
    db: 'Entities',
    kind: 'strong',
    label: 'ENTITY',
    blurb: 'The canonical handle for a thing. Added after the first four databases shipped.',
    pk: ['entity_id'],
    attrs: [
      A('entity_id', 'text', { pk: true, notion: 'page id', system: true }),
      A('name', 'text', { notion: 'title', title: true, lore: 'Name' }),
      A('aliases_raw', 'text', {
        notion: 'rich_text', nullable: true, lore: 'Aliases',
        repeatingGroup: true,
        note: 'A `, `-joined list in one cell. Lore\'s comment: a multi_select "would force a dataSources.update round-trip" per new alias.',
      }),
      A('kind', 'text', { notion: 'select', nullable: true, lore: 'Kind', domain: ['class', 'function', 'file', 'workflow', 'pr', 'task-id', 'person', 'system'] }),
      A('description', 'text', { notion: 'rich_text', nullable: true, lore: 'Description' }),
      A('project_id', 'text', { notion: 'relation', fk: 'project.project_id', nullable: true, lore: 'Project', cardinality: 'M:N' }),
      A('source_memory_id', 'text', { notion: 'relation', fk: 'memory.memory_id', nullable: true, lore: 'Source' }),
    ],
  },
  {
    name: 'entity_alias',
    db: '(does not exist in the vault)',
    kind: 'bridge',
    label: 'ENTITY_ALIAS',
    blurb: 'What the Aliases cell would be if it were a relation. Only the reimplementation has it.',
    pk: ['entity_id', 'alias'],
    derivedFrom: { entity: 'entity', attr: 'Aliases', notion: 'rich_text', synthetic: true },
    attrs: [
      A('entity_id', 'text', { pk: true, fk: 'entity.entity_id' }),
      A('alias', 'text', { pk: true }),
    ],
  },
  {
    name: 'fact',
    db: 'Facts',
    kind: 'strong',
    label: 'FACT',
    blurb: 'A subject-predicate-object triple with two time axes and two confidences.',
    pk: ['fact_id'],
    attrs: [
      A('fact_id', 'text', { pk: true, notion: 'page id', system: true }),
      A('subject', 'text', { notion: 'title', title: true, lore: 'Subject', note: 'A string. Determined by subject_entity_id, and not rewritten by a merge.' }),
      A('predicate', 'text', { notion: 'select', lore: 'Predicate' }),
      A('object', 'text', { notion: 'rich_text', lore: 'Object' }),
      A('valid_from', 'integer', { notion: 'date', nullable: true, lore: 'Valid From', temporal: 'valid' }),
      A('valid_until', 'integer', { notion: 'date', nullable: true, lore: 'Valid Until', temporal: 'valid', note: 'Null means "still believed".' }),
      A('observed_at', 'integer', { notion: 'date', nullable: true, lore: 'Observed At', temporal: 'transaction', system: true }),
      A('invalidated_at', 'integer', { notion: 'date', nullable: true, lore: 'Invalidated At', temporal: 'transaction', system: true }),
      A('invalidated_by', 'text', { notion: 'relation', fk: 'memory.memory_id', nullable: true, lore: 'Invalidated By', note: 'The memory that prompted the retraction. Distinct from Source.' }),
      A('confidence', 'text', { notion: 'select', lore: 'Confidence', domain: ['certain', 'likely', 'speculative'], note: 'The agent-writable stance.' }),
      A('confidence_score', 'real', { notion: 'number', nullable: true, lore: 'Confidence Score', system: true, derived: true, note: 'Seeded from the stance, bumped on citation, halved on contradiction, decayed by neglect. Null until first touch.' }),
      A('last_referenced_at', 'integer', { notion: 'date', nullable: true, lore: 'Last Referenced At', system: true, modelled: false }),
      A('review_by', 'integer', { notion: 'date', nullable: true, lore: 'Review By', modelled: false }),
      A('dedup_key', 'text', { notion: 'rich_text', nullable: true, lore: 'DedupKey', derived: true, note: 'A hash of normalised subject, predicate and object. An expression index, materialised.' }),
      A('subject_key', 'text', { notion: 'rich_text', nullable: true, lore: 'SubjectKey', derived: true, note: 'Lowercased, whitespace-collapsed subject. Separate from DedupKey because `contains` cannot match a hash.' }),
      A('project_id', 'text', { notion: 'relation', fk: 'project.project_id', nullable: true, lore: 'Project' }),
      A('source_memory_id', 'text', { notion: 'relation', fk: 'memory.memory_id', nullable: true, lore: 'Source', note: 'Provenance: the memory that supported the claim at creation.' }),
      A('subject_entity_id', 'text', { notion: 'relation', fk: 'entity.entity_id', nullable: true, lore: 'SubjectEntity' }),
      A('object_entity_id', 'text', { notion: 'relation', fk: 'entity.entity_id', nullable: true, lore: 'ObjectEntity' }),
      A('scope_kind', 'text', { notion: 'select', nullable: true, lore: 'Scope Kind', modelled: false }),
      A('scope_key', 'text', { notion: 'rich_text', nullable: true, lore: 'Scope Key', modelled: false }),
      A('lifetime', 'text', { notion: 'select', nullable: true, lore: 'Lifetime', modelled: false }),
      A('expires_at', 'integer', { notion: 'date', nullable: true, lore: 'Expires At', modelled: false }),
      A('created_time', 'integer', { notion: 'timestamp', system: true }),
    ],
  },
]

/* ---------------------------------------------------------- relationships */

export const RELATIONSHIPS = [
  { name: 'scopes', from: 'project', to: 'topic', card: 'M:N', label: 'scopes', fromCard: 'M', toCard: 'N', participation: 'partial', note: 'dual_property relation.' },
  { name: 'files', from: 'memory', to: 'project', card: 'M:N', label: 'filed under', fromCard: 'M', toCard: 'N', via: 'memory_project' },
  { name: 'categorises', from: 'memory', to: 'topic', card: 'M:N', label: 'categorised by', fromCard: 'M', toCard: 'N', via: 'memory_topic' },
  { name: 'tagged', from: 'memory', to: 'memory_tag', card: '1:N', label: 'tagged', fromCard: '1', toCard: 'N', weakSide: true },
  { name: 'introduces', from: 'memory', to: 'entity', card: '1:N', label: 'introduces', fromCard: '1', toCard: 'N', participation: 'partial' },
  { name: 'aliased', from: 'entity', to: 'entity_alias', card: '1:N', label: 'known as', fromCard: '1', toCard: 'N', weakSide: true, synthetic: true },
  { name: 'evidences', from: 'memory', to: 'fact', card: '1:N', label: 'evidences', fromCard: '1', toCard: 'N', participation: 'partial', note: 'Provenance edge (Source).' },
  { name: 'retracts', from: 'memory', to: 'fact', card: '1:N', label: 'retracts', fromCard: '1', toCard: 'N', participation: 'partial', note: 'Transaction-time edge (Invalidated By).' },
  { name: 'subject_of', from: 'entity', to: 'fact', card: '1:N', label: 'subject of', fromCard: '1', toCard: 'N', participation: 'partial' },
  { name: 'object_of', from: 'entity', to: 'fact', card: '1:N', label: 'object of', fromCard: '1', toCard: 'N', participation: 'partial' },
  { name: 'fact_scope', from: 'project', to: 'fact', card: '1:N', label: 'scopes', fromCard: '1', toCard: 'N', participation: 'partial' },
  { name: 'supersedes', from: 'memory', to: 'memory', card: '1:N', label: 'supersedes', fromCard: '1', toCard: 'N', recursive: true, participation: 'partial', note: 'A single_property self-relation, so only the forward edge exists.' },
]

/* ------------------------------------------------------------- predicates */

/**
 * Lore's predicate taxonomy, split by who may write it. The split matters:
 * `mentions`, `decided_by`, `supersedes_decision` and `informs` are referential
 * plumbing living in the same relation as domain knowledge, so an aggregate over
 * FACT counts pointers as claims unless it filters them out. Lore's schema
 * comments mark each one — "created exclusively by DecisionService", "auto-
 * emitted by lore-memory action='save'... system-managed, regex-derived".
 */
export const PREDICATES = {
  generic: ['is_a', 'has_a', 'related_to'],
  profile: ['uses', 'depends_on', 'created_by', 'owned_by', 'replaces', 'extends', 'conflicts_with'],
  system: ['decided_by', 'supersedes_decision', 'informs', 'mentions'],
  legacy: ['needs_action', 'waiting_on', 'blocked_by'],
}

export const AGENT_WRITABLE = [...PREDICATES.generic, ...PREDICATES.profile]
export const ALL_PREDICATES = [...AGENT_WRITABLE, ...PREDICATES.system, ...PREDICATES.legacy]

/** Predicates whose object names a second entity rather than a literal value. */
export const RELATIONAL_PREDICATES = new Set([
  'is_a', 'has_a', 'related_to', 'uses', 'depends_on', 'created_by', 'owned_by',
  'replaces', 'extends', 'conflicts_with', 'decided_by', 'supersedes_decision',
  'informs', 'mentions',
])

/**
 * Predicates on which a subject may hold at most one object at a time. These are
 * the ones a validity interval is meaningful for, and the ones an overlapping
 * interval makes self-contradictory.
 */
export const FUNCTIONAL_PREDICATES = new Set(['owned_by', 'is_a', 'created_by'])

export const CONFIDENCE_LEVELS = ['certain', 'likely', 'speculative']

/**
 * Lore's confidence algebra, read from `src/policy/confidence.ts` and
 * `src/core/decay.ts`. Reproduced exactly so the paper argues about the real
 * rule rather than a paraphrase of it.
 */
export const CONFIDENCE_MODEL = {
  seed: { certain: 0.9, likely: 0.6, speculative: 0.3 },
  bumpRate: 0.05,          // s + (1 - s) * BUMP_RATE, on read citation
  decrementFactor: 0.5,    // s * DECREMENT_FACTOR, on contradiction
  decayRate: 0.99,         // s * DECAY_RATE ^ staleDays
  staleGraceDays: 60,
  retrievalFactor: 1.0,    // confidenceFactor(_score) => 1.0
  retrievalNote: 'The score is maintained and then deliberately excluded from ranking: "Every valid score maps to 1.0, so ranking callers cannot use confidence as a multiplier."',
}

/** Documented scan caps. A cap is where a full scan was found to be infeasible. */
export const SCAN_CAPS = [
  { name: 'SCAN_RAW_CANDIDATE_CAP', value: 500, where: 'lore conflicts scan', note: 'Raw candidates per project before filtering; --exhaustive bypasses it for "full O(n²) coverage".' },
  { name: 'HYBRID_FALLBACK_THRESHOLD', value: 3, where: 'hybrid search', note: 'If the substring lane returns this many, the semantic lane is abandoned.' },
]

/* ---------------------------------------- functional dependencies and NFs */

/**
 * The normalisation walk starts from the shape a row actually has in the vault
 * and removes one class of anomaly per step. Every violation named here was read
 * from Lore's schema, not invented for the exercise, and `survives: true` marks
 * the ones that ship.
 */
export const NORMALIZATION = [
  {
    form: 'UNF',
    relation: 'entity(entity_id, Name, Aliases, Kind, Description, Project[], Source)',
    violation: 'Aliases is a `, `-joined list inside one rich_text cell.',
    rule: 'A relation is in 1NF when every attribute holds a single atomic value.',
    anomaly: 'No predicate can ask "which entity owns the alias SVC-4470". A `contains` filter matches substrings, so it also returns entities whose alias merely contains that text, and the caller has to re-split the cell and check exactly. Two entities can hold the same alias and nothing notices.',
    fix: 'Project the list into ENTITY_ALIAS(entity_id, alias) with a unique index on alias.',
    survives: true,
    surviveNote: 'Deliberate, and documented. A multi_select would need a dataSources.update round trip per new alias, which for free-form aliases is a schema migration per fact.',
    citation: 'src/core/entity.ts — "Aliases stored on a single rich_text cell as `, `-joined."',
  },
  {
    form: 'UNF',
    relation: 'memory(memory_id, ..., Tags, Compare Notes, page blocks)',
    violation: 'Three more repeating groups: Tags as a multi_select, Compare Notes as append-only NDJSON in one cell, and the revision chain as page blocks.',
    rule: 'Same rule, three more times.',
    anomaly: 'Compare Notes is an audit table inside a 2 000-character cell; Lore\'s own comment records that "append-past-cap throws". The revision chain is prose, so "what did this runbook say in March" is not a query anyone can write.',
    fix: 'MEMORY_TAG, MEMORY_COMPARISON and MEMORY_REVISION, one relation each.',
    survives: true,
    surviveNote: 'Structural. A page body is not a column, and Notion offers no child table.',
  },
  {
    form: '1NF',
    relation: 'fact(fact_id, Subject, Predicate, Object, SubjectKey, DedupKey, ...)',
    violation: 'SubjectKey and DedupKey are stored derivations of the other columns.',
    rule: 'A derived attribute should be a view, not a stored column, unless the store cannot index the expression.',
    anomaly: 'The store cannot. There are no expression indexes, so the expression is materialised, can drift from its source, and needs a backfill migration (`lore migrate --dedup-keys`) for every row written before it existed.',
    fix: 'CREATE UNIQUE INDEX ON fact (lower(subject), predicate, lower(object)). One line, no column, no migration.',
    survives: true,
    surviveNote: 'A faithful workaround for a real limitation, and the clearest single example of the substrate showing through the schema.',
  },
  {
    form: '3NF',
    relation: 'fact(fact_id, Subject, Predicate, Object, SubjectEntity, ...)',
    violation: 'SubjectEntity → Subject. The determinant is not a candidate key.',
    rule: 'A relation is in BCNF when every determinant is a candidate key.',
    anomaly: 'Subject is a title string and SubjectEntity is a relation to the canonical row; the relation determines the string. `mergeEntities` repoints every fact relation from loser to winner and never rewrites the title, so after a merge the vault holds facts whose title says one name and whose relation points at another. §7.2 counts them.',
    fix: 'Drop the Subject string; derive it from the relation at read time.',
    survives: true,
    surviveNote: 'Structural. Every Notion database needs a title property, and a title property cannot be a relation.',
    citation: 'src/core/entity-merge.ts — the merge moves fact relations and aliases; the word Subject does not appear in it.',
  },
  {
    form: 'BCNF',
    relation: 'fact(..., Confidence Score)',
    violation: 'Confidence Score is a stored derivation of citation, contradiction and decay events that are not themselves stored.',
    rule: 'A stored derivation is only safe when its inputs are stored and the derivation is recomputable.',
    anomaly: 'The score is a state machine over an event stream, so two vaults that saw the same evidence in a different order hold different scores for the same fact. Nothing can recompute or audit it. Lore ships `lore migrate --audit-fact-confidence`, which reports the distribution rather than the correctness.',
    fix: 'Store the citations, contradictions and touches; make the score a view over them.',
    survives: true,
    surviveNote: 'The score is then excluded from ranking anyway — confidenceFactor returns 1.0 for every value.',
  },
  {
    form: 'target',
    relation: 'The schema the SQLite and PostgreSQL arms execute.',
    violation: null,
    rule: 'Every repeating group is a relation; every derivation is an index or a view; every determinant is a candidate key.',
    anomaly: null,
    fix: 'This is what the reimplementation runs.',
  },
]

export const FDS = [
  { lhs: 'memory_id', rhs: 'title, kind, source, status, author, agent, session, topic_key, revision_count, body', in: 'memory' },
  { lhs: 'topic_key, {project_id}', rhs: 'memory_id', in: 'memory', violation: 'unenforced', note: 'Lore\'s upsert key. Its own comment: "Notion provides no per-key uniqueness enforcement." §6.3 breaks it.' },
  { lhs: 'fact_id', rhs: 'subject, predicate, object, valid_from, valid_until, observed_at, invalidated_at, confidence, confidence_score', in: 'fact' },
  { lhs: 'subject_entity_id', rhs: 'subject', in: 'fact', violation: 'BCNF', note: 'The determinant is not a candidate key of FACT.' },
  { lhs: 'subject, predicate, object', rhs: 'dedup_key, subject_key', in: 'fact', violation: 'stored derivation', note: 'An expression index written as columns.' },
  { lhs: 'dedup_key', rhs: 'fact_id', in: 'fact', violation: 'unenforced', note: 'Coalescing key. Nothing makes it unique.' },
  { lhs: 'entity_id', rhs: 'name, aliases_raw, kind, description', in: 'entity' },
  { lhs: 'alias', rhs: 'entity_id', in: 'entity_alias', violation: 'does not hold', note: 'Lore is explicit: "aliases are deliberately not unique across entities."' },
  { lhs: 'project_id', rhs: 'name, type, path, status', in: 'project' },
]

/* ----------------------------------------------------------- integrity */

/**
 * The invariants Lore's domain services must uphold in application code because
 * the substrate cannot declare them. Each names the DDL that would have enforced
 * it declaratively, and where in Lore the application-level guard lives.
 */
export const INVARIANTS = [
  {
    id: 'INV-1',
    statement: 'At most one memory per (topic_key, project set).',
    declarative: 'UNIQUE (topic_key, project_id)',
    enforcedBy: 'application read-then-write, in memory-topic-key.ts',
    breaks: 'concurrent upsert',
    admitted: 'Two parallel saves with the same topicKey can both find no existing match and both create fresh rows.',
  },
  {
    id: 'INV-2',
    statement: 'Every fact\'s Source references a memory that exists.',
    declarative: 'FOREIGN KEY (source_memory_id) REFERENCES memory ON DELETE RESTRICT',
    enforcedBy: 'nothing; `lore debt scan` finds the orphans afterwards',
    breaks: 'archiving a memory page',
  },
  {
    id: 'INV-3',
    statement: 'A subject holds at most one object per functional predicate at any instant.',
    declarative: "EXCLUDE USING gist (subject_entity_id WITH =, predicate WITH =, validity WITH &&)",
    enforcedBy: 'nothing; `lore conflicts scan` finds the contradictions afterwards, capped at 500 candidates per project',
    breaks: 'two agents asserting different owners without closing the first interval',
  },
  {
    id: 'INV-4',
    statement: 'confidence ∈ {certain, likely, speculative}.',
    declarative: 'CHECK (confidence IN (...))',
    enforcedBy: 'Notion select options, which an editor may extend by hand in the UI',
    breaks: 'a human typing a new option into the property',
  },
  {
    id: 'INV-5',
    statement: 'An alias identifies exactly one entity.',
    declarative: 'UNIQUE (alias)',
    enforcedBy: 'nothing — and Lore states the invariant does not hold',
    breaks: 'two entities independently claiming the same alias',
  },
  {
    id: 'INV-6',
    statement: 'valid_from ≤ valid_until.',
    declarative: 'CHECK (valid_until IS NULL OR valid_from <= valid_until)',
    enforcedBy: 'not verifiable from the source we read',
    breaks: 'a backdated correction',
  },
  {
    id: 'INV-7',
    statement: 'dedup_key = hash(normalise(subject), predicate, normalise(object)).',
    declarative: 'GENERATED ALWAYS AS (...) STORED, or a plain expression index',
    enforcedBy: 'FactService.create at write time, plus a backfill migration for older rows',
    breaks: 'a write that bypasses the service — a hand edit in the Notion UI',
  },
]

/* -------------------------------------------------------------- DDL build */

const SQL_TYPE = {
  sqlite: { text: 'TEXT', integer: 'INTEGER', real: 'REAL' },
  postgres: { text: 'TEXT', integer: 'BIGINT', real: 'DOUBLE PRECISION' },
}

/**
 * Table DDL for one dialect, generated from ENTITIES so it cannot diverge from
 * the diagram. `constraints: false` produces the same tables with every CHECK
 * and FOREIGN KEY omitted; that ablation is how §6 shows what the constraints
 * were buying.
 */
export function ddl(dialect, { constraints = true } = {}) {
  const t = SQL_TYPE[dialect]
  const out = []
  for (const e of ENTITIES) {
    const cols = e.attrs.map((a) => {
      const nn = a.nullable ? '' : ' NOT NULL'
      let line = `  ${a.name} ${t[a.type]}${nn}`
      if (constraints && a.domain && !a.nullable) {
        line += ` CHECK (${a.name} IN (${a.domain.map((d) => `'${d}'`).join(', ')}))`
      }
      return line
    })
    cols.push(`  PRIMARY KEY (${e.pk.join(', ')})`)
    if (constraints) {
      for (const a of e.attrs) {
        if (!a.fk) continue
        const [rt, rc] = a.fk.split('.')
        cols.push(`  FOREIGN KEY (${a.name}) REFERENCES ${rt}(${rc})`)
      }
    }
    out.push(`CREATE TABLE ${e.name} (\n${cols.join(',\n')}\n)`)
  }
  return out
}

/** The constraints Notion has no way to express. Only PostgreSQL runs all of them. */
export function extraConstraints(dialect) {
  const out = [
    { id: 'INV-1', sql: 'CREATE UNIQUE INDEX ux_memory_topic_key ON memory_topic_key (topic_key, project_id)', dialects: ['sqlite', 'postgres'] },
    { id: 'INV-5', sql: 'CREATE UNIQUE INDEX ux_alias ON entity_alias (alias)', dialects: ['sqlite', 'postgres'] },
    { id: 'INV-7', sql: 'CREATE UNIQUE INDEX ux_fact_dedup ON fact (lower(subject), predicate, lower(object))', dialects: ['sqlite', 'postgres'], note: 'The expression index DedupKey and SubjectKey exist to stand in for.' },
    { id: 'INV-6', sql: 'ALTER TABLE fact ADD CONSTRAINT ck_validity CHECK (valid_until IS NULL OR valid_from <= valid_until)', dialects: ['postgres'] },
    {
      id: 'INV-3',
      sql: `ALTER TABLE fact ADD CONSTRAINT ex_fact_validity
  EXCLUDE USING gist (
    subject_entity_id WITH =,
    predicate WITH =,
    int8range(COALESCE(valid_from, -999999), COALESCE(valid_until, 999999), '[)') WITH &&
  ) WHERE (predicate IN ('owned_by','is_a','created_by') AND subject_entity_id IS NOT NULL)`,
      dialects: ['postgres'],
      note: 'A temporal primary key. SQLite has no exclusion constraints; Notion has no constraints.',
    },
  ]
  return out.filter((c) => c.dialects.includes(dialect))
}

/** Secondary indexes. The paper measures the schema with and without them. */
export const SECONDARY_INDEXES = [
  { name: 'ix_fact_subject_entity', table: 'fact', cols: ['subject_entity_id'], serves: 'entity lookup', kind: 'btree' },
  { name: 'ix_fact_object_entity', table: 'fact', cols: ['object_entity_id'], serves: 'reverse traversal', kind: 'btree' },
  { name: 'ix_fact_predicate', table: 'fact', cols: ['predicate'], serves: 'taxonomy filters', kind: 'btree' },
  { name: 'ix_fact_validity', table: 'fact', cols: ['valid_from', 'valid_until'], serves: 'as-of queries', kind: 'btree' },
  { name: 'ix_fact_source', table: 'fact', cols: ['source_memory_id'], serves: 'provenance join', kind: 'btree' },
  { name: 'ix_fact_subject_key', table: 'fact', cols: ['subject_key'], serves: 'case-insensitive subject match', kind: 'btree' },
  { name: 'ix_memory_kind', table: 'memory', cols: ['kind'], serves: 'specialisation filter', kind: 'btree' },
  { name: 'ix_memory_created', table: 'memory', cols: ['created_time'], serves: 'wake-up recency window', kind: 'btree' },
  { name: 'ix_memory_topic_key', table: 'memory', cols: ['topic_key'], serves: 'upsert probe', kind: 'btree' },
  { name: 'ix_memory_author', table: 'memory', cols: ['author'], serves: 'provenance join', kind: 'btree' },
  { name: 'ix_alias_alias', table: 'entity_alias', cols: ['alias'], serves: 'entity resolution', kind: 'btree' },
]

export const TABLE_COUNT = ENTITIES.length
export const STRONG_ENTITIES = ENTITIES.filter((e) => e.kind === 'strong')
export const BRIDGE_ENTITIES = ENTITIES.filter((e) => e.kind === 'bridge')

/** The five Notion databases, as `lore init` creates them. */
export const VAULT_DATABASES = [
  { name: 'Projects', icon: '🗂️', title: 'Name', entity: 'project' },
  { name: 'Topics', icon: '📑', title: 'Name', entity: 'topic' },
  { name: 'Memories', icon: '🧠', title: 'Title', entity: 'memory' },
  { name: 'Entities', icon: '🪪', title: 'Name', entity: 'entity' },
  { name: 'Facts', icon: '🔗', title: 'Subject', entity: 'fact' },
]

/** Where the schema above was read from, so a reader can check it. */
export const SOURCE = {
  repo: 'https://github.com/makenotion/lore',
  commit: '95c3558',
  commitDate: '2026-08-04',
  version: '1.0.0',
  license: 'MIT, Notion Labs, Inc.',
  schemaFile: 'src/notion/schema.ts',
  files: [
    { path: 'src/notion/schema.ts', why: 'the five property catalogues, verbatim' },
    { path: 'src/core/entity.ts', why: 'alias serialisation and resolution' },
    { path: 'src/core/entity-merge.ts', why: 'what a merge does and does not touch' },
    { path: 'src/core/memory-topic-key.ts', why: 'the upsert protocol and its admitted race' },
    { path: 'src/core/decay.ts', why: 'the confidence algebra' },
    { path: 'src/policy/confidence.ts', why: 'the confidence constants' },
    { path: 'src/cli/commands/conflicts.ts', why: 'the conflict scan and its cap' },
  ],
}

/** Property counts, computed rather than asserted. */
export const PROPERTY_COUNTS = Object.fromEntries(
  ENTITIES.filter((e) => e.kind === 'strong').map((e) => [
    e.db,
    {
      total: e.attrs.length,
      modelled: e.attrs.filter((a) => a.modelled !== false).length,
      relations: e.attrs.filter((a) => a.notion === 'relation').length,
      derived: e.attrs.filter((a) => a.derived).length,
      systemManaged: e.attrs.filter((a) => a.system).length,
    },
  ]),
)
