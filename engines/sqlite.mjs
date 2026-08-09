/**
 * The embedded-DBMS arms: SQLite through Node's built-in `node:sqlite`.
 *
 * Three arms over one normalised schema, differing only in what access methods
 * exist over the memory body:
 *
 *   sqlite-btree   B-trees only. Text matching is a scan.
 *   sqlite-fts     adds an FTS5 inverted index with BM25 ranking.
 *   sqlite-hybrid  adds vectors, fused with BM25 by reciprocal rank.
 *
 * SQLite has no vector access method. The hybrid arm therefore computes cosine
 * over a sequential scan of the embedding table, which is not a shortcoming of
 * the implementation but the measurement itself: §6.4 shows what that costs and
 * where it crosses over against an index that does have one.
 */

import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { ddl, SECONDARY_INDEXES } from './schema.mjs'
import { rrf, DEFAULT_K } from './contract.mjs'

/* ------------------------------------------------------------ shared base */

function base({ id, label, short, index, note, fts, vector, supports }) {
  let db = null
  let dir = null
  let dim = 384

  /** Predicate → SQL fragment. One place, so every arm filters identically. */
  const where = (p, alias = 'm') => {
    if (!p) return { sql: '', params: [] }
    switch (p.op) {
      case '<=': return { sql: ` AND ${alias}.created_day <= ?`, params: [p.value] }
      case '>=': return { sql: ` AND ${alias}.created_day >= ?`, params: [p.value] }
      case '=': return { sql: ` AND ${alias}.session_id = ?`, params: [p.value] }
      case 'is null': return { sql: ` AND ${alias}.superseded_by IS NULL`, params: [] }
      case 'count': return { sql: ` AND ${alias}.fact_id = ?`, params: [p.value] }
      default: return { sql: '', params: [] }
    }
  }

  /** FTS5 MATCH expression: quote every term, OR them together. */
  const ftsQuery = (terms) => terms.map((t) => `"${t.replace(/"/g, '')}"`).join(' OR ')

  return {
    id, label, short, index, note,
    family: 'sqlite',
    engine: 'SQLite (node:sqlite)',
    supports,

    async open(o) {
      dir = o.dir
      dim = o.dim
      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(dir, { recursive: true })
      db = new DatabaseSync(path.join(dir, 'memory.db'))
      db.exec('PRAGMA journal_mode = WAL')
      db.exec('PRAGMA foreign_keys = ON')
      for (const stmt of ddl('sqlite', { vector })) db.exec(stmt)
      this._db = db
    },

    async load(memories, embed, world) {
      const t0 = process.hrtime.bigint()

      db.exec('BEGIN')
      db.prepare('INSERT INTO agent VALUES (?,?,?)').run('A-1', 'claude-opus', 'anthropic')

      const sessions = [...new Set(memories.map((m) => m.sessionId))]
      const sIns = db.prepare('INSERT INTO session VALUES (?,?,?)')
      const dayOf = new Map()
      for (const m of memories) if (!dayOf.has(m.sessionId)) dayOf.set(m.sessionId, m.day)
      for (const s of sessions) sIns.run(s, 'A-1', dayOf.get(s))

      const ents = new Set()
      for (const m of memories) for (const e of m.entities ?? []) ents.add(e)
      const eIns = db.prepare('INSERT INTO entity VALUES (?,?,?)')
      for (const e of ents) eIns.run(e, e.split('-')[0], e)

      const facts = new Map()
      for (const m of memories) if (m.factId && !facts.has(m.factId)) facts.set(m.factId, m)
      const fIns = db.prepare('INSERT INTO fact VALUES (?,?,?,?,?,?)')
      for (const [fid, m] of facts) {
        fIns.run(fid, m.entities?.[0] ?? null, fid.split('-')[1] ?? 'unknown', '', m.kind, m.day)
      }

      // superseded_by is a self-reference, so the column is filled on a second
      // pass — the target row does not exist yet on the first.
      const mIns = db.prepare(
        'INSERT INTO memory (memory_id,session_id,turn_no,seq,kind,body,fact_id,created_day,source,confidence,superseded_by) VALUES (?,?,?,?,?,?,?,?,?,?,NULL)',
      )
      for (const m of memories) {
        mIns.run(m.id, m.sessionId, m.turn, m.seq, m.kind, m.body, m.factId, m.day, m.source, m.confidence)
      }
      const sup = db.prepare('UPDATE memory SET superseded_by = ? WHERE memory_id = ?')
      for (const m of memories) if (m.supersededBy) sup.run(m.supersededBy, m.id)

      const meIns = db.prepare('INSERT OR IGNORE INTO memory_entity VALUES (?,?)')
      for (const m of memories) for (const e of m.entities ?? []) meIns.run(m.id, e)

      if (vector) {
        const vIns = db.prepare('INSERT INTO embedding VALUES (?,?,?,?)')
        for (const m of memories) {
          const v = embed.get(m.body)
          vIns.run(m.id, 'MiniLM-L6-v2', dim, Buffer.from(v.buffer, v.byteOffset, v.byteLength))
        }
      }
      db.exec('COMMIT')
      const ingestMs = Number(process.hrtime.bigint() - t0) / 1e6

      const t1 = process.hrtime.bigint()
      for (const ix of SECONDARY_INDEXES) {
        db.exec(`CREATE INDEX ${ix.name} ON ${ix.table}(${ix.cols.join(',')})`)
      }
      if (fts) {
        db.exec(`CREATE VIRTUAL TABLE memory_fts USING fts5(
          body, content='memory', content_rowid='rowid', tokenize='porter unicode61'
        )`)
        db.exec(`INSERT INTO memory_fts(rowid, body) SELECT rowid, body FROM memory`)
      }
      db.exec('ANALYZE')
      const indexMs = Number(process.hrtime.bigint() - t1) / 1e6

      if (vector) {
        // Cached once so recall measures search, not deserialisation of a BLOB
        // column — the same courtesy the Postgres arm gets from its own cache.
        this._vecIds = db.prepare('SELECT memory_id FROM embedding ORDER BY rowid').all().map((r) => r.memory_id)
        const raw = db.prepare('SELECT vec FROM embedding ORDER BY rowid').all()
        this._vecs = new Float32Array(raw.length * dim)
        for (let i = 0; i < raw.length; i++) {
          this._vecs.set(new Float32Array(raw[i].vec.buffer, raw[i].vec.byteOffset, dim), i * dim)
        }
      }
      return { ingestMs, indexMs }
    },

    /** BM25 or LIKE, depending on whether an inverted index exists. */
    _lexical(q, limit) {
      const w = where(q.predicate)
      if (fts) {
        // bm25() takes the FTS5 table by name, so this join cannot be aliased.
        const sql = `SELECT m.memory_id AS id FROM memory_fts
          JOIN memory m ON m.rowid = memory_fts.rowid
          WHERE memory_fts MATCH ?${w.sql}
          ORDER BY bm25(memory_fts) LIMIT ?`
        return db.prepare(sql).all(ftsQuery(q.terms), ...w.params, limit).map((r) => r.id)
      }
      // No inverted index: score by counting term hits across a full scan.
      const score = q.terms.map(() => `(CASE WHEN m.body LIKE ? THEN 1 ELSE 0 END)`).join(' + ')
      const sql = `SELECT m.memory_id AS id, (${score}) AS s FROM memory m
        WHERE 1=1${w.sql} AND (${score}) > 0 ORDER BY s DESC, m.seq DESC LIMIT ?`
      const likes = q.terms.map((t) => `%${t}%`)
      return db.prepare(sql).all(...likes, ...w.params, ...likes, limit).map((r) => r.id)
    },

    /** Cosine over a sequential scan. SQLite has no ANN access method. */
    _vector(q, limit) {
      const e = q.embedding
      const n = this._vecIds.length
      const scored = new Array(n)
      for (let i = 0; i < n; i++) {
        let d = 0
        const off = i * dim
        for (let j = 0; j < dim; j++) d += this._vecs[off + j] * e[j]
        scored[i] = [d, i]
      }
      scored.sort((a, b) => b[0] - a[0])
      let out = scored.map(([, i]) => this._vecIds[i])
      if (q.predicate) {
        const allowed = new Set(this._predicateIds(q))
        out = out.filter((id) => allowed.has(id))
      }
      return out.slice(0, limit)
    },

    /** The predicate evaluated on its own, in SQL, using the B-tree indexes. */
    _predicateIds(q) {
      const w = where(q.predicate)
      return db.prepare(`SELECT m.memory_id AS id FROM memory m WHERE 1=1${w.sql}`)
        .all(...w.params).map((r) => r.id)
    },

    async recall(q) {
      const k = q.k ?? DEFAULT_K
      if (!vector) return { ids: this._lexical(q, k) }
      const lex = this._lexical(q, k * 5)
      const vec = this._vector(q, k * 5)
      return { ids: rrf([lex, vec], k) }
    },

    /** Cardinality questions answered exactly, by the engine that can. */
    async aggregate(q) {
      if (!q.predicate || q.predicate.op !== 'count') return null
      return db.prepare('SELECT COUNT(*) AS n FROM memory WHERE fact_id = ?').get(q.predicate.value).n
    },

    async storage() {
      const rows = db.prepare(
        'SELECT name, SUM(pgsize) AS bytes, COUNT(*) AS pages FROM dbstat GROUP BY name',
      ).all()
      const kindOf = (n) => {
        if (n.startsWith('memory_fts')) return 'inverted'
        if (n === 'embedding') return 'vector'
        if (n.startsWith('ix_') || n.startsWith('sqlite_autoindex')) return 'btree'
        return 'heap'
      }
      const breakdown = rows
        .map((r) => ({ name: r.name, kind: kindOf(r.name), bytes: Number(r.bytes), pages: Number(r.pages) }))
        .sort((a, b) => b.bytes - a.bytes)
      return { totalBytes: breakdown.reduce((s, b) => s + b.bytes, 0), breakdown }
    },

    async explain(q) {
      const w = where(q.predicate)
      const sql = fts
        ? `SELECT m.memory_id FROM memory_fts JOIN memory m ON m.rowid=memory_fts.rowid WHERE memory_fts MATCH ?${w.sql} ORDER BY bm25(memory_fts) LIMIT 10`
        : `SELECT m.memory_id FROM memory m WHERE m.body LIKE ?${w.sql} LIMIT 10`
      const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all().map((r) => r.detail)
      return { text: plan.join('\n'), plan, sql }
    },

    /** The handle the ACID and concurrency experiments drive directly. */
    handle() { return db },

    async close() { try { db?.close() } catch { /* already closed by a crash test */ } },
  }
}

/* ----------------------------------------------------------------- arms */

export const sqliteBtree = () => base({
  id: 'sqlite-btree',
  label: 'SQLite · B-tree only',
  short: 'SQLite B-tree',
  index: 'btree',
  fts: false,
  vector: false,
  note: 'Normalised to BCNF with B-tree secondary indexes. Text matching has no index and scans.',
  supports: { predicates: true, joins: true, aggregates: true, transactions: true, vector: false },
})

export const sqliteFts = () => base({
  id: 'sqlite-fts',
  label: 'SQLite · FTS5 inverted index',
  short: 'SQLite FTS5',
  index: 'inverted',
  fts: true,
  vector: false,
  note: 'Adds an FTS5 external-content index over the memory body, ranked by BM25.',
  supports: { predicates: true, joins: true, aggregates: true, transactions: true, vector: false },
})

export const sqliteHybrid = () => base({
  id: 'sqlite-hybrid',
  label: 'SQLite · FTS5 + vectors',
  short: 'SQLite hybrid',
  index: 'hybrid',
  fts: true,
  vector: true,
  note: 'BM25 and cosine fused by reciprocal rank. No vector access method exists, so the similarity side is a sequential scan.',
  supports: { predicates: true, joins: true, aggregates: true, transactions: true, vector: 'scan' },
})
