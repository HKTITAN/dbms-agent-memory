/**
 * The arm registry.
 *
 * Five arms across three families, ordered the way every table and chart in the
 * paper orders them: the substrate Lore actually uses first, then the two
 * relational engines, then the ablations. A reader moving down a column is
 * moving along the axis the paper is about — how much of the question the store
 * is willing to answer itself.
 */

import { notionArm } from './notion.mjs'
import { sqliteFull, sqliteNoIndex } from './sqlite.mjs'
import { pgFull, pgNoIndex } from './postgres.mjs'

export const ARMS = [notionArm, sqliteFull, pgFull, sqliteNoIndex, pgNoIndex]

export const PRIMARY_ARMS = [notionArm, sqliteFull, pgFull]

export const FAMILIES = {
  notion: {
    label: 'Notion Data API',
    blurb: 'What Lore ships on. Pages, property filters, cursors, and no joins.',
    emulated: true,
  },
  sqlite: {
    label: 'Embedded DBMS',
    blurb: 'SQLite in process, one file, already installed with Node.',
    emulated: false,
  },
  postgres: {
    label: 'Server DBMS',
    blurb: 'PostgreSQL through PGlite: range types, exclusion constraints, GIN.',
    emulated: false,
  },
}

export const build = (list = ARMS) => list.map((f) => f())
