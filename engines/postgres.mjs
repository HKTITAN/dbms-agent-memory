/**
 * The server-DBMS arms: PostgreSQL 18.3, run through PGlite so the whole study
 * reproduces from `npm install` with no service to provision.
 *
 * Four arms over the same normalised schema:
 *
 *   pg-btree    B-trees only; text matching is a sequential scan.
 *   pg-gin      adds a stored tsvector with a GIN inverted index.
 *   pg-hnsw     adds pgvector with an HNSW graph index.
 *   pg-hybrid   both, fused by reciprocal rank *inside SQL*.
 *
 * The hybrid arm is the one worth reading. Its fusion is a single statement:
 * two CTEs, a window function for the ranks, a union and a group-by. No
 * application-side merge step exists, which is the argument the paper makes in
 * §7 — that retrieval strategy is expressible as a query rather than as code.
 */

import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { vector as pgvectorExt } from '@electric-sql/pglite-pgvector'
import { pageinspect } from '@electric-sql/pglite/contrib/pageinspect'
import { ddl, SECONDARY_INDEXES } from './schema.mjs'
import { DEFAULT_K, RRF_K } from './contract.mjs'

const dirSize = (p) => {
  if (!fs.existsSync(p)) return 0
  let n = 0
  for (const d of fs.readdirSync(p, { withFileTypes: true })) {
    const f = `${p}/${d.name}`
    n += d.isDirectory() ? dirSize(f) : fs.statSync(f).size
  }
  return n
}

const vecLiteral = (v) => {
  let s = '['
  for (let i = 0; i < v.length; i++) { if (i) s += ','; s += v[i] }
  return s + ']'
}

function base({ id, label, short, index, note, gin, hnsw, supports }) {
  let db = null
  let dir = null
  let dim = 384

  const where = (p, alias = 'm') => {
    if (!p) return { sql: '', params: [] }
    switch (p.op) {
      case '<=': return { sql: ` AND ${alias}.created_day <= $P`, params: [p.value] }
      case '>=': return { sql: ` AND ${alias}.created_day >= $P`, params: [p.value] }
      case '=': return { sql: ` AND ${alias}.session_id = $P`, params: [p.value] }
      case 'is null': return { sql: ` AND ${alias}.superseded_by IS NULL`, params: [] }
      case 'count': return { sql: ` AND ${alias}.fact_id = $P`, params: [p.value] }
      default: return { sql: '', params: [] }
    }
  }

  /** Renumber $P placeholders into $1..$n in the order they appear. */
  const bind = (sql, params) => {
    let i = 0
    return { sql: sql.replace(/\$P/g, () => `$${++i}`), params }
  }

  const tsq = (terms) => terms.map((t) => `'${t.replace(/'/g, '')}'`).join(' | ') || `'x'`

  return {
    id, label, short, index, note,
    family: 'postgres',
    engine: 'PostgreSQL 18.3 (PGlite)',
    supports,

    async open(o) {
      dir = o.dir
      dim = o.dim
      fs.rmSync(dir, { recursive: true, force: true })
      db = await PGlite.create({
        dataDir: dir,
        extensions: hnsw ? { vector: pgvectorExt, pageinspect } : { pageinspect },
      })
      if (hnsw) await db.exec('CREATE EXTENSION IF NOT EXISTS vector')
      await db.exec('CREATE EXTENSION IF NOT EXISTS pageinspect')
      for (const stmt of ddl('postgres', { vector: hnsw })) await db.exec(stmt)
      if (gin) {
        // A stored generated column: the inverted index needs something to index,
        // and materialising it is itself a storage cost §6.3 accounts for.
        await db.exec(`ALTER TABLE memory ADD COLUMN ts tsvector
          GENERATED ALWAYS AS (to_tsvector('english', body)) STORED`)
      }
      this._db = db
    },

    async load(memories, embed) {
      const t0 = process.hrtime.bigint()
      await db.exec('BEGIN')
      await db.query('INSERT INTO agent VALUES ($1,$2,$3)', ['A-1', 'claude-opus', 'anthropic'])

      const dayOf = new Map()
      for (const m of memories) if (!dayOf.has(m.sessionId)) dayOf.set(m.sessionId, m.day)
      await batch(db, 'INSERT INTO session VALUES', 3,
        [...dayOf.entries()].map(([s, d]) => [s, 'A-1', d]))

      const ents = new Set()
      for (const m of memories) for (const e of m.entities ?? []) ents.add(e)
      await batch(db, 'INSERT INTO entity VALUES', 3,
        [...ents].map((e) => [e, e.split('-')[0], e]))

      const facts = new Map()
      for (const m of memories) if (m.factId && !facts.has(m.factId)) facts.set(m.factId, m)
      await batch(db, 'INSERT INTO fact VALUES', 6,
        [...facts].map(([fid, m]) => [fid, m.entities?.[0] ?? null, fid.split('-')[1] ?? 'unknown', '', m.kind, m.day]))

      await batch(db,
        'INSERT INTO memory (memory_id,session_id,turn_no,seq,kind,body,fact_id,created_day,source,confidence) VALUES',
        10, memories.map((m) => [m.id, m.sessionId, m.turn, m.seq, m.kind, m.body, m.factId, m.day, m.source, m.confidence]))

      const sup = memories.filter((m) => m.supersededBy)
      for (let i = 0; i < sup.length; i += 500) {
        const chunk = sup.slice(i, i + 500)
        const vals = chunk.map((_, j) => `($${j * 2 + 1},$${j * 2 + 2})`).join(',')
        await db.query(
          `UPDATE memory SET superseded_by = v.sb FROM (VALUES ${vals}) AS v(mid, sb) WHERE memory.memory_id = v.mid`,
          chunk.flatMap((m) => [m.id, m.supersededBy]),
        )
      }

      const pairs = []
      const seen = new Set()
      for (const m of memories) {
        for (const e of m.entities ?? []) {
          const kk = `${m.id}|${e}`
          if (!seen.has(kk)) { seen.add(kk); pairs.push([m.id, e]) }
        }
      }
      await batch(db, 'INSERT INTO memory_entity VALUES', 2, pairs)

      if (hnsw) {
        await batch(db, 'INSERT INTO embedding VALUES', 4,
          memories.map((m) => [m.id, 'MiniLM-L6-v2', dim, vecLiteral(embed.get(m.body))]), 150)
      }
      await db.exec('COMMIT')
      const ingestMs = Number(process.hrtime.bigint() - t0) / 1e6

      const t1 = process.hrtime.bigint()
      for (const ix of SECONDARY_INDEXES) {
        await db.exec(`CREATE INDEX ${ix.name} ON ${ix.table}(${ix.cols.join(',')})`)
      }
      if (gin) await db.exec('CREATE INDEX ix_memory_ts ON memory USING gin(ts)')
      if (hnsw) await db.exec('CREATE INDEX ix_embedding_vec ON embedding USING hnsw (vec vector_cosine_ops)')
      await db.exec('ANALYZE')
      const indexMs = Number(process.hrtime.bigint() - t1) / 1e6
      return { ingestMs, indexMs }
    },

    async recall(q) {
      const k = q.k ?? DEFAULT_K
      const w = where(q.predicate)

      if (gin && hnsw) {
        // Reciprocal rank fusion, entirely in SQL.
        const b = bind(
          `WITH lex AS (
             SELECT memory_id, row_number() OVER () AS rk FROM (
               SELECT m.memory_id FROM memory m
               WHERE m.ts @@ to_tsquery('english', $P)${w.sql}
               ORDER BY ts_rank_cd(m.ts, to_tsquery('english', $P)) DESC
               LIMIT $P
             ) l
           ),
           vec AS (
             SELECT memory_id, row_number() OVER () AS rk FROM (
               SELECT e.memory_id FROM embedding e JOIN memory m USING (memory_id)
               WHERE TRUE${w.sql}
               ORDER BY e.vec <=> $P::vector
               LIMIT $P
             ) v
           )
           SELECT memory_id, SUM(1.0/($P + rk)) AS s
           FROM (SELECT * FROM lex UNION ALL SELECT * FROM vec) u
           GROUP BY memory_id ORDER BY s DESC, memory_id LIMIT $P`,
          [tsq(q.terms), ...w.params, tsq(q.terms), k * 5,
            ...w.params, vecLiteral(q.embedding), k * 5, RRF_K, k],
        )
        const res = await db.query(b.sql, b.params)
        return { ids: res.rows.map((r) => r.memory_id) }
      }

      if (hnsw) {
        const b = bind(
          `SELECT e.memory_id FROM embedding e JOIN memory m USING (memory_id)
           WHERE TRUE${w.sql} ORDER BY e.vec <=> $P::vector LIMIT $P`,
          [...w.params, vecLiteral(q.embedding), k],
        )
        return { ids: (await db.query(b.sql, b.params)).rows.map((r) => r.memory_id) }
      }

      if (gin) {
        const b = bind(
          `SELECT m.memory_id FROM memory m
           WHERE m.ts @@ to_tsquery('english', $P)${w.sql}
           ORDER BY ts_rank_cd(m.ts, to_tsquery('english', $P)) DESC LIMIT $P`,
          [tsq(q.terms), ...w.params, tsq(q.terms), k],
        )
        return { ids: (await db.query(b.sql, b.params)).rows.map((r) => r.memory_id) }
      }

      // B-tree only: no text access method, so this is a scan with a scored filter.
      const conds = q.terms.map(() => `(CASE WHEN m.body ILIKE $P THEN 1 ELSE 0 END)`).join(' + ')
      const likes = q.terms.map((t) => `%${t}%`)
      const b = bind(
        `SELECT m.memory_id, (${conds}) AS s FROM memory m
         WHERE TRUE${w.sql} AND (${conds}) > 0 ORDER BY s DESC, m.seq DESC LIMIT $P`,
        [...likes, ...w.params, ...likes, k],
      )
      return { ids: (await db.query(b.sql, b.params)).rows.map((r) => r.memory_id) }
    },

    async aggregate(q) {
      if (!q.predicate || q.predicate.op !== 'count') return null
      const r = await db.query('SELECT COUNT(*)::int AS n FROM memory WHERE fact_id = $1', [q.predicate.value])
      return r.rows[0].n
    },

    async storage() {
      const r = await db.query(`
        SELECT c.relname AS name, c.relkind AS relkind,
               pg_total_relation_size(c.oid) AS total,
               pg_relation_size(c.oid) AS own
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r','i')
        ORDER BY pg_relation_size(c.oid) DESC`)
      const kindOf = (n, rk) => {
        if (n === 'ix_memory_ts') return 'inverted'
        if (n === 'ix_embedding_vec') return 'vector'
        if (n === 'embedding') return 'vector'
        if (rk === 'i') return 'btree'
        return 'heap'
      }
      const breakdown = r.rows.map((x) => ({
        name: x.name, kind: kindOf(x.name, x.relkind), bytes: Number(x.own),
      })).filter((x) => x.bytes > 0)
      return {
        totalBytes: breakdown.reduce((s, b) => s + b.bytes, 0),
        clusterBytes: dirSize(dir),
        breakdown,
      }
    },

    async explain(q) {
      const w = where(q.predicate)
      let b
      if (hnsw && !gin) {
        b = bind(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
          SELECT e.memory_id FROM embedding e JOIN memory m USING (memory_id)
          WHERE TRUE${w.sql} ORDER BY e.vec <=> $P::vector LIMIT 10`,
        [...w.params, vecLiteral(q.embedding)])
      } else if (gin) {
        b = bind(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
          SELECT m.memory_id FROM memory m WHERE m.ts @@ to_tsquery('english', $P)${w.sql}
          ORDER BY ts_rank_cd(m.ts, to_tsquery('english', $P)) DESC LIMIT 10`,
        [tsq(q.terms), ...w.params, tsq(q.terms)])
      } else {
        b = bind(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
          SELECT m.memory_id FROM memory m WHERE m.body ILIKE $P${w.sql} LIMIT 10`,
        [`%${q.terms[0] ?? ''}%`, ...w.params])
      }
      const res = await db.query(b.sql, b.params)
      const plan = res.rows[0]['QUERY PLAN']
      return { plan, text: summarisePlan(plan[0].Plan), sql: b.sql.replace(/^EXPLAIN[^\n]*\n/, '').trim() }
    },

    handle() { return db },

    async close() { try { await db?.close() } catch { /* closed by a crash test */ } },
  }
}

/** Multi-row INSERT in parameter-bounded chunks. Postgres caps a statement at 65535 parameters. */
async function batch(db, prefix, cols, rows, chunkSize) {
  if (!rows.length) return
  const size = chunkSize ?? Math.max(1, Math.min(500, Math.floor(60000 / cols)))
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size)
    const values = chunk.map((_, r) =>
      `(${Array.from({ length: cols }, (_, c) => `$${r * cols + c + 1}`).join(',')})`).join(',')
    await db.query(`${prefix} ${values}`, chunk.flat())
  }
}

/** Flatten a Postgres plan tree into the node chain a reader can scan. */
export function summarisePlan(node, depth = 0) {
  const pad = '  '.repeat(depth)
  const idx = node['Index Name'] ? ` using ${node['Index Name']}` : ''
  const rel = node['Relation Name'] ? ` on ${node['Relation Name']}` : ''
  let line = `${pad}${node['Node Type']}${rel}${idx}`
  line += ` (actual ${Number(node['Actual Total Time'] ?? 0).toFixed(3)} ms, rows ${node['Actual Rows'] ?? 0}`
  if (node['Shared Read Blocks'] != null) {
    line += `, buffers ${node['Shared Hit Blocks'] ?? 0}h/${node['Shared Read Blocks'] ?? 0}r`
  }
  line += ')'
  const kids = node.Plans ?? []
  return [line, ...kids.map((c) => summarisePlan(c, depth + 1))].join('\n')
}

/* ----------------------------------------------------------------- arms */

export const pgBtree = () => base({
  id: 'pg-btree',
  label: 'Postgres · B-tree only',
  short: 'PG B-tree',
  index: 'btree',
  gin: false,
  hnsw: false,
  note: 'The same BCNF schema with B-tree secondary indexes. Text matching has no access method.',
  supports: { predicates: true, joins: true, aggregates: true, transactions: true, vector: false },
})

export const pgGin = () => base({
  id: 'pg-gin',
  label: 'Postgres · GIN inverted index',
  short: 'PG GIN',
  index: 'inverted',
  gin: true,
  hnsw: false,
  note: 'A stored tsvector with a GIN index, ranked by cover density.',
  supports: { predicates: true, joins: true, aggregates: true, transactions: true, vector: false },
})

export const pgHnsw = () => base({
  id: 'pg-hnsw',
  label: 'Postgres · pgvector HNSW',
  short: 'PG HNSW',
  index: 'vector',
  gin: false,
  hnsw: true,
  note: 'An approximate nearest-neighbour graph index over the embedding, with predicates applied by the planner.',
  supports: { predicates: true, joins: true, aggregates: true, transactions: true, vector: 'hnsw' },
})

export const pgHybrid = () => base({
  id: 'pg-hybrid',
  label: 'Postgres · GIN + HNSW hybrid',
  short: 'PG hybrid',
  index: 'hybrid',
  gin: true,
  hnsw: true,
  note: 'Both indexes, fused by reciprocal rank inside a single SQL statement.',
  supports: { predicates: true, joins: true, aggregates: true, transactions: true, vector: 'hnsw' },
})
