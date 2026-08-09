/**
 * The engine registry.
 *
 * Ten arms across three families. The ordering is the order they appear in
 * every table and chart in the paper: least machinery first, so a reader moving
 * down a column is moving along the axis the paper is about.
 */

import { fileJsonl, fileVec, fileVecMeta } from './file.mjs'
import { sqliteBtree, sqliteFts, sqliteHybrid } from './sqlite.mjs'
import { pgBtree, pgGin, pgHnsw, pgHybrid } from './postgres.mjs'

export const ENGINES = [
  fileJsonl,
  fileVec,
  fileVecMeta,
  sqliteBtree,
  sqliteFts,
  sqliteHybrid,
  pgBtree,
  pgGin,
  pgHnsw,
  pgHybrid,
]

export const FAMILIES = {
  file: { label: 'File store', blurb: 'No engine. What most agent memory implementations ship today.' },
  sqlite: { label: 'Embedded DBMS', blurb: 'SQLite 3.53 in-process, one file, full SQL.' },
  postgres: { label: 'Server DBMS', blurb: 'PostgreSQL 18.3 with pgvector and GIN.' },
}

export const build = () => ENGINES.map((f) => f())

export { fileVecMeta }
