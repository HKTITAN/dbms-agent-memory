/**
 * Full-text semantics: three indexes over identical text, three different answers.
 *
 * This experiment exists because the workload turned one up by accident. The
 * query "timed out" matches nothing in the corpus as a literal substring — the
 * memories say "times out". SQLite's FTS5, whose default tokeniser does not stem,
 * agrees with the substring: zero rows. PostgreSQL's `phraseto_tsquery` with the
 * English configuration stems both "timed" and "times" to "time" and returns
 * hundreds. Notion's search endpoint matches titles, so it returns whatever
 * happens to be in a title and nothing from a body at all.
 *
 * None of the three is wrong. "Which memories discuss this" has no
 * character-level answer, and a stemmer is a considered position on the question,
 * not a bug. What matters for a memory system is that the position is *chosen*:
 * an agent that asks the same question of two vaults built on two engines gets
 * two different sets of facts to reason from, and nothing in either answer says
 * so.
 *
 * We therefore report the divergence directly rather than letting it show up as
 * a fraction of a point of F1 in a table about something else.
 */

import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { loadVault } from '../../engines/notion.mjs'

export async function fullTextSemantics(vault, terms) {
  const live = vault.memories.filter((m) => !m.archived)

  /* ---- 1. literal substring: the definition the oracle uses ---- */
  const substring = new Map()
  for (const t of terms) {
    const needle = t.toLowerCase()
    substring.set(t, new Set(live.filter((m) => m.body.toLowerCase().includes(needle)).map((m) => m.memory_id)))
  }

  /* ---- 2. SQLite FTS5, unstemmed by default ---- */
  const sq = new DatabaseSync(':memory:')
  sq.exec('CREATE TABLE memory (memory_id TEXT PRIMARY KEY, body TEXT)')
  const ins = sq.prepare('INSERT INTO memory VALUES (?, ?)')
  for (const m of live) ins.run(m.memory_id, m.body)
  sq.exec("CREATE VIRTUAL TABLE memory_fts USING fts5(body, content='memory', content_rowid='rowid')")
  sq.exec('INSERT INTO memory_fts(rowid, body) SELECT rowid, body FROM memory')
  const fts5 = new Map()
  for (const t of terms) {
    const rows = sq.prepare(
      'SELECT m.memory_id AS id FROM memory_fts JOIN memory m ON m.rowid = memory_fts.rowid WHERE memory_fts MATCH ?',
    ).all(`"${t.replace(/"/g, '""')}"`)
    fts5.set(t, new Set(rows.map((r) => r.id)))
  }
  sq.close()

  /* ---- 3. PostgreSQL GIN over to_tsvector('english'), which stems ---- */
  const pg = new PGlite()
  await pg.exec('SET client_min_messages = warning')
  await pg.exec('CREATE TABLE memory (memory_id TEXT PRIMARY KEY, body TEXT)')
  for (let i = 0; i < live.length; i += 400) {
    const slice = live.slice(i, i + 400)
    const vals = []
    const params = []
    let n = 1
    for (const m of slice) { vals.push(`($${n++},$${n++})`); params.push(m.memory_id, m.body) }
    await pg.query(`INSERT INTO memory VALUES ${vals.join(',')}`, params)
  }
  await pg.exec("CREATE INDEX ix_body ON memory USING gin (to_tsvector('english', body))")
  const gin = new Map()
  const lexemes = new Map()
  for (const t of terms) {
    const res = await pg.query(
      "SELECT memory_id AS id FROM memory WHERE to_tsvector('english', body) @@ phraseto_tsquery('english', $1)",
      [t],
    )
    gin.set(t, new Set(res.rows.map((r) => r.id)))
    const lex = await pg.query("SELECT phraseto_tsquery('english', $1)::text AS q", [t])
    lexemes.set(t, lex.rows[0].q)
  }
  await pg.close()

  /* ---- 4. Notion's search endpoint: titles only ---- */
  const db = loadVault(vault)
  const titles = new Map()
  for (const t of terms) {
    db.reset()
    const hits = db.search(t, { page_size: 100 })
    titles.set(t, new Set(hits.results.filter((p) => p.ds === 'Memories').map((p) => p.id)))
  }

  /* ---- 5. report ---- */
  const jaccard = (a, b) => {
    if (!a.size && !b.size) return 1
    let inter = 0
    for (const x of a) if (b.has(x)) inter++
    return Number((inter / (a.size + b.size - inter)).toFixed(4))
  }

  const rows = terms.map((t) => ({
    term: t,
    lexemes: lexemes.get(t),
    substring: substring.get(t).size,
    fts5: fts5.get(t).size,
    gin: gin.get(t).size,
    notionTitleSearch: titles.get(t).size,
    fts5VsSubstring: jaccard(fts5.get(t), substring.get(t)),
    ginVsSubstring: jaccard(gin.get(t), substring.get(t)),
    ginVsFts5: jaccard(gin.get(t), fts5.get(t)),
  }))

  const disagreeing = rows.filter((r) => r.ginVsFts5 < 1)

  return {
    terms: rows,
    termsWhereIndexesDisagree: disagreeing.length,
    termsTotal: terms.length,
    worst: disagreeing.slice().sort((a, b) => a.ginVsFts5 - b.ginVsFts5)[0] ?? null,
    notionReachesBodies: false,
    note: 'FTS5 does not stem by default; to_tsvector(\'english\', ...) does. The same phrase, over the same text, is a different query in each engine — and the answer the agent reasons from changes with it.',
  }
}
