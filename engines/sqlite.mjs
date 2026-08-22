/**
 * The SQLite arm: Lore's vault as tables, in process, in one file.
 *
 * The point of this arm is not that SQLite is fast. It is that the whole
 * workload becomes *one statement per question*. Every class the Notion arm has
 * to answer by fetching rows and looping in the client — the join, the group by,
 * the self-join, the transitive closure, the full-text scan — is a query here,
 * and the query is the same length as the sentence describing it.
 *
 * The schema is generated from engines/schema.mjs, so the tables are the ones the
 * entity-relationship diagram draws. Constraints Notion cannot express are
 * created here and their effect is measured in the integrity experiment.
 *
 * `node:sqlite` ships with Node, so this arm adds no dependency at all. That
 * matters for the argument: the cheapest possible database is already installed
 * on the machine running the agent.
 */

import { DatabaseSync } from 'node:sqlite'
import { ddl, SECONDARY_INDEXES } from './schema.mjs'
import { newLedger } from './contract.mjs'

const NEG = -999999
const POS = 999999

function build(vault, { constraints = true, indexes = true, fts = true } = {}) {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA journal_mode = WAL')
  if (constraints) db.exec('PRAGMA foreign_keys = ON')

  for (const stmt of ddl('sqlite', { constraints })) db.exec(stmt)

  const ins = (table, cols) =>
    db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)

  db.exec('BEGIN')

  const p = ins('project', ['project_id', 'name', 'type', 'path', 'status', 'description'])
  for (const r of vault.projects) p.run(r.project_id, r.name, r.type, r.path, r.status, r.description ?? null)

  const t = ins('topic', ['topic_id', 'name', 'description', 'project_id'])
  for (const r of vault.topics) t.run(r.topic_id, r.name, r.description ?? null, r.project_id ?? null)

  const m = ins('memory', ['memory_id', 'title', 'kind', 'source', 'status', 'task_state', 'author',
    'agent', 'session', 'topic_key', 'revision_count', 'supersedes_id', 'body', 'created_time',
    'last_edited_time', 'archived'])
  // Two passes: the self-relation is a foreign key, so a memory cannot name the
  // memory it supersedes until that row exists. Relying on insertion order to
  // satisfy a constraint is exactly the assumption a foreign key exists to stop
  // anyone making.
  for (const r of vault.memories) {
    m.run(r.memory_id, r.title, r.kind, r.source, r.status, r.task_state ?? null, r.author, r.agent,
      r.session ?? null, r.topic_key ?? null, r.revision_count, null, r.body, r.created_time,
      r.last_edited_time, r.archived ? 1 : 0)
  }
  const setSupersedes = db.prepare('UPDATE memory SET supersedes_id = ? WHERE memory_id = ?')
  for (const r of vault.memories) {
    if (r.supersedes_id) setSupersedes.run(r.supersedes_id, r.memory_id)
  }

  const mp = ins('memory_project', ['memory_id', 'project_id'])
  for (const r of vault.memoryProjects) mp.run(r.memory_id, r.project_id)
  const mt = ins('memory_topic', ['memory_id', 'topic_id'])
  for (const r of vault.memoryTopics) mt.run(r.memory_id, r.topic_id)
  const mg = ins('memory_tag', ['memory_id', 'tag'])
  const seenTag = new Set()
  for (const r of vault.memoryTags) {
    const k = `${r.memory_id}|${r.tag}`
    if (seenTag.has(k)) continue
    seenTag.add(k)
    mg.run(r.memory_id, r.tag)
  }

  const e = ins('entity', ['entity_id', 'name', 'aliases_raw', 'kind', 'description', 'project_id', 'source_memory_id'])
  for (const r of vault.entities) {
    e.run(r.entity_id, r.name, r.aliases_raw ?? null, r.kind ?? null, r.description ?? null,
      r.project_id ?? null, r.source_memory_id ?? null)
  }
  const ea = ins('entity_alias', ['entity_id', 'alias'])
  const seenAlias = new Set()
  for (const r of vault.aliases) {
    const k = `${r.entity_id}|${r.alias}`
    if (seenAlias.has(k)) continue
    seenAlias.add(k)
    ea.run(r.entity_id, r.alias)
  }

  const f = ins('fact', ['fact_id', 'subject', 'predicate', 'object', 'valid_from', 'valid_until',
    'observed_at', 'invalidated_at', 'invalidated_by', 'confidence', 'confidence_score',
    'dedup_key', 'subject_key', 'project_id', 'source_memory_id', 'subject_entity_id',
    'object_entity_id', 'created_time'])
  for (const r of vault.facts) {
    f.run(r.fact_id, r.subject, r.predicate, r.object, r.valid_from, r.valid_until,
      r.observed_at ?? null, r.invalidated_at ?? null, r.invalidated_by ?? null, r.confidence,
      r.confidence_score, r.dedup_key ?? null, r.subject_key ?? null, r.project_id ?? null,
      r.source_memory_id ?? null, r.subject_entity_id ?? null, r.object_entity_id ?? null, r.created_time)
  }

  db.exec('COMMIT')

  if (indexes) {
    for (const ix of SECONDARY_INDEXES) {
      db.exec(`CREATE INDEX ${ix.name} ON ${ix.table} (${ix.cols.join(', ')})`)
    }
  }

  if (fts) {
    // The inverted index Notion's search endpoint does not offer over page
    // bodies. `content=` keeps the text unduplicated; only the index is built.
    db.exec("CREATE VIRTUAL TABLE memory_fts USING fts5(body, content='memory', content_rowid='rowid')")
    db.exec("INSERT INTO memory_fts(rowid, body) SELECT rowid, body FROM memory WHERE archived = 0")
  }

  return db
}

/** FTS5 phrase syntax: quote the term and let the tokeniser split it. */
function ftsPhrase(term) {
  return `"${String(term).replace(/"/g, '""')}"`
}

const SQL = {
  'wake-up': `
    SELECT m.memory_id
      FROM memory m
      JOIN memory_project mp ON mp.memory_id = m.memory_id
     WHERE mp.project_id = ? AND m.created_time >= ? AND m.archived = 0
     ORDER BY m.created_time DESC, m.memory_id ASC
     LIMIT ?`,

  'ask-entity': `
    WITH e(entity_id) AS (
      SELECT entity_id FROM entity       WHERE lower(name)  = lower(?)
      UNION
      SELECT entity_id FROM entity_alias WHERE lower(alias) = lower(?)
    )
    SELECT fact_id FROM fact
     WHERE subject_entity_id IN (SELECT entity_id FROM e)
        OR object_entity_id  IN (SELECT entity_id FROM e)
     ORDER BY fact_id`,

  provenance: `
    SELECT f.fact_id
      FROM fact f
      JOIN memory m ON m.memory_id = f.source_memory_id
     WHERE m.author = ? AND f.predicate = ? AND m.archived = 0
     ORDER BY f.fact_id`,

  'as-of': `
    WITH e(entity_id) AS (
      SELECT entity_id FROM entity       WHERE lower(name)  = lower(?)
      UNION
      SELECT entity_id FROM entity_alias WHERE lower(alias) = lower(?)
    )
    SELECT fact_id FROM fact
     WHERE subject_entity_id IN (SELECT entity_id FROM e)
       AND COALESCE(valid_from,  ${NEG}) <= ?
       AND COALESCE(valid_until, ${POS}) >  ?
     ORDER BY fact_id`,

  current: `
    WITH e(entity_id) AS (
      SELECT entity_id FROM entity       WHERE lower(name)  = lower(?)
      UNION
      SELECT entity_id FROM entity_alias WHERE lower(alias) = lower(?)
    )
    SELECT fact_id FROM fact
     WHERE subject_entity_id IN (SELECT entity_id FROM e)
       AND valid_until IS NULL
     ORDER BY fact_id`,

  aggregate: `
    SELECT m.kind || '=' || COUNT(*) AS g
      FROM memory m
      JOIN memory_project mp ON mp.memory_id = m.memory_id
     WHERE mp.project_id = ? AND m.created_time >= ? AND m.archived = 0
     GROUP BY m.kind
     ORDER BY g`,

  'conflict-scan': `
    SELECT DISTINCT a.subject_entity_id || '|' || a.predicate AS k
      FROM fact a
      JOIN fact b
        ON a.subject_entity_id = b.subject_entity_id
       AND a.predicate = b.predicate
       AND a.fact_id < b.fact_id
     WHERE a.predicate IN ('owned_by','is_a','created_by')
       AND a.subject_entity_id IS NOT NULL
       AND a.object <> b.object
       AND COALESCE(a.valid_from, ${NEG}) < COALESCE(b.valid_until, ${POS})
       AND COALESCE(b.valid_from, ${NEG}) < COALESCE(a.valid_until, ${POS})
     ORDER BY k`,

  supersession: `
    WITH RECURSIVE chain(node, depth) AS (
      SELECT ?, 0
      UNION ALL
      SELECT m.memory_id, c.depth + 1
        FROM memory m
        JOIN chain c ON m.supersedes_id = c.node
       WHERE c.depth < 64
    )
    SELECT node FROM chain WHERE depth > 0 ORDER BY depth`,

  'body-search': `
    SELECT m.memory_id
      FROM memory_fts
      JOIN memory m ON m.rowid = memory_fts.rowid
     WHERE memory_fts MATCH ? AND m.archived = 0
     ORDER BY m.memory_id`,

  'cross-db': `
    SELECT DISTINCT f.fact_id
      FROM fact f
      JOIN entity e ON e.entity_id = f.subject_entity_id
      JOIN memory m ON m.memory_id = e.source_memory_id
     WHERE m.author = ? AND m.archived = 0
     ORDER BY f.fact_id`,
}

/** The parameters each statement takes, in order. One place, so the arms agree. */
export function paramsFor(q) {
  switch (q.class) {
    case 'wake-up': return [q.project_id, q.since, q.limit]
    case 'ask-entity': return [q.term, q.term]
    case 'provenance': return [q.author, q.predicate]
    case 'as-of': return [q.term, q.term, q.day, q.day]
    case 'current': return [q.term, q.term]
    case 'aggregate': return [q.project_id, q.since]
    case 'conflict-scan': return []
    case 'supersession': return [q.term]
    case 'body-search': return [ftsPhrase(q.term)]
    case 'cross-db': return [q.author]
    default: throw new Error(`no params for ${q.class}`)
  }
}

function makeArm({ id, label, blurb, opts }) {
  return () => ({
    id,
    family: 'sqlite',
    label,
    blurb,
    emulated: false,
    async load(vault) {
      this.db = build(vault, opts)
      const n = this.db.prepare('SELECT COUNT(*) AS c FROM memory').get().c
      return { rows: n }
    },
    async ask(q) {
      const ledger = newLedger()
      const sql = SQL[q.class]
      if (!sql) throw new Error(`no SQL for ${q.class}`)
      const rows = this.db.prepare(sql).all(...paramsFor(q))
      // One statement. That is the finding.
      ledger.roundTrips = 1
      ledger.rowsReturned = rows.length
      ledger.rowsClientSide = 0
      const key = Object.keys(rows[0] ?? { x: 1 })[0]
      return { ids: rows.map((r) => r[key]), ledger }
    },
    async close() { this.db?.close() },
    explain(q) {
      const sql = SQL[q.class]
      return this.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...paramsFor(q))
    },
  })
}

export const sqliteFull = makeArm({
  id: 'sqlite',
  label: 'SQLite 3.x',
  blurb: 'node:sqlite, in process, with secondary indexes, constraints and an FTS5 index over bodies.',
  opts: { constraints: true, indexes: true, fts: true },
})

export const sqliteNoIndex = makeArm({
  id: 'sqlite-noindex',
  label: 'SQLite, no indexes',
  blurb: 'The same tables and the same statements with every secondary index dropped.',
  opts: { constraints: true, indexes: false, fts: true },
})

export { build as buildSqlite, SQL as SQLITE_SQL }
