/**
 * An emulator for the Notion Data API, and the Lore arm that runs on top of it.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 *
 * This is not a measurement of Notion's production service. We hold no workspace
 * and issue no requests. It is an emulator whose surface is restricted to
 * operations the public API reference documents, and whose refusals are
 * restricted to things that reference does not offer. Every restriction below
 * carries the page it comes from:
 *
 *   - pagination: default page_size 10, maximum 100, cursor-based with
 *     has_more / next_cursor            developers.notion.com/reference/intro
 *   - rate limit: "an average of three requests per second" per connection,
 *     429 with Retry-After              developers.notion.com/reference/request-limits
 *   - relation property: at most 100 related pages
 *                                       developers.notion.com/reference/request-limits
 *   - rich_text: 2 000 characters       developers.notion.com/reference/request-limits
 *   - filters: property predicates and nested and/or compounds; sorts on
 *     properties or timestamps; no joins and no aggregates are offered
 *                                       developers.notion.com/reference/post-database-query
 *   - search: matches titles, not page content
 *                                       developers.notion.com/reference/post-search
 *   - no ETag, If-Match, or any documented compare-and-swap
 *                                       developers.notion.com/reference/intro
 *
 * Because it is an emulator, wall-clock time through it is meaningless and we do
 * not report it. What it produces instead are *counts*: round trips, bytes on
 * the wire, and rows the client had to examine because the store could not. A
 * round trip is a round trip regardless of whose socket carries it, and the
 * count is fixed by the API's shape, not by anyone's network.
 *
 * The page body is modelled separately from properties throughout, because that
 * distinction is load-bearing for Lore: a memory's text lives in blocks, and no
 * property filter can see blocks.
 */

import {
  NOTION_PAGE_DEFAULT, NOTION_PAGE_MAX, newLedger, resolveEntityIds,
  validAt, overlaps, tokenize,
} from './contract.mjs'
import { FUNCTIONAL_PREDICATES } from './schema.mjs'

/** Thrown when a caller asks for something the Data API does not offer. */
export class UnsupportedByNotion extends Error {
  constructor(what, why) {
    super(`${what}: ${why}`)
    this.what = what
    this.why = why
  }
}

/* --------------------------------------------------------------- the store */

/**
 * A page is `{ id, ds, properties, body, created_time, last_edited_time,
 * archived }`. Properties are typed cells; `body` is block text and is only
 * reachable through a separate children request.
 */
export class NotionEmulator {
  constructor() {
    this.pages = new Map()
    this.dataSources = new Map() // ds name -> Set of page ids
    this.ledger = newLedger()
    this.calls = []            // one entry per request, for the round-trip audit
    this.enforceLimits = true
  }

  reset() {
    this.ledger = newLedger()
    this.calls = []
  }

  _charge(kind, { bytesOut = 0, bytesIn = 0, rows = 0 } = {}) {
    this.ledger.roundTrips += 1
    this.ledger.bytesOut += bytesOut
    this.ledger.bytesIn += bytesIn
    this.ledger.rowsReturned += rows
    this.calls.push(kind)
  }

  /* ---- writes ---- */

  createDataSource(name) {
    if (!this.dataSources.has(name)) this.dataSources.set(name, new Set())
  }

  /** Seeding path. Does not charge a round trip: loading is not part of the workload. */
  seed(ds, page) {
    this.createDataSource(ds)
    this.pages.set(page.id, { archived: false, ...page, ds })
    this.dataSources.get(ds).add(page.id)
  }

  /** POST /v1/pages */
  createPage(ds, properties, body = '') {
    const id = properties.__id ?? `pg_${this.pages.size}_${Math.random().toString(36).slice(2, 8)}`
    const props = { ...properties }
    delete props.__id
    if (this.enforceLimits) validateProperties(props)
    const now = properties.created_time ?? Date.now()
    this._charge('pages.create', { bytesOut: sizeOf(props) + body.length, bytesIn: 300 })
    this.createDataSource(ds)
    this.pages.set(id, { id, ds, properties: props, body, created_time: now, last_edited_time: now, archived: false })
    this.dataSources.get(ds).add(id)
    return { id }
  }

  /**
   * PATCH /v1/pages/{id}
   *
   * Last write wins. The API documents no ETag, no If-Match and no version
   * token, so a caller cannot say "only apply this if the page still looks the
   * way I read it". That absence is the whole of §6.3.
   */
  updatePage(id, properties, body) {
    const p = this.pages.get(id)
    this._charge('pages.update', { bytesOut: sizeOf(properties), bytesIn: 300 })
    if (!p) return null
    if (this.enforceLimits) validateProperties(properties)
    Object.assign(p.properties, properties)
    if (body !== undefined) p.body = body
    p.last_edited_time = Date.now()
    return p
  }

  /** GET /v1/pages/{id} — properties only. The body is a second request. */
  retrievePage(id) {
    const p = this.pages.get(id)
    this._charge('pages.retrieve', { bytesOut: 120, bytesIn: p ? sizeOf(p.properties) : 40, rows: p ? 1 : 0 })
    return p ?? null
  }

  /**
   * GET /v1/blocks/{id}/children
   *
   * This is how a memory's text is read. It cannot be filtered, it cannot be
   * searched, and it is one request per memory.
   */
  retrieveBlockChildren(id) {
    const p = this.pages.get(id)
    this._charge('blocks.children', { bytesOut: 120, bytesIn: p ? p.body.length : 40, rows: p ? 1 : 0 })
    return p ? p.body : null
  }

  /**
   * POST /v1/data_sources/{id}/query
   *
   * Filters, sorts, one page of results. No joins, no aggregates, no grouping.
   * A caller that wants any of those gets rows and does the work itself.
   */
  /** Evaluate a filter across one data source. Not itself a request. */
  _scan(ds, filter, sorts) {
    const ids = this.dataSources.get(ds) ?? new Set()
    let rows = []
    for (const id of ids) {
      const p = this.pages.get(id)
      if (!p || p.archived) continue
      if (filter && !matches(p, filter)) continue
      rows.push(p)
    }
    if (sorts) rows = applySorts(rows, sorts)
    else rows.sort((a, b) => (a.id < b.id ? -1 : 1))
    return rows
  }

  queryDataSource(ds, { filter = null, sorts = null, start_cursor = null, page_size = NOTION_PAGE_DEFAULT } = {}) {
    if (page_size > NOTION_PAGE_MAX) {
      throw new UnsupportedByNotion('page_size', `maximum is ${NOTION_PAGE_MAX}`)
    }
    const rows = this._scan(ds, filter, sorts)
    const from = start_cursor ? rows.findIndex((r) => r.id === start_cursor) : 0
    const slice = rows.slice(Math.max(0, from), Math.max(0, from) + page_size)
    const nextIndex = Math.max(0, from) + page_size
    const has_more = nextIndex < rows.length
    const bytesIn = slice.reduce((s, p) => s + sizeOf(p.properties), 0)
    this._charge('dataSource.query', { bytesOut: sizeOf(filter ?? {}) + 200, bytesIn, rows: slice.length })
    return {
      results: slice,
      has_more,
      next_cursor: has_more ? rows[nextIndex].id : null,
    }
  }

  /**
   * Drain every page of a query.
   *
   * The predicate is evaluated once and the pagination is then *charged* rather
   * than replayed: a result set of n rows costs ceil(n / 100) requests, which is
   * exactly what a cursor walk against the real API costs. Replaying the scan
   * per page would change nothing about the accounting and would make a capture
   * run quadratic in vault size for no gain in fidelity.
   */
  queryAll(ds, opts = {}) {
    const rows = this._scan(ds, opts.filter ?? null, opts.sorts ?? null)
    const pages = Math.max(1, Math.ceil(rows.length / NOTION_PAGE_MAX))
    const filterBytes = sizeOf(opts.filter ?? {}) + 200
    for (let i = 0; i < pages; i++) {
      const slice = rows.slice(i * NOTION_PAGE_MAX, (i + 1) * NOTION_PAGE_MAX)
      this._charge('dataSource.query', {
        bytesOut: filterBytes,
        bytesIn: slice.reduce((s, p) => s + sizeOf(p.properties), 0),
        rows: slice.length,
      })
    }
    return rows
  }

  /**
   * POST /v1/search
   *
   * "Returns all pages ... that have titles that include the query param."
   * Titles. Not bodies. A memory whose title is a summary and whose text is the
   * content is, to this endpoint, invisible below the first line.
   */
  search(query, { page_size = NOTION_PAGE_DEFAULT } = {}) {
    const q = String(query).toLowerCase()
    const hits = []
    for (const p of this.pages.values()) {
      if (p.archived) continue
      const title = titleOf(p)
      if (title && title.toLowerCase().includes(q)) hits.push(p)
    }
    hits.sort((a, b) => b.last_edited_time - a.last_edited_time)
    const slice = hits.slice(0, page_size)
    this._charge('search', { bytesOut: 150, bytesIn: slice.reduce((s, p) => s + sizeOf(p.properties), 0), rows: slice.length })
    return { results: slice, has_more: hits.length > page_size }
  }

  /** Rows the client had to look at itself. Charged by the arm, not by the API. */
  chargeClientScan(n) {
    this.ledger.rowsClientSide += n
  }

  note(unsupported) {
    if (!this.ledger.unsupported.includes(unsupported)) this.ledger.unsupported.push(unsupported)
  }
}

/* --------------------------------------------------------- filter language */

/**
 * The documented filter surface: a property predicate, or an `and` / `or`
 * compound of them. Operators are the ones the reference lists per property
 * type. Anything else throws rather than silently succeeding, because a silent
 * success would let this emulator flatter Notion.
 */
function matches(page, filter) {
  if (filter.and) return filter.and.every((f) => matches(page, f))
  if (filter.or) return filter.or.some((f) => matches(page, f))

  const { property, timestamp } = filter
  const cell = timestamp ? page[timestamp] : page.properties[property]

  for (const [type, cond] of Object.entries(filter)) {
    if (type === 'property' || type === 'timestamp') continue
    switch (type) {
      case 'title':
      case 'rich_text':
        return textOp(cell, cond)
      case 'select':
        if ('equals' in cond) return cell === cond.equals
        if ('does_not_equal' in cond) return cell !== cond.does_not_equal
        if ('is_empty' in cond) return cell == null || cell === ''
        if ('is_not_empty' in cond) return cell != null && cell !== ''
        throw new UnsupportedByNotion('select filter', JSON.stringify(cond))
      case 'multi_select': {
        const arr = Array.isArray(cell) ? cell : []
        if ('contains' in cond) return arr.includes(cond.contains)
        if ('does_not_contain' in cond) return !arr.includes(cond.does_not_contain)
        if ('is_empty' in cond) return arr.length === 0
        if ('is_not_empty' in cond) return arr.length > 0
        throw new UnsupportedByNotion('multi_select filter', JSON.stringify(cond))
      }
      case 'relation': {
        const arr = Array.isArray(cell) ? cell : (cell == null ? [] : [cell])
        if ('contains' in cond) return arr.includes(cond.contains)
        if ('does_not_contain' in cond) return !arr.includes(cond.does_not_contain)
        if ('is_empty' in cond) return arr.length === 0
        if ('is_not_empty' in cond) return arr.length > 0
        throw new UnsupportedByNotion('relation filter', JSON.stringify(cond))
      }
      case 'number':
        if ('equals' in cond) return cell === cond.equals
        if ('greater_than' in cond) return cell != null && cell > cond.greater_than
        if ('less_than' in cond) return cell != null && cell < cond.less_than
        if ('greater_than_or_equal_to' in cond) return cell != null && cell >= cond.greater_than_or_equal_to
        if ('less_than_or_equal_to' in cond) return cell != null && cell <= cond.less_than_or_equal_to
        if ('is_empty' in cond) return cell == null
        if ('is_not_empty' in cond) return cell != null
        throw new UnsupportedByNotion('number filter', JSON.stringify(cond))
      case 'date':
        if ('on_or_before' in cond) return cell != null && cell <= cond.on_or_before
        if ('on_or_after' in cond) return cell != null && cell >= cond.on_or_after
        if ('before' in cond) return cell != null && cell < cond.before
        if ('after' in cond) return cell != null && cell > cond.after
        if ('equals' in cond) return cell === cond.equals
        if ('is_empty' in cond) return cell == null
        if ('is_not_empty' in cond) return cell != null
        throw new UnsupportedByNotion('date filter', JSON.stringify(cond))
      case 'checkbox':
        return Boolean(cell) === cond.equals
      default:
        throw new UnsupportedByNotion(`filter type ${type}`, 'not in the documented filter surface')
    }
  }
  return true
}

function textOp(cell, cond) {
  const s = cell == null ? '' : String(cell)
  if ('equals' in cond) return s === cond.equals
  if ('does_not_equal' in cond) return s !== cond.does_not_equal
  if ('contains' in cond) return s.toLowerCase().includes(String(cond.contains).toLowerCase())
  if ('does_not_contain' in cond) return !s.toLowerCase().includes(String(cond.does_not_contain).toLowerCase())
  if ('starts_with' in cond) return s.toLowerCase().startsWith(String(cond.starts_with).toLowerCase())
  if ('ends_with' in cond) return s.toLowerCase().endsWith(String(cond.ends_with).toLowerCase())
  if ('is_empty' in cond) return s === ''
  if ('is_not_empty' in cond) return s !== ''
  throw new UnsupportedByNotion('text filter', JSON.stringify(cond))
}

function applySorts(rows, sorts) {
  return rows.slice().sort((a, b) => {
    for (const s of sorts) {
      const av = s.timestamp ? a[s.timestamp] : a.properties[s.property]
      const bv = s.timestamp ? b[s.timestamp] : b.properties[s.property]
      let c = 0
      if (av == null && bv == null) c = 0
      else if (av == null) c = 1
      else if (bv == null) c = -1
      else c = av < bv ? -1 : av > bv ? 1 : 0
      if (s.direction === 'descending') c = -c
      if (c !== 0) return c
    }
    return a.id < b.id ? -1 : 1
  })
}

/* ------------------------------------------------------------ limit checks */

const LIMITS = { rich_text: 2000, relation: 100, multi_select: 100, people: 100 }

export const LIMIT_VIOLATIONS = []

function validateProperties(props) {
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === 'string' && v.length > LIMITS.rich_text && k !== '__body') {
      LIMIT_VIOLATIONS.push({ property: k, kind: 'rich_text', length: v.length, limit: LIMITS.rich_text })
    }
    if (Array.isArray(v) && v.length > LIMITS.relation) {
      LIMIT_VIOLATIONS.push({ property: k, kind: 'array', length: v.length, limit: LIMITS.relation })
    }
  }
}

function sizeOf(o) {
  try { return JSON.stringify(o).length } catch { return 0 }
}

function titleOf(p) {
  return p.properties.__title != null ? String(p.properties.__title) : null
}

/* ------------------------------------------------------------ the Lore arm */

/**
 * Load the generated vault into the emulator the way `lore init` lays it out:
 * five data sources, one page per row, repeating groups inside cells, relations
 * as arrays of page ids.
 */
export function loadVault(vault) {
  const db = new NotionEmulator()
  for (const name of ['Projects', 'Topics', 'Memories', 'Entities', 'Facts']) db.createDataSource(name)

  for (const p of vault.projects) {
    db.seed('Projects', {
      id: p.project_id,
      properties: { __title: p.name, Name: p.name, Type: p.type, Path: p.path, Status: p.status, Description: p.description },
      body: '',
      created_time: 0,
      last_edited_time: 0,
    })
  }
  for (const t of vault.topics) {
    db.seed('Topics', {
      id: t.topic_id,
      properties: { __title: t.name, Name: t.name, Description: t.description, Project: t.project_id ? [t.project_id] : [] },
      body: '',
      created_time: 0,
      last_edited_time: 0,
    })
  }

  const tagsByMemory = groupBy(vault.memoryTags, 'memory_id', 'tag')
  const projectsByMemory = groupBy(vault.memoryProjects, 'memory_id', 'project_id')
  const topicsByMemory = groupBy(vault.memoryTopics, 'memory_id', 'topic_id')

  for (const m of vault.memories) {
    db.seed('Memories', {
      id: m.memory_id,
      properties: {
        __title: m.title,
        Title: m.title,
        Kind: m.kind,
        Source: m.source,
        Status: m.status,
        'Task State': m.task_state,
        Author: m.author,
        Agent: m.agent,
        Session: m.session,
        'Topic Key': m.topic_key,
        'Revision Count': m.revision_count,
        Tags: tagsByMemory.get(m.memory_id) ?? [],
        Project: projectsByMemory.get(m.memory_id) ?? [],
        Topic: topicsByMemory.get(m.memory_id) ?? [],
        // single_property self-relation: the forward edge only. Asking "what
        // replaced this" therefore means filtering on the column, one hop at a
        // time, because no reverse edge exists to follow.
        Supersedes: m.supersedes_id ? [m.supersedes_id] : [],
      },
      body: m.body,
      created_time: m.created_time,
      last_edited_time: m.last_edited_time,
      archived: Boolean(m.archived),
    })
  }

  for (const e of vault.entities) {
    db.seed('Entities', {
      id: e.entity_id,
      properties: {
        __title: e.name,
        Name: e.name,
        Kind: e.kind,
        Description: e.description,
        // One rich_text cell holding a `, `-joined list, exactly as Lore stores
        // it. The only filter that reaches inside is `contains`, which is a
        // substring test over the whole cell.
        Aliases: e.aliases_raw ?? '',
        Project: e.project_id ? [e.project_id] : [],
        Source: e.source_memory_id ? [e.source_memory_id] : [],
      },
      body: '',
      created_time: e.created_time ?? 0,
      last_edited_time: e.created_time ?? 0,
    })
  }

  for (const f of vault.facts) {
    db.seed('Facts', {
      id: f.fact_id,
      properties: {
        __title: f.subject,
        Subject: f.subject,
        Predicate: f.predicate,
        Object: f.object,
        'Valid From': f.valid_from,
        'Valid Until': f.valid_until,
        'Observed At': f.observed_at,
        'Invalidated At': f.invalidated_at,
        'Invalidated By': f.invalidated_by ? [f.invalidated_by] : [],
        Confidence: f.confidence,
        'Confidence Score': f.confidence_score,
        DedupKey: f.dedup_key,
        SubjectKey: f.subject_key,
        Project: f.project_id ? [f.project_id] : [],
        Source: f.source_memory_id ? [f.source_memory_id] : [],
        SubjectEntity: f.subject_entity_id ? [f.subject_entity_id] : [],
        ObjectEntity: f.object_entity_id ? [f.object_entity_id] : [],
      },
      body: '',
      created_time: f.created_time ?? 0,
      last_edited_time: f.created_time ?? 0,
    })
  }
  return db
}

function groupBy(rows, keyField, valueField) {
  const m = new Map()
  for (const r of rows) {
    if (!m.has(r[keyField])) m.set(r[keyField], [])
    m.get(r[keyField]).push(r[valueField])
  }
  return m
}

/**
 * Answer one workload question using only the Data API.
 *
 * Each branch is written the way a client library has to write it, and the
 * comments say which step the API could not do. Where a class is marked
 * "not expressible" in the workload table, the code below shows exactly what
 * gets done instead — which is always the same thing: fetch rows, then answer
 * the question in the client.
 */

/**
 * Resolve a term to entity pages, the way Lore has to.
 *
 * `Name` is the title, so an exact title filter reaches it. Aliases are a
 * `, `-joined string in one rich_text cell, and the only operator that reaches
 * inside a string is `contains` — a substring test. So the server-side filter is
 * a *candidate* filter, and the client re-splits every candidate cell and keeps
 * only exact alias tokens. Lore does exactly this: query with `contains`, "then
 * narrows to exact alias-token matches via `parseAliases`".
 *
 * The cost is visible in two places. Every over-matched candidate is a row that
 * crossed the wire for nothing, and it is counted. And where a relation would
 * have made `alias` a unique key, nothing does — Lore is explicit that "aliases
 * are deliberately not unique across entities".
 */
function resolveEntityPages(db, term) {
  const byName = db.queryAll('Entities', { filter: { property: 'Name', title: { equals: term } } })
  const candidates = db.queryAll('Entities', { filter: { property: 'Aliases', rich_text: { contains: term } } })

  const exact = []
  let overMatched = 0
  for (const c of candidates) {
    const cell = String(c.properties.Aliases ?? '')
    const tokens = cell.split(/\s*,\s*/).map((t) => t.trim()).filter(Boolean)
    if (tokens.some((t) => t.toLowerCase() === String(term).toLowerCase())) exact.push(c)
    else overMatched++
  }
  db.chargeClientScan(candidates.length)

  const seen = new Set()
  const out = []
  for (const p of [...byName, ...exact]) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    out.push(p)
  }
  return { pages: out, overMatched, candidates: candidates.length }
}

export function answerOnNotion(db, vault, q) {
  db.reset()

  switch (q.class) {
    case 'wake-up': {
      // Expressible. One filtered, sorted, limited query.
      const res = db.queryDataSource('Memories', {
        filter: {
          and: [
            { property: 'Project', relation: { contains: q.project_id } },
            { timestamp: 'created_time', date: { on_or_after: q.since } },
          ],
        },
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
        page_size: Math.min(q.limit, NOTION_PAGE_MAX),
      })
      return { ids: res.results.map((p) => p.id), ledger: db.ledger }
    }

    case 'ask-entity': {
      // Step 1: resolve the term to entity pages, through the joined alias cell.
      const res = resolveEntityPages(db, q.term)
      const ids = res.pages.map((e) => e.id)
      if (!ids.length) return { ids: [], ledger: db.ledger, aliasOverMatch: res.overMatched }

      // Step 2: facts where the entity is subject or object. `relation contains`
      // takes one page id, so an entity that resolved to two rows needs a
      // disjunction over both, and the disjunction is built client-side.
      const clauses = []
      for (const id of ids) {
        clauses.push({ property: 'SubjectEntity', relation: { contains: id } })
        clauses.push({ property: 'ObjectEntity', relation: { contains: id } })
      }
      const facts = db.queryAll('Facts', { filter: { or: clauses } })
      return { ids: facts.map((f) => f.id), ledger: db.ledger, aliasOverMatch: res.overMatched }
    }

    case 'provenance': {
      // The join Notion cannot do. Author lives on Memories; the fact points at
      // the memory. There is no way to filter Facts by a property of the page
      // its relation points to.
      db.note('join Facts ⋈ Memories on Source')
      const facts = db.queryAll('Facts', { filter: { property: 'Predicate', select: { equals: q.predicate } } })
      // For each candidate fact, retrieve its source memory and test the author.
      // One request per fact. This is the N+1 the paper is about.
      const out = []
      const seen = new Map()
      for (const f of facts) {
        const srcs = f.properties.Source ?? []
        if (!srcs.length) continue
        const mid = srcs[0]
        let mem = seen.get(mid)
        if (mem === undefined) {
          mem = db.retrievePage(mid)
          seen.set(mid, mem)
        }
        // A page fetched by id comes back even when it is in the trash, so the
        // client has to check. A relational foreign key would have refused the
        // delete instead; §7.3 counts the pointers this leaves behind.
        if (mem && !mem.archived && mem.properties.Author === q.author) out.push(f.id)
      }
      db.chargeClientScan(facts.length)
      return { ids: out, ledger: db.ledger }
    }

    case 'as-of': {
      const { pages: ents } = resolveEntityPages(db, q.term)
      if (!ents.length) return { ids: [], ledger: db.ledger }
      // Expressible, but only because "still believed" is encoded as an empty
      // date rather than an open interval: the predicate needs an explicit
      // `is_empty` arm that a range type would not have needed.
      const clauses = ents.map((e) => ({ property: 'SubjectEntity', relation: { contains: e.id } }))
      const facts = db.queryAll('Facts', {
        filter: {
          and: [
            { or: clauses },
            { or: [
              { property: 'Valid From', date: { on_or_before: q.day } },
              { property: 'Valid From', date: { is_empty: true } },
            ] },
            { or: [
              { property: 'Valid Until', date: { after: q.day } },
              { property: 'Valid Until', date: { is_empty: true } },
            ] },
          ],
        },
      })
      return { ids: facts.map((f) => f.id), ledger: db.ledger }
    }

    case 'current': {
      const { pages: ents } = resolveEntityPages(db, q.term)
      if (!ents.length) return { ids: [], ledger: db.ledger }
      const clauses = ents.map((e) => ({ property: 'SubjectEntity', relation: { contains: e.id } }))
      const facts = db.queryAll('Facts', {
        filter: { and: [{ or: clauses }, { property: 'Valid Until', date: { is_empty: true } }] },
      })
      return { ids: facts.map((f) => f.id), ledger: db.ledger }
    }

    case 'aggregate': {
      // No GROUP BY. Fetch every matching row, 100 at a time, and count locally.
      db.note('GROUP BY')
      const rows = db.queryAll('Memories', {
        filter: {
          and: [
            { property: 'Project', relation: { contains: q.project_id } },
            { timestamp: 'created_time', date: { on_or_after: q.since } },
          ],
        },
      })
      const counts = new Map()
      for (const r of rows) counts.set(r.properties.Kind, (counts.get(r.properties.Kind) ?? 0) + 1)
      db.chargeClientScan(rows.length)
      return { ids: [...counts.entries()].sort().map(([k, n]) => `${k}=${n}`), ledger: db.ledger }
    }

    case 'conflict-scan': {
      // No self-join. `lore conflicts scan` documents a scan cap, and this is
      // why: the only way to find a contradiction is to pull the facts and
      // compare them pairwise in the client.
      db.note('self-join + GROUP BY')
      const rows = db.queryAll('Facts', {
        filter: { or: [...FUNCTIONAL_PREDICATES].map((p) => ({ property: 'Predicate', select: { equals: p } })) },
      })
      const groups = new Map()
      for (const r of rows) {
        const se = (r.properties.SubjectEntity ?? [])[0]
        if (!se) continue
        const key = `${se}|${r.properties.Predicate}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push({
          object: r.properties.Object,
          valid_from: r.properties['Valid From'],
          valid_until: r.properties['Valid Until'],
        })
      }
      const out = new Set()
      let compared = 0
      for (const [key, g] of groups) {
        for (let i = 0; i < g.length; i++) {
          for (let j = i + 1; j < g.length; j++) {
            compared++
            if (g[i].object !== g[j].object && overlaps(g[i], g[j])) out.add(key)
          }
        }
      }
      db.chargeClientScan(rows.length + compared)
      return { ids: [...out].sort(), ledger: db.ledger }
    }

    case 'supersession': {
      // No recursive CTE, and no reverse edge either: `Supersedes` is a
      // single_property self-relation, so "what replaced this" is a filter on
      // the column and the walk costs one request per hop.
      db.note('recursive closure')
      let head = q.term
      const seen = new Set([head])
      const chain = []
      for (;;) {
        const res = db.queryDataSource('Memories', {
          filter: { property: 'Supersedes', relation: { contains: head } },
          page_size: NOTION_PAGE_MAX,
        })
        if (!res.results.length) break
        head = res.results[0].id
        if (seen.has(head)) break
        seen.add(head)
        chain.push(head)
      }
      return { ids: chain, ledger: db.ledger }
    }

    case 'body-search': {
      // The search endpoint matches titles. The text is blocks. So: enumerate
      // every memory, then fetch every memory's children, then grep locally.
      db.note('full-text over page bodies')
      const hits = db.search(q.term, { page_size: NOTION_PAGE_MAX })
      const byTitle = new Set(hits.results.filter((p) => p.ds === 'Memories').map((p) => p.id))

      const all = db.queryAll('Memories', {})
      const out = []
      for (const m of all) {
        const body = db.retrieveBlockChildren(m.id)
        if (body && body.toLowerCase().includes(q.term.toLowerCase())) out.push(m.id)
      }
      db.chargeClientScan(all.length)
      return { ids: out.sort(), ledger: db.ledger, titleOnlyIds: [...byTitle].sort() }
    }

    case 'cross-db': {
      // Two joins. Memories -> Entities (Source) -> Facts (SubjectEntity).
      db.note('Memories ⋈ Entities ⋈ Facts')
      const mems = db.queryAll('Memories', { filter: { property: 'Author', rich_text: { equals: q.author } } })
      const memIds = new Set(mems.map((m) => m.id))

      // There is no "relation is one of these 40 pages" operator; `contains`
      // takes a single page id, so the disjunction is built one clause per id
      // and Notion caps the payload at 500 KB. Chunk it.
      const clauses = [...memIds].map((id) => ({ property: 'Source', relation: { contains: id } }))
      const ents = []
      for (let i = 0; i < clauses.length; i += 40) {
        ents.push(...db.queryAll('Entities', { filter: { or: clauses.slice(i, i + 40) } }))
      }
      const entIds = ents.map((e) => e.id)
      const factClauses = entIds.map((id) => ({ property: 'SubjectEntity', relation: { contains: id } }))
      const facts = []
      for (let i = 0; i < factClauses.length; i += 40) {
        facts.push(...db.queryAll('Facts', { filter: { or: factClauses.slice(i, i + 40) } }))
      }
      db.chargeClientScan(mems.length + ents.length)
      return { ids: [...new Set(facts.map((f) => f.id))].sort(), ledger: db.ledger }
    }

    default:
      throw new Error(`notion arm has no plan for ${q.class}`)
  }
}

export const notionArm = () => ({
  id: 'notion',
  family: 'notion',
  label: 'Lore on Notion',
  blurb: 'The five databases as Notion pages, reached only through the documented Data API.',
  emulated: true,
  async load(vault) {
    this.db = loadVault(vault)
    this.vault = vault
    return { pages: this.db.pages.size, dataSources: this.db.dataSources.size }
  },
  async ask(q) {
    return answerOnNotion(this.db, this.vault, q)
  },
  async close() {},
})

export { resolveEntityIds, validAt, tokenize }
