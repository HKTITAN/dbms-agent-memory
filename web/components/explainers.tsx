'use client'

/**
 * The three operable figures.
 *
 * Everything else in this paper is a measurement printed once. These are the
 * same measurements with a control on them, and the control has to earn itself:
 * a reader changes one input and a real consequence, computed from the same
 * `capture.json` the tables are typeset from, changes with it. Nothing here is
 * illustrative. Where a number was not measured, these figures say so rather
 * than draw a plausible line through the gap — which is the whole reason the
 * writer-race explorer refuses to answer at eleven writers.
 *
 * Three decisions are shared, and they are the same three the static figures
 * make:
 *
 * 1. One selection model. `useSelection` holds the index, counts changes so a
 *    panel can replay its enter animation, and remembers whether the change came
 *    from a pointer or a key — a held arrow must not restage a 220ms swap on
 *    every repeat. Motion is `.swap-enter` from globals.css, which is transform
 *    and opacity only and is already neutralised under prefers-reduced-motion.
 *
 * 2. One layout rule. Variants that differ in height are stacked in a single
 *    grid cell by `Deck`, so a figure is as tall as its tallest state and
 *    switching moves nothing below it. Hidden panels are `visibility: hidden`
 *    (out of the accessibility tree) and `.no-print`, so paper gets one panel at
 *    its own height.
 *
 * 3. One print contract. Every control is `.no-print`: on paper the reader gets
 *    the default selection and no way to tell a control was ever there. So each
 *    panel names its own state in text — the class it is showing, the vault size
 *    it is standing at, the number of writers it is racing — rather than relying
 *    on a tab strip or a slider thumb that will not be printed. The defaults are
 *    chosen to be the states the prose discusses: the full vault, eight writers.
 *
 * Encodings follow the rules the charts follow. Bars and dot rules start at
 * zero. Every mark that carries a number prints the number. Anything encoding
 * more than three values ships a visually hidden table with the same values.
 * Colours are tokens, never literals, so the machine canvas and the print
 * stylesheet re-theme all of this for free.
 */

import { useCallback, useId, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { Figure } from './charts'
import {
  capture, classes, schema, exp, limits, armClass, amp,
  n, pct, times, bytes, duration,
} from '@/lib/data'
import { Icon } from '@/components/icons'

/* ------------------------------------------------------------- primitives */

/* Present in the accessibility tree, absent from layout — the same object
   charts.tsx uses, for the same reason: a picture of a number is not the number,
   and `display: none` would not be read out at all.
 *
 * It is applied to a wrapping <div> here rather than to the <table> itself. A
 * table box cannot be shrunk to 1px: `width: 1px` is a minimum for it, so the
 * border box grows to the widest row and, because nothing between it and the
 * initial containing block is positioned, that width lands in the document's
 * scrollable overflow. A ten-column table hidden this way gave a phone 743px of
 * horizontal scroll to an element nobody could see. A plain block does shrink,
 * and clips the table inside it. */
const DASH = '—'

/* SVG text scales with the viewBox, so a drawing narrower than this renders its
   10.5px labels at under 6px on a phone. Below the floor the container scrolls
   rather than the type shrinking further. Same figure as charts.tsx, so the two
   agree about when a chart starts to pan. */
const MIN_W = 520
const scroller: CSSProperties = { overflowX: 'auto', overscrollBehaviorX: 'contain' }

type Selection = {
  index: number
  /** Change count. 0 on first paint, which is how a panel knows it was never swapped. */
  swap: number
  /** False when the change came from the keyboard; see the note in `TabList`. */
  animate: boolean
}

function useSelection(initial: number) {
  const [sel, setSel] = useState<Selection>({ index: initial, swap: 0, animate: false })

  const choose = useCallback((index: number, animate: boolean) => {
    setSel((s) => (s.index === index ? s : { index, swap: s.swap + 1, animate }))
  }, [])

  return {
    index: sel.index,
    choose,
    /* Applied as a React key on the panel wrapper. Re-adding a class to an
       element that already carries it does not restart its animation, so the
       element has to be a new one. */
    swapKey: sel.swap,
    swapClass: sel.swap > 0 && sel.animate ? 'swap-enter' : undefined,
  }
}

type Tab = { key: string; label: string; hint?: string }

/**
 * A tab strip on `.seg`, with the keyboard behaviour a segmented control has on
 * every platform that ships one: arrows move and take the selection with them,
 * Home and End jump to the ends, focus follows so the reader can keep pressing.
 * Selection is automatic on arrow — every panel is already rendered, so there is
 * nothing to defer to a separate Enter press, and Enter and Space still activate
 * because these are real buttons.
 */
function TabList({
  label, tabs, index, onSelect, tabId, panelId,
}: {
  label: string
  tabs: Tab[]
  index: number
  onSelect: (i: number, animate: boolean) => void
  tabId: (i: number) => string
  panelId: string
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      const count = tabs.length
      let next = index
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          next = (index + count - 1) % count
          break
        case 'ArrowRight':
        case 'ArrowDown':
          next = (index + 1) % count
          break
        case 'Home':
          next = 0
          break
        case 'End':
          next = count - 1
          break
        default:
          return
      }
      e.preventDefault()
      buttons.current[next]?.focus()
      /* No motion: arrow keys autorepeat when held, and one swap animation per
         repeat is noise rather than feedback. */
      onSelect(next, false)
    },
    [index, tabs.length, onSelect],
  )

  return (
    <div
      className="seg no-print"
      role="tablist"
      aria-label={label}
      /* `.seg` is a single inline row, and ten question classes do not fit one
         on a phone, so this instance wraps. */
      style={{ flexWrap: 'wrap', gap: 2, maxWidth: '100%' }}
    >
      {tabs.map((t, i) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          id={tabId(i)}
          aria-controls={panelId}
          aria-selected={i === index}
          aria-label={t.hint}
          /* Roving tabindex: the strip is one tab stop and the arrows move
             inside it. */
          tabIndex={i === index ? 0 : -1}
          className={i === index ? 'seg-on' : undefined}
          ref={(el) => {
            buttons.current[i] = el
          }}
          /* `detail` is 0 for Enter and Space activation and above 0 for a real
             click, so keyboard activation skips the animation as arrows do. */
          onClick={(e) => onSelect(i, e.detail > 0)}
          onKeyDown={onKeyDown}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Every variant stacked in one grid cell. The cell is as tall as the tallest
 * variant, so switching cannot move the rest of the page — the alternative is
 * measuring heights in an effect, which shifts the layout once before it
 * settles.
 */
function Deck({ index, panels }: { index: number; panels: ReactNode[] }) {
  return (
    <div style={{ display: 'grid' }}>
      {panels.map((panel, i) => (
        <div
          key={i}
          className={i === index ? undefined : 'no-print'}
          aria-hidden={i === index ? undefined : true}
          style={{
            gridArea: '1 / 1',
            visibility: i === index ? 'visible' : 'hidden',
            alignContent: 'start',
            minHeight: 0,
          }}
        >
          {panel}
        </div>
      ))}
    </div>
  )
}

/** A zero-baselined bar. The axis maximum is always stated by the caller. */
function Meter({
  value, max, tone, height = 12,
}: {
  value: number
  max: number
  tone: string
  height?: number
}) {
  const width = max > 0 ? Math.min(1, Math.max(0, value / max)) * 100 : 0
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'block',
        height,
        background: 'var(--data-grid)',
        borderRadius: 'var(--radius-pill)',
        boxShadow: 'inset 0 2px 0 rgba(17,17,17,0.06)',
        overflow: 'hidden',
      }}
    >
      <span
        style={{ display: 'block', width: `${width}%`, height: '100%', background: tone, borderRadius: 2 }}
      />
    </span>
  )
}

/* Axis maxima a reader can divide in their head. A bar ending on 24 455 asks
   them to divide by a number nobody chose. */
const NICE = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]

function niceCeil(v: number): number {
  if (!(v > 0)) return 1
  const mag = 10 ** Math.floor(Math.log10(v))
  return (NICE.find((s) => v <= s * mag + 1e-9) ?? 10) * mag
}

/* A zero-anchored linear axis whose top is a labelled tick. Every axis in these
   figures is linear and starts at zero; nothing here is compressed. */
function axisOf(dataMax: number, want = 4): { max: number; ticks: number[] } {
  const step = niceCeil(dataMax / want)
  const max = Math.max(step, Math.ceil(dataMax / step - 1e-9) * step)
  const ticks: number[] = []
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(Number(v.toPrecision(12)))
  return { max, ticks }
}

/**
 * One mark per HTTP round trip, capped, with the remainder written out.
 *
 * The round-trip counts in this workload span four orders of magnitude — one
 * request for a wake-up, 11 892 for a body search. A zero-baselined bar can show
 * only the top of that range honestly: eight of the ten classes would draw as a
 * hairline. Unit marks have no axis to truncate. Three marks read as three, a
 * wall of marks reads as a wall, and the exact figure is printed beside it
 * either way.
 */
function RequestTally({ count, cap = 120, tone }: { count: number; cap?: number; tone: string }) {
  const drawn = Math.min(Math.round(count), cap)
  const rest = Math.max(0, Math.round(count) - drawn)
  return (
    <div>
      <div
        aria-hidden="true"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignContent: 'flex-start' }}
      >
        {Array.from({ length: drawn }, (_, i) => (
          <span key={i} style={{ width: 5, height: 11, background: tone, borderRadius: 1 }} />
        ))}
      </div>
      {rest > 0 ? (
        <p className="meta" style={{ margin: '0.375rem 0 0' }}>
          + {n(rest)} more marks not drawn
        </p>
      ) : null}
    </div>
  )
}

/* =========================================================== 1. query cost */

/**
 * The sequence each arm actually executes, per question class.
 *
 * These steps are transcribed from `engines/notion.mjs`, branch by branch: the
 * endpoint, the filter it carries, and how many times the loop runs. They are
 * the shape of the work, and the shape is what the API fixes. The totals beside
 * them are not transcribed — they are read out of the capture, so a step list
 * cannot quietly disagree with the measurement it is standing next to.
 *
 * `client: true` marks a step that costs no request and still costs: rows that
 * crossed the wire so the client could do what the store would not.
 */
type Step = { call: string; what: string; count: string; client?: boolean }

/* The rows a step made the client examine, read out of the capture rather than
   written into the step text, so a sentence about the cost cannot drift from the
   measurement of it. */
const clientRows = (id: string) => armClass('notion', id)?.rowsClientSide ?? 0

/* A mean over forty questions is often not a whole number of requests, and
   rounding it to one would be tidying the measurement. A class whose every
   instance cost the same number keeps its integer rather than growing two
   decimal places of nothing. */
const roundTrips = (v: number) => n(v, Number.isInteger(v) ? 0 : 2)

/* Same rule, one decimal: a mean of 0.3 rows is a real 0.3, and a count of zero
   is a zero rather than a 0.0. */
const rows = (v: number) => n(v, Number.isInteger(v) ? 0 : 1)

/* `⌈n ÷ 100⌉` throughout: a result set is drained one page at a time and the
   maximum page is 100 rows, so every unfiltered read is a division. */
const perPage = `one request per ${limits.pageSizeMax} rows`

const NOTION_STEPS: Record<string, Step[]> = {
  'wake-up': [
    {
      call: 'POST /v1/data_sources/{Memories}/query',
      what: 'Project relation contains the project, created_time on or after the window start, sorted newest first, page_size set to the limit',
      count: '1',
    },
  ],

  'ask-entity': [
    {
      call: 'POST /v1/data_sources/{Entities}/query',
      what: 'Name title equals the term',
      count: '1',
    },
    {
      call: 'POST /v1/data_sources/{Entities}/query',
      what: 'Aliases rich_text contains the term. The cell holds a ", "-joined list, so contains is a substring test over the whole string: this returns candidates, not matches',
      count: '1',
    },
    {
      call: 'in the client',
      what: 'Re-split every candidate cell on ", " and keep only the rows with an exact alias token — the narrowing the store could not be asked to do',
      count: `${n(clientRows('ask-entity'), 1)} rows on mean`,
      client: true,
    },
    {
      call: 'POST /v1/data_sources/{Facts}/query',
      what: 'or over SubjectEntity contains e and ObjectEntity contains e, one pair of clauses per resolved entity page',
      count: perPage,
    },
  ],

  provenance: [
    {
      call: 'POST /v1/data_sources/{Facts}/query',
      what: 'Predicate equals the predicate. Author lives on Memories, and no filter can reach a property of the page a relation points at, so the predicate is all that can be pushed down',
      count: perPage,
    },
    {
      call: 'GET /v1/pages/{id}',
      what: 'The source memory of each candidate fact, to read its Author. Memoised per memory, and still one request each: this is the N+1',
      count: 'one per distinct source memory',
    },
    {
      call: 'in the client',
      what: 'Drop the archived pages — a page fetched by id comes back even from the trash — and compare Author',
      count: `${n(clientRows('provenance'), 1)} rows on mean`,
      client: true,
    },
  ],

  'as-of': [
    {
      call: 'POST /v1/data_sources/{Entities}/query',
      what: 'Name title equals the term, then Aliases rich_text contains the term',
      count: '2',
    },
    {
      call: 'POST /v1/data_sources/{Facts}/query',
      what: 'SubjectEntity contains the entity, and Valid From on or before D or empty, and Valid Until after D or empty. The is_empty arms exist because an open interval is stored as a missing date rather than as a range',
      count: perPage,
    },
  ],

  current: [
    {
      call: 'POST /v1/data_sources/{Entities}/query',
      what: 'Name title equals the term, then Aliases rich_text contains the term',
      count: '2',
    },
    {
      call: 'POST /v1/data_sources/{Facts}/query',
      what: 'SubjectEntity contains the entity and Valid Until is empty',
      count: perPage,
    },
  ],

  aggregate: [
    {
      call: 'POST /v1/data_sources/{Memories}/query',
      what: 'Project relation contains the project and created_time on or after the window start, drained to the last page',
      count: perPage,
    },
    {
      call: 'in the client',
      what: 'Count the rows by Kind. There is no GROUP BY, so every row that contributes to a count has to cross the wire to be counted',
      count: `${n(clientRows('aggregate'), 1)} rows on mean`,
      client: true,
    },
  ],

  'conflict-scan': [
    {
      call: 'POST /v1/data_sources/{Facts}/query',
      what: 'or over Predicate equals p for each functional predicate, drained to the last page',
      count: perPage,
    },
    {
      call: 'in the client',
      what: 'Group by subject entity and predicate, then compare every pair inside a group for a different object over an overlapping interval. There is no self-join, which is why the shipped scan carries a candidate cap',
      count: `${n(clientRows('conflict-scan'))} rows and comparisons`,
      client: true,
    },
  ],

  supersession: [
    {
      call: 'POST /v1/data_sources/{Memories}/query',
      what: 'Supersedes relation contains the current head. Supersedes is a single-property self-relation, so there is no reverse edge to follow and no recursive query to write: the walk is one request per hop and stops when a hop comes back empty',
      count: 'one per hop',
    },
  ],

  'body-search': [
    {
      call: 'POST /v1/search',
      what: 'The documented search endpoint. It matches titles, so it finds a memory only when the answer is already in its name',
      count: '1',
    },
    {
      call: 'POST /v1/data_sources/{Memories}/query',
      what: 'Every memory, unfiltered, drained to the last page — because nothing about the body can be filtered on',
      count: `${n(exp.ceiling.now.listRequests)}`,
    },
    {
      call: 'GET /v1/blocks/{id}/children',
      what: 'The body of one memory. A memory is a page and its text is blocks, so this is one request per memory in the vault',
      count: `${n(exp.ceiling.now.bodyRequests)}`,
    },
    {
      call: 'in the client',
      what: 'Substring-match every body that was just fetched',
      count: `${n(clientRows('body-search'))} bodies`,
      client: true,
    },
  ],

  'cross-db': [
    {
      call: 'POST /v1/data_sources/{Memories}/query',
      what: 'Author equals the author, drained to the last page',
      count: perPage,
    },
    {
      call: 'POST /v1/data_sources/{Entities}/query',
      what: `or over Source contains m, one clause per memory. Clauses are chunked 40 at a time to stay under the ${bytes(limits.payloadBytes)} payload cap, and each chunk is its own drained query`,
      count: 'one per 40 memories',
    },
    {
      call: 'POST /v1/data_sources/{Facts}/query',
      what: 'or over SubjectEntity contains e, one clause per entity, chunked the same way',
      count: 'one per 40 entities',
    },
    {
      call: 'in the client',
      what: 'Union the fact ids. The two joins happened here, in a loop, on rows that had to be fetched to be joined',
      count: `${n(clientRows('cross-db'), 1)} rows on mean`,
      client: true,
    },
  ],
}

/**
 * The statement the SQL arms run, copied verbatim from `engines/sqlite.mjs`.
 *
 * Verbatim matters more than it looks. The claim this figure makes is that the
 * whole of the sequence on its left is one statement on its right; a paraphrase
 * would let the statement drift towards the claim. The only edit is the leading
 * indentation, which the source carries because the strings live inside an
 * object literal. `-999999` and `999999` are the sentinels that file substitutes
 * for an open interval, spelled out here as it spells them.
 */
const SQL: Record<string, string> = {
  'wake-up': `SELECT m.memory_id
  FROM memory m
  JOIN memory_project mp ON mp.memory_id = m.memory_id
 WHERE mp.project_id = ? AND m.created_time >= ? AND m.archived = 0
 ORDER BY m.created_time DESC, m.memory_id ASC
 LIMIT ?`,

  'ask-entity': `WITH e(entity_id) AS (
  SELECT entity_id FROM entity       WHERE lower(name)  = lower(?)
  UNION
  SELECT entity_id FROM entity_alias WHERE lower(alias) = lower(?)
)
SELECT fact_id FROM fact
 WHERE subject_entity_id IN (SELECT entity_id FROM e)
    OR object_entity_id  IN (SELECT entity_id FROM e)
 ORDER BY fact_id`,

  provenance: `SELECT f.fact_id
  FROM fact f
  JOIN memory m ON m.memory_id = f.source_memory_id
 WHERE m.author = ? AND f.predicate = ? AND m.archived = 0
 ORDER BY f.fact_id`,

  'as-of': `WITH e(entity_id) AS (
  SELECT entity_id FROM entity       WHERE lower(name)  = lower(?)
  UNION
  SELECT entity_id FROM entity_alias WHERE lower(alias) = lower(?)
)
SELECT fact_id FROM fact
 WHERE subject_entity_id IN (SELECT entity_id FROM e)
   AND COALESCE(valid_from,  -999999) <= ?
   AND COALESCE(valid_until, 999999) >  ?
 ORDER BY fact_id`,

  current: `WITH e(entity_id) AS (
  SELECT entity_id FROM entity       WHERE lower(name)  = lower(?)
  UNION
  SELECT entity_id FROM entity_alias WHERE lower(alias) = lower(?)
)
SELECT fact_id FROM fact
 WHERE subject_entity_id IN (SELECT entity_id FROM e)
   AND valid_until IS NULL
 ORDER BY fact_id`,

  aggregate: `SELECT m.kind || '=' || COUNT(*) AS g
  FROM memory m
  JOIN memory_project mp ON mp.memory_id = m.memory_id
 WHERE mp.project_id = ? AND m.created_time >= ? AND m.archived = 0
 GROUP BY m.kind
 ORDER BY g`,

  'conflict-scan': `SELECT DISTINCT a.subject_entity_id || '|' || a.predicate AS k
  FROM fact a
  JOIN fact b
    ON a.subject_entity_id = b.subject_entity_id
   AND a.predicate = b.predicate
   AND a.fact_id < b.fact_id
 WHERE a.predicate IN ('owned_by','is_a','created_by')
   AND a.subject_entity_id IS NOT NULL
   AND a.object <> b.object
   AND COALESCE(a.valid_from, -999999) < COALESCE(b.valid_until, 999999)
   AND COALESCE(b.valid_from, -999999) < COALESCE(a.valid_until, 999999)
 ORDER BY k`,

  supersession: `WITH RECURSIVE chain(node, depth) AS (
  SELECT ?, 0
  UNION ALL
  SELECT m.memory_id, c.depth + 1
    FROM memory m
    JOIN chain c ON m.supersedes_id = c.node
   WHERE c.depth < 64
)
SELECT node FROM chain WHERE depth > 0 ORDER BY depth`,

  'body-search': `SELECT m.memory_id
  FROM memory_fts
  JOIN memory m ON m.rowid = memory_fts.rowid
 WHERE memory_fts MATCH ? AND m.archived = 0
 ORDER BY m.memory_id`,

  'cross-db': `SELECT DISTINCT f.fact_id
  FROM fact f
  JOIN entity e ON e.entity_id = f.subject_entity_id
  JOIN memory m ON m.memory_id = e.source_memory_id
 WHERE m.author = ? AND m.archived = 0
 ORDER BY f.fact_id`,
}

/* The word does the work; the pill colour only repeats it. */
function expressibilityPill(kind: string): string {
  if (kind === 'expressible') return 'pill pill-ok'
  if (kind === 'not expressible') return 'pill pill-bad'
  return 'pill pill-accent'
}

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.5rem' }}>
      {steps.map((s, i) => (
        <li
          key={i}
          style={{
            display: 'grid',
            gap: '0.1875rem',
            padding: '0.5rem 0.625rem',
            borderRadius: 'var(--radius-sm)',
            /* A client-side step is a different kind of thing from a request,
               so it is a different shape: no left rule, a sunken ground, and it
               says "in the client" where the others say a method and a path. */
            border: s.client ? '1px dashed var(--border)' : 'var(--rule)',
            borderLeft: s.client ? '1px dashed var(--border)' : '2px solid var(--accent-line)',
            background: s.client ? 'var(--bg-inset)' : 'var(--bg-sunken)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem 0.625rem', alignItems: 'baseline' }}>
            <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text)' }}>
              {i + 1}. {s.call}
            </span>
            <span className="meta">{s.count}</span>
          </div>
          <p className="caption" style={{ margin: 0 }}>{s.what}</p>
        </li>
      ))}
    </ol>
  )
}

/** One class, fully described. Named in text, because the tab strip does not print. */
function ClassPanel({ id }: { id: string }) {
  const cls = classes.find((c) => c.id === id)
  const agg = armClass('notion', id)
  const sql = armClass('sqlite', id)
  const a = amp(id)
  const steps = NOTION_STEPS[id] ?? []
  const instances = capture.workload.perClass[id] ?? 0

  if (!cls || !agg || !a) return null

  return (
    <div style={{ display: 'grid', gap: '0.875rem' }}>
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.5rem' }}>
          <span className="heading-16 mono" style={{ margin: 0 }}>{cls.id}</span>
          <span className="label">{cls.label}</span>
          <span className="meta">
            {n(instances)} {instances === 1 ? 'question' : 'questions'} · {cls.surface}
          </span>
        </div>
        <p className="body" style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          {cls.blurb}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
          <span className="pill mono">{cls.algebra.join(' · ')}</span>
          {cls.needsJoin ? <span className="pill">needs a join</span> : null}
          {cls.needsAggregate ? <span className="pill">needs an aggregate</span> : null}
          {cls.needsRecursion ? <span className="pill">needs recursion</span> : null}
          <span className={expressibilityPill(cls.notion)}>Data API: {cls.notion}</span>
        </div>
      </div>

      {/* The comparison. Two columns, one scale between them: marks on the left
          and marks on the right are the same size, so the reader is not asked to
          take the ratio on trust. */}
      <div className="grid-2" style={{ alignItems: 'start', gap: '1rem' }}>
        <div style={{ display: 'grid', gap: '0.625rem', alignContent: 'start' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.5rem' }}>
            <span className="label">Lore on Notion</span>
            <span className="mono num" style={{ fontSize: '0.8125rem' }}>
              {roundTrips(agg.roundTrips)} round trip{agg.roundTrips === 1 ? '' : 's'}
            </span>
            <span className="meta">
              median {n(agg.roundTripsMedian)} · p95 {n(agg.roundTripsP95)}
            </span>
          </div>
          <RequestTally count={agg.roundTrips} tone="var(--data-3)" />
          <StepList steps={steps} />
        </div>

        <div style={{ display: 'grid', gap: '0.625rem', alignContent: 'start' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.5rem' }}>
            <span className="label">SQLite and PostgreSQL</span>
            <span className="mono num" style={{ fontSize: '0.8125rem' }}>
              {n(sql?.roundTrips ?? 1)} statement
            </span>
            <span className="meta">{n(sql?.ms ?? 0, 3)} ms in SQLite</span>
          </div>
          <RequestTally count={sql?.roundTrips ?? 1} tone="var(--data-4)" />
          <div className="code-block">
            <div className="code-head">
              <span className="mono">engines/sqlite.mjs · {cls.id}</span>
              <span>one statement</span>
            </div>
            <pre><code>{SQL[id]}</code></pre>
          </div>
        </div>
      </div>

      {/* Named in the panel rather than only in the head, so the printed figure
          carries its own accounting. */}
      <div className="stat-strip">
        <div className="stat">
          <span className="stat-value num">{times(a.roundTrips)}</span>
          <span className="stat-label">round trips per statement</span>
        </div>
        <div className="stat">
          <span className="stat-value num">{duration(a.notionFloorSeconds)}</span>
          <span className="stat-label">
            rate-limit floor at {limits.requestsPerSecond} req/s
          </span>
        </div>
        <div className="stat">
          <span className="stat-value num">{bytes(agg.bytesIn)}</span>
          <span className="stat-label">bytes in, per question</span>
        </div>
        <div className="stat">
          <span className="stat-value num">{rows(agg.rowsClientSide)}</span>
          <span className="stat-label">rows examined in the client</span>
        </div>
        <div className="stat">
          <span className="stat-value num">{pct(agg.f1, 0)}</span>
          <span className="stat-label">F1 on the Notion arm</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Pick a question class and watch what answering it costs.
 *
 * The figure exists because the headline — a mean of 1 448 round trips against
 * one statement — is an average over a distribution that spans four orders of
 * magnitude, and an average hides the two facts that matter: the substrate is
 * fine at several of these, and catastrophic at two. A reader who can step
 * through the classes finds both.
 */
export function QueryCostExplorer() {
  const uid = useId()

  /* Open on the class the paper leads with: provenance is a single join, the
     smallest possible relational question, and it costs over a thousand
     requests. It is also the default the printed edition gets. */
  const initial = Math.max(0, classes.findIndex((c) => c.id === 'provenance'))
  const sel = useSelection(initial)

  const tabId = (i: number) => `${uid}-class-tab-${i}`
  const panelId = `${uid}-class-panel`

  return (
    <Figure
      title="What one question costs"
      meta={`${classes.length} classes · ${n(capture.workload.instances)} questions`}
      foot={
        <>
          Every number here is measured, per class, over the questions in that class: round trips are the
          mean the Notion arm issued, and the rate-limit floor is that mean divided by the{' '}
          {limits.requestsPerSecond} requests per second the API documents for one connection — a floor,
          not a latency, since it is the time the limit alone imposes before any network. Each mark is one
          round trip, capped at 120 with the remainder written out; the step list is transcribed from{' '}
          <span className="mono">engines/notion.mjs</span> and the statement beside it from{' '}
          <span className="mono">engines/sqlite.mjs</span>. Dashed steps cost no request and still cost:
          they are the rows that crossed the wire so the client could do what the store would not. The
          Notion arm returns the right answer for every class — {pct(1, 0)} F1 on all ten. Nothing here is
          a correctness argument.
        </>
      }
      caption={
        <>
          Six of the ten classes are cheap, and the paper says so. What the control is for is the other
          four: a single join costs{' '}
          <span className="mono num">{n(amp('provenance').roundTrips)}</span> round trips because Author
          lives on a page a relation points at; a body search costs{' '}
          <span className="mono num">{n(amp('body-search').roundTrips)}</span> because a memory&rsquo;s
          text is blocks and the search endpoint reads titles. Neither is a performance problem that a
          faster network fixes. Both are the same missing operator.
        </>
      }
    >
      <div style={{ display: 'grid', gap: '1rem' }}>
        <TabList
          label="Question class"
          tabs={classes.map((c) => ({ key: c.id, label: c.id, hint: `${c.id}: ${c.label}` }))}
          index={sel.index}
          onSelect={sel.choose}
          tabId={tabId}
          panelId={panelId}
        />

        <div role="tabpanel" id={panelId} aria-labelledby={tabId(sel.index)} tabIndex={0}>
          <div key={sel.swapKey} className={sel.swapClass}>
            <Deck index={sel.index} panels={classes.map((c) => <ClassPanel key={c.id} id={c.id} />)} />
          </div>
        </div>

        {/* The record for the whole figure, not for the selected panel: the tally
            is a magnitude encoding over ten classes, and the reader of a screen
            reader should not have to visit ten tabs to collect them. */}
        <div className="sr-only">
          <table>
            <caption>
              Every question class: what the Notion arm spent answering it, and what the SQL arms spent.
            </caption>
            <thead>
              <tr>
                <th scope="col">Class</th>
                <th scope="col">Data API</th>
                <th scope="col" className="n">Notion round trips, mean</th>
                <th scope="col" className="n">Median</th>
                <th scope="col" className="n">p95</th>
                <th scope="col" className="n">SQL statements</th>
                <th scope="col" className="n">Amplification</th>
                <th scope="col" className="n">Rate-limit floor</th>
                <th scope="col" className="n">Bytes in</th>
                <th scope="col" className="n">Rows in the client</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => {
                const g = armClass('notion', c.id)
                const a = amp(c.id)
                return (
                  <tr key={c.id}>
                    <th scope="row">{c.id}</th>
                    <td>{c.notion}</td>
                    <td className="n">{g ? roundTrips(g.roundTrips) : DASH}</td>
                    <td className="n">{g ? n(g.roundTripsMedian) : DASH}</td>
                    <td className="n">{g ? n(g.roundTripsP95) : DASH}</td>
                    <td className="n">{a ? n(a.sqlStatements) : DASH}</td>
                    <td className="n">{a ? times(a.roundTrips) : DASH}</td>
                    <td className="n">{a ? duration(a.notionFloorSeconds) : DASH}</td>
                    <td className="n">{g ? bytes(g.bytesIn) : DASH}</td>
                    <td className="n">{g ? rows(g.rowsClientSide) : DASH}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Figure>
  )
}

/* ========================================================= 2. vault size */

/**
 * The wake-up hook at four measured vault sizes, and the honest gaps between.
 *
 * `exp.wakeup.points` holds four runs: an eighth, a quarter, a half and the
 * whole vault. The slider walks a list of stops built from those four with three
 * evenly spaced positions inserted between each adjacent pair. An inserted stop
 * is a straight line between its neighbours and says so — every readout carries
 * the word "interpolated" and the two runs it sits between. Where both endpoints
 * agree, which is the case for round trips and for statement count at every
 * measured size, the interpolation is not a guess and the panel says that too.
 */
type Stop = {
  memories: number
  facts: number
  measured: boolean
  from: number
  to: number
  roundTrips: number
  bytesIn: number
  floorSeconds: number
  notionTokens: number
  sqliteTokens: number
  statements: number
  ms: number
}

const INSERTS = 3

function buildStops(): Stop[] {
  const pts = exp.wakeup.points
  const of = (p: (typeof pts)[number], t: number, prev: (typeof pts)[number]): Stop => ({
    memories: Math.round(prev.memories + (p.memories - prev.memories) * t),
    facts: Math.round(prev.facts + (p.facts - prev.facts) * t),
    measured: t === 1,
    from: prev.memories,
    to: p.memories,
    roundTrips: prev.notion.roundTrips + (p.notion.roundTrips - prev.notion.roundTrips) * t,
    bytesIn: prev.notion.bytesIn + (p.notion.bytesIn - prev.notion.bytesIn) * t,
    floorSeconds:
      (prev.notion.rateLimitFloorMs + (p.notion.rateLimitFloorMs - prev.notion.rateLimitFloorMs) * t) / 1000,
    notionTokens:
      prev.notion.injectedTokensApprox +
      (p.notion.injectedTokensApprox - prev.notion.injectedTokensApprox) * t,
    sqliteTokens:
      prev.sqlite.injectedTokensApprox +
      (p.sqlite.injectedTokensApprox - prev.sqlite.injectedTokensApprox) * t,
    statements: prev.sqlite.statements + (p.sqlite.statements - prev.sqlite.statements) * t,
    ms: prev.sqlite.ms + (p.sqlite.ms - prev.sqlite.ms) * t,
  })

  const out: Stop[] = [of(pts[0], 1, pts[0])]
  for (let i = 1; i < pts.length; i++) {
    for (let k = 1; k <= INSERTS + 1; k++) out.push(of(pts[i], k / (INSERTS + 1), pts[i - 1]))
  }
  return out
}

/* Built once at module scope rather than in a hook: the capture is a build-time
   artifact, so the stops are the same on every render of every instance. */
const STOPS = buildStops()

/**
 * Two panels over one x axis: what the model is handed, and what it cost to
 * assemble. Both start at zero and neither is compressed, because the shape of
 * the first line — flat — is the entire argument, and a log axis would let a
 * reader believe the flatness was drawn rather than measured.
 */
function WakeupPlot({ stops, index }: { stops: Stop[]; index: number }) {
  const pts = exp.wakeup.points
  const W = 640
  const H = 268
  const pad = { t: 20, r: 18, b: 40, l: 62 }
  const gap = 30
  const ph = (H - pad.t - pad.b - gap) / 2

  const x = axisOf(Math.max(...pts.map((p) => p.memories)))
  const tok = axisOf(Math.max(...pts.map((p) => p.notion.injectedTokensApprox)))
  const work = axisOf(Math.max(...pts.map((p) => p.sqlite.ms)))

  const sx = (v: number) => pad.l + (v / x.max) * (W - pad.l - pad.r)
  const syA = (v: number) => pad.t + ph - (v / tok.max) * ph
  const topB = pad.t + ph + gap
  const syB = (v: number) => topB + ph - (v / work.max) * ph

  const cur = stops[index]
  const cx = sx(cur.memories)
  /* Near the right edge the cursor readout would run off the drawing, so it
     flips to the other side of the rule rather than being clipped. */
  const flip = cx > W * 0.62
  const anchor = flip ? 'end' : 'start'
  const dx = flip ? -7 : 7

  const panel = (
    top: number,
    title: string,
    ticks: number[],
    sy: (v: number) => number,
    fmt: (v: number) => string,
    series: { x: number; y: number }[],
    tone: string,
    cursorY: number,
    cursorText: string,
  ) => (
    <>
      {ticks.map((t) => (
        <g key={`${top}-${t}`}>
          <line
            x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)}
            stroke={t === 0 ? 'var(--border-strong)' : 'var(--data-grid)'} strokeWidth={1}
          />
          <text
            x={pad.l - 8} y={sy(t) + 3.5} textAnchor="end"
            fill="var(--text-tertiary)" fontSize={10} fontFamily="var(--font-mono)"
          >
            {fmt(t)}
          </text>
        </g>
      ))}
      <path
        d={series.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')}
        fill="none" stroke={tone} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
      />
      {series.map((p) => (
        <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r={3.2} fill={tone} />
      ))}
      {/* The cursor carries a number, so it prints the number. */}
      <circle
        cx={cx} cy={cursorY} r={4.2}
        fill="var(--bg-raised)" stroke="var(--accent)" strokeWidth={2}
      />
      <text
        x={cx + dx} y={cursorY - 8} textAnchor={anchor}
        fill="var(--accent-text)" fontSize={10.5} fontFamily="var(--font-mono)"
        stroke="var(--bg-raised)" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round"
      >
        {cursorText}
      </text>
      <text
        x={pad.l} y={top - 6}
        fill="var(--text-secondary)" fontSize={11}
      >
        {title}
      </text>
    </>
  )

  return (
    <div style={scroller}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', minWidth: MIN_W, height: 'auto', display: 'block' }}
        role="img"
        aria-label={
          `Two panels against vault size in memories, both on zero baselines. Above, the tokens injected ` +
          `into the model at wake-up, which is flat across the measured range. Below, the milliseconds ` +
          `SQLite spends assembling that payload, which rises with the vault. Values are listed in the ` +
          `table that follows.`
        }
      >
        <title>Wake-up payload and the cost of assembling it, against vault size</title>

        {/* The cursor rule spans both panels: it is one vault size, read twice. */}
        <line
          x1={cx} x2={cx} y1={pad.t - 6} y2={pad.t + ph * 2 + gap}
          stroke="var(--accent-line)" strokeWidth={1} strokeDasharray="3 3"
        />

        {panel(
          pad.t, 'Tokens injected at wake-up', tok.ticks, syA, (v) => n(v),
          pts.map((p) => ({ x: p.memories, y: p.notion.injectedTokensApprox })),
          'var(--data-3)', syA(cur.notionTokens), `${n(cur.notionTokens)} tokens`,
        )}

        {panel(
          topB, 'Milliseconds to assemble it, SQLite', work.ticks, syB, (v) => n(v, v < 10 ? 1 : 0),
          pts.map((p) => ({ x: p.memories, y: p.sqlite.ms })),
          'var(--data-4)', syB(cur.ms), `${n(cur.ms, 2)} ms`,
        )}

        {x.ticks.map((t) => (
          <g key={`x${t}`}>
            <line
              x1={sx(t)} x2={sx(t)} y1={topB + ph} y2={topB + ph + 4}
              stroke="var(--border-strong)" strokeWidth={1}
            />
            <text
              x={sx(t)} y={topB + ph + 16} textAnchor="middle"
              fill="var(--text-tertiary)" fontSize={10} fontFamily="var(--font-mono)"
            >
              {n(t)}
            </text>
          </g>
        ))}
        <text
          x={pad.l + (W - pad.l - pad.r) / 2} y={H - 5} textAnchor="middle"
          fill="var(--text-secondary)" fontSize={11}
        >
          memories in the vault
        </text>
      </svg>
    </div>
  )
}

/**
 * Drag the vault bigger and watch what the model is handed stay the same.
 *
 * The teaching point is the one thing about agent memory that is most often got
 * backwards. A memory system does not get slow because the prompt got bigger:
 * the prompt is capped by the hook, and the capture shows it barely moves across
 * an eight-fold vault. What grows is the work behind it — and on a substrate
 * that answers in round trips, the work was already dominated by a rate limit
 * that does not care how big the vault is.
 */
export function VaultSizeExplorer() {
  const uid = useId()
  const stops = STOPS
  const cfg = exp.wakeup.config

  /* Open at the largest measured vault — the one every other figure in the
     paper is computed over, and the state the printed edition shows. */
  const [index, setIndex] = useState(stops.length - 1)
  const cur = stops[index]
  const first = stops[0]
  const last = stops[stops.length - 1]
  const readoutId = `${uid}-vault-readout`

  /* Round trips are 24 at every measured size, so this ratio is a property of
     the protocol rather than of the vault: the wake-up is bounded work either
     way, and one arm still pays eight seconds for it. */
  const overhead = cur.ms > 0 ? cur.floorSeconds * 1000 / cur.ms : 0
  const tokenGrowth = last.notionTokens / first.notionTokens
  const msGrowth = last.ms / first.ms

  return (
    <Figure
      title="What a bigger vault changes"
      meta={`${exp.wakeup.points.length} measured sizes · ${n(first.memories)}–${n(last.memories)} memories`}
      foot={
        <>
          The hook is capped by configuration, not by the vault: {cfg.recentMemories} recent memories,{' '}
          {cfg.activeFacts} active facts, {cfg.openTasks} open tasks, a {cfg.digestWindowDays}-day digest
          window. That is why the payload is flat. Round trips and statement count were identical at all{' '}
          {exp.wakeup.points.length} measured sizes, so interpolating them is not a guess; tokens, bytes
          and milliseconds were not, and a stop between two runs is marked interpolated and names the runs
          it sits between. Nothing is extrapolated past{' '}
          <span className="mono num">{n(last.memories)}</span> memories, because nothing was measured
          there. Both panels start at zero.
        </>
      }
      caption={
        <>
          Across an eight-fold vault the tokens injected at wake-up grow{' '}
          <span className="mono num">{times(tokenGrowth)}</span> and the work to assemble them grows{' '}
          <span className="mono num">{times(msGrowth)}</span>. A memory system does not get slow because
          the prompt got bigger — the prompt is capped, and the model pays the same bill at every size.
          What grows is the assembly, and on the Notion arm even that is beside the point: the same{' '}
          <span className="mono num">{n(last.roundTrips)}</span> round trips at{' '}
          {limits.requestsPerSecond} requests per second cost{' '}
          <span className="mono num">{duration(last.floorSeconds)}</span> before the agent can say its
          first word, at every vault size measured.
        </>
      }
    >
      <div style={{ display: 'grid', gap: '1rem' }}>
        <div className="no-print" style={{ display: 'grid', gap: '0.375rem' }}>
          <label
            htmlFor={`${uid}-vault`}
            className="label"
            style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.5rem' }}
          >
            <span>Vault size</span>
            <span className="meta">
              {n(first.memories)} {DASH} {n(last.memories)} memories, {exp.wakeup.points.length} of these
              stops measured
            </span>
          </label>
          <input
            id={`${uid}-vault`}
            type="range"
            min={0}
            max={stops.length - 1}
            step={1}
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
            aria-label="Vault size"
            aria-describedby={readoutId}
            aria-valuetext={`${n(cur.memories)} memories, ${cur.measured ? 'measured' : 'interpolated'}`}
            style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
          {/* Ticks under the measured stops. The reader can see, before touching
              anything, that four of thirteen positions are runs and the rest are
              lines drawn between them. */}
          <div style={{ position: 'relative', height: 16 }} aria-hidden="true">
            {stops.map((s, i) =>
              s.measured ? (
                <span
                  key={i}
                  className="meta"
                  style={{
                    position: 'absolute',
                    left: `${(i / (stops.length - 1)) * 100}%`,
                    transform: i === 0 ? 'none' : i === stops.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
                    whiteSpace: 'nowrap',
                    color: i === index ? 'var(--accent-text)' : undefined,
                  }}
                >
                  {n(s.memories)}
                </span>
              ) : null,
            )}
          </div>
        </div>

        <div id={readoutId} style={{ display: 'grid', gap: '0.5rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.5rem' }}>
            {/* States its own position: the slider does not print. */}
            <span className="heading-16 mono" style={{ margin: 0 }}>{n(cur.memories)} memories</span>
            <span className="meta">{n(cur.facts)} facts</span>
            {cur.measured ? (
              <span className="pill pill-ok">measured run</span>
            ) : (
              <span className="pill pill-accent">
                interpolated between {n(cur.from)} and {n(cur.to)}
              </span>
            )}
          </div>

          <div className="stat-strip">
            <div className="stat">
              <span className="stat-value num">{n(cur.notionTokens)}</span>
              <span className="stat-label">tokens injected, Notion arm</span>
            </div>
            <div className="stat">
              <span className="stat-value num">{n(cur.roundTrips)}</span>
              <span className="stat-label">round trips to assemble it</span>
            </div>
            <div className="stat">
              <span className="stat-value num">{duration(cur.floorSeconds)}</span>
              <span className="stat-label">
                rate-limit floor at {limits.requestsPerSecond} req/s
              </span>
            </div>
            <div className="stat">
              <span className="stat-value num">{bytes(cur.bytesIn)}</span>
              <span className="stat-label">bytes on the wire</span>
            </div>
            <div className="stat">
              <span className="stat-value num">{n(cur.ms, 2)}</span>
              <span className="stat-unit">ms</span>
              <span className="stat-label">
                {n(cur.statements)} statements, SQLite
              </span>
            </div>
          </div>

          <p className="caption" style={{ margin: 0 }}>
            At this size the same wake-up costs <span className="mono num">{times(overhead)}</span> more
            wall clock on the Notion arm than on SQLite, and the whole of that difference is the rate
            limit rather than the query: the round trips do not grow with the vault either, they are
            simply always {n(cur.roundTrips)}. The token bill, which is the thing a model is actually
            charged for, is the same on both arms to within{' '}
            {pct(Math.abs(cur.sqliteTokens - cur.notionTokens) / cur.notionTokens, 1)}.
          </p>
        </div>

        <WakeupPlot stops={stops} index={index} />

        <div className="sr-only">
          <table>
            <caption>
              The four measured wake-up runs: what each vault size cost to assemble and what it handed the
              model. Only these four were run; every other position on the control is a straight line
              between two of them.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="n">Memories</th>
                <th scope="col" className="n">Facts</th>
                <th scope="col" className="n">Notion round trips</th>
                <th scope="col" className="n">Rate-limit floor</th>
                <th scope="col" className="n">Bytes in</th>
                <th scope="col" className="n">Tokens injected, Notion</th>
                <th scope="col" className="n">SQLite statements</th>
                <th scope="col" className="n">SQLite milliseconds</th>
                <th scope="col" className="n">Tokens injected, SQLite</th>
              </tr>
            </thead>
            <tbody>
              {exp.wakeup.points.map((p) => (
                <tr key={p.fraction}>
                  <th scope="row" className="n">{n(p.memories)}</th>
                  <td className="n">{n(p.facts)}</td>
                  <td className="n">{n(p.notion.roundTrips)}</td>
                  <td className="n">{duration(p.notion.rateLimitFloorMs / 1000)}</td>
                  <td className="n">{bytes(p.notion.bytesIn)}</td>
                  <td className="n">{n(p.notion.injectedTokensApprox)}</td>
                  <td className="n">{n(p.sqlite.statements)}</td>
                  <td className="n">{n(p.sqlite.ms, 3)}</td>
                  <td className="n">{n(p.sqlite.injectedTokensApprox)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Figure>
  )
}

/* ======================================================= 3. the writer race */

/**
 * The interleave, spelled out.
 *
 * This is the one figure that shows a mechanism rather than a measurement. The
 * lost updates in the sweep are a consequence of six moments, and the six
 * moments are worth seeing in order: two writers probe, two writers find
 * nothing, two writers create. The protocol is `memory-topic-key.ts`'s
 * read-then-write, and the reason it cannot be fixed from the client is one line
 * of the API reference — there is no ETag, no If-Match, no conditional write of
 * any kind to hang the second half of the pair on.
 *
 * Stepping rather than animating: the reader controls the clock, which is the
 * right control for a race condition, and it is reduced-motion-safe by
 * construction. The only motion is `.swap-enter` on the step that changed, and
 * globals.css already neutralises that under prefers-reduced-motion.
 */
type Race = {
  who: 'A' | 'B'
  call: string
  detail: string
  result: string
  rows: number
  note?: string
}

const RACE: Race[] = [
  {
    who: 'A',
    call: 'POST /v1/data_sources/{Memories}/query',
    detail: 'Topic Key equals runbook/restart-payments-api',
    result: '0 results',
    rows: 0,
  },
  {
    who: 'B',
    call: 'POST /v1/data_sources/{Memories}/query',
    detail: 'the same filter, before A has written anything',
    result: '0 results',
    rows: 0,
    note: 'The window opens here, and nothing can close it. The Data API documents no ETag, no If-Match and no conditional write, so B cannot say "create this only if the key is still free".',
  },
  {
    who: 'A',
    call: 'POST /v1/pages',
    detail: 'Topic Key set, Revision Count 1',
    result: 'page up_0_a created',
    rows: 1,
  },
  {
    who: 'B',
    call: 'POST /v1/pages',
    detail: 'the same key, because B probed before A wrote',
    result: 'page up_0_b created',
    rows: 2,
    note: 'Two rows for one topic key. INV-1 says at most one, and the invariant is enforced by the read-then-write above rather than by the store — so this write is not refused, it is accepted.',
  },
  {
    who: 'A',
    call: 'PATCH /v1/pages/up_0_a',
    detail: 'next round: A probed, found the first row, and increments Revision Count to 2',
    result: 'Revision Count 2',
    rows: 2,
  },
  {
    who: 'B',
    call: 'PATCH /v1/pages/up_0_a',
    detail: 'B probed in the same round and read the same value, so it writes the same number',
    result: 'Revision Count 2',
    rows: 2,
    note: 'A’s increment is gone. Last write wins, and both writers computed their new value from the same stale read. From here every round loses one update per writer beyond the first.',
  },
]

const UPSERT = `CREATE UNIQUE INDEX ux_topic_key ON memory (topic_key, project_id);

INSERT INTO memory (memory_id, topic_key, project_id, revision_count)
VALUES (?, ?, ?, 1)
ON CONFLICT (topic_key, project_id)
DO UPDATE SET revision_count = revision_count + 1`

function RaceStep({ step, i, active }: { step: Race; i: number; active: boolean }) {
  return (
    <li
      style={{
        display: 'grid',
        gap: '0.1875rem',
        padding: '0.5rem 0.625rem',
        borderRadius: 'var(--radius-sm)',
        border: 'var(--rule)',
        /* The current step is marked by a rule and by its number being bold, not
           by colour alone. */
        borderLeft: active ? '3px solid var(--accent)' : '3px solid var(--border-faint)',
        background: active ? 'var(--bg-sunken)' : 'transparent',
        color: active ? undefined : 'var(--text-tertiary)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem 0.625rem', alignItems: 'baseline' }}>
        <span className="mono" style={{ fontSize: '0.75rem', fontWeight: active ? 600 : 400 }}>
          {i + 1}. writer {step.who}
        </span>
        <span className="mono" style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
          {step.call}
        </span>
      </div>
      <p className="caption" style={{ margin: 0 }}>
        {step.detail} {DASH} <span className="mono">{step.result}</span>, rows under this key:{' '}
        <span className="mono num">{step.rows}</span>
      </p>
      {step.note ? (
        <p className="caption" style={{ margin: '0.125rem 0 0', color: 'var(--accent-text)' }}>
          {step.note}
        </p>
      ) : null}
    </li>
  )
}

export function WriterRaceExplorer() {
  const uid = useId()
  const sweep = exp.concurrencySweep
  const head = exp.concurrency
  const inv = schema.invariants.find((i) => i.id === 'INV-1')

  /* Eight writers: the run the paper quotes, and the printed default. */
  const [writers, setWriters] = useState(head.writers)
  /* The last step, so the printed figure carries the whole interleave with its
     conclusion marked. Stepping back is what a reader does with it. */
  const [step, setStep] = useState(RACE.length - 1)

  const min = Math.min(...sweep.map((s) => s.writers))
  const max = Math.max(...sweep.map((s) => s.writers))
  const point = sweep.find((s) => s.writers === writers) ?? null
  const below = [...sweep].reverse().find((s) => s.writers < writers) ?? null
  const above = sweep.find((s) => s.writers > writers) ?? null

  const rateAxis = axisOf(Math.max(...sweep.map((s) => s.notionLostUpdateRate)), 4).max
  const dupAxis = axisOf(Math.max(...sweep.map((s) => s.notionDuplicateRows)), 4).max

  const advance = (d: number) => setStep((s) => Math.min(RACE.length - 1, Math.max(0, s + d)))

  return (
    <Figure
      title="Two writers, one topic key"
      meta={`${sweep.length} measured writer counts · ${n(head.rounds)}-round headline run`}
      foot={
        <>
          The sweep runs a fixed schedule of rounds at each of{' '}
          {sweep.map((s) => s.writers).join(', ')} writers, with every round interleaved: all writers
          probe, then all writers write, which is the worst schedule the protocol admits and the one the
          API gives no way to exclude. The headline run in the paper is deeper —{' '}
          {n(head.rounds)} rounds at {head.writers} writers — and reports{' '}
          {pct(head.notion.lostUpdateRate)}, above the{' '}
          {pct(sweep.find((s) => s.writers === head.writers)?.notionLostUpdateRate ?? 0)} the sweep
          reports at the same width, because only the first round has nothing yet to lose and its share
          shrinks as rounds are added. The SQL arm loses{' '}
          {pct(head.sql.lostUpdateRate, 0)} at every width measured: the upsert is one statement, so
          there is no window between the read and the write to interleave anything into. Bars run from
          zero.
        </>
      }
      caption={
        <>
          Lore enforces {inv ? <span className="mono">{inv.declarative}</span> : 'the topic-key invariant'}{' '}
          in application code, by reading before writing — which is the only place it can be enforced,
          because the substrate offers no unique index and no conditional write. The sweep is what that
          costs under contention. The interleave below is why: not a rare interleaving, but the ordinary
          one, and the reason a database has had a one-line answer to it since before any of this was
          written.
        </>
      }
    >
      <div style={{ display: 'grid', gap: '1rem' }}>
        <div className="no-print" style={{ display: 'grid', gap: '0.375rem' }}>
          <label
            htmlFor={`${uid}-writers`}
            className="label"
            style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.5rem' }}
          >
            <span>Concurrent writers on the same topic key</span>
            <span className="meta">measured at {sweep.map((s) => s.writers).join(', ')}</span>
          </label>
          <input
            id={`${uid}-writers`}
            type="range"
            min={min}
            max={max}
            step={1}
            value={writers}
            onChange={(e) => setWriters(Number(e.target.value))}
            aria-label="Concurrent writers"
            aria-valuetext={`${writers} writers, ${point ? 'measured' : 'not measured'}`}
            style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
          <div style={{ position: 'relative', height: 16 }} aria-hidden="true">
            {sweep.map((s) => (
              <span
                key={s.writers}
                className="meta"
                style={{
                  position: 'absolute',
                  left: `${((s.writers - min) / (max - min)) * 100}%`,
                  transform:
                    s.writers === min ? 'none' : s.writers === max ? 'translateX(-100%)' : 'translateX(-50%)',
                  color: s.writers === writers ? 'var(--accent-text)' : undefined,
                }}
              >
                {s.writers}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: '0.625rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.5rem' }}>
            <span className="heading-16 mono" style={{ margin: 0 }}>{writers} writers</span>
            {point ? (
              <span className="pill pill-ok">measured run</span>
            ) : (
              <span className="pill pill-bad">not measured</span>
            )}
          </div>

          {point ? (
            /* Two measured quantities, drawn separately, because the sweep
               records the duplicate count for one arm only. Inventing the other
               arm's zero to make a matching pair would be asserting a
               measurement that was never taken — the headline run says it
               instead, and says at what width. */
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div style={{ display: 'grid', gap: '0.375rem' }}>
                <span className="label">
                  Writes lost, of every write attempted {DASH} axis 0 {DASH} {pct(rateAxis, 0)}
                </span>
                {[
                  { label: 'read-then-write, Data API', v: point.notionLostUpdateRate, tone: 'var(--data-3)' },
                  { label: 'INSERT … ON CONFLICT, one statement', v: point.sqlLostUpdateRate, tone: 'var(--data-4)' },
                ].map((r) => (
                  <div
                    key={r.label}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(120px, 34%) minmax(0, 1fr) auto',
                      alignItems: 'center',
                      gap: '0.625rem',
                    }}
                  >
                    <span className="label" style={{ fontSize: '0.75rem', textAlign: 'right' }}>{r.label}</span>
                    <Meter value={r.v} max={rateAxis} tone={r.tone} />
                    <span className="mono num" style={{ fontSize: '0.75rem', minWidth: '6ch', textAlign: 'right' }}>
                      {pct(r.v)}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gap: '0.375rem' }}>
                <span className="label">
                  Rows created under one topic key, where the invariant allows one {DASH} axis 0 {DASH}{' '}
                  {n(dupAxis)} extra
                </span>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(120px, 34%) minmax(0, 1fr) auto',
                    alignItems: 'center',
                    gap: '0.625rem',
                  }}
                >
                  <span className="label" style={{ fontSize: '0.75rem', textAlign: 'right' }}>
                    read-then-write, Data API
                  </span>
                  <Meter value={point.notionDuplicateRows} max={dupAxis} tone="var(--data-3)" />
                  <span className="mono num" style={{ fontSize: '0.75rem', minWidth: '6ch', textAlign: 'right' }}>
                    {n(point.notionDuplicateRows)}
                  </span>
                </div>
                <p className="meta" style={{ margin: 0 }}>
                  The sweep does not count duplicates on the SQL arm, because the unique index cannot
                  produce one; the {n(head.rounds)}-round run at {head.writers} writers measured it
                  directly and found {n(head.sql.rows)} row and {n(head.sql.duplicateRows)} duplicates.
                </p>
              </div>
            </div>
          ) : (
            /* No line is drawn through a gap. The two runs either side are named
               and printed, and neither of them is called the answer. */
            <div
              style={{
                border: 'var(--rule)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg-sunken)',
                padding: '0.75rem 0.875rem',
                display: 'grid',
                gap: '0.5rem',
              }}
            >
              <p className="body" style={{ margin: 0, fontSize: '0.875rem' }}>
                No run at {writers} writers. The sweep measured{' '}
                {sweep.map((s) => s.writers).join(', ')}, and a rate for this width would be a line drawn
                through a gap rather than a measurement, so none is drawn. The two runs either side are:
              </p>
              <ul className="caption" style={{ margin: 0, paddingLeft: '1.125rem', display: 'grid', gap: '0.25rem' }}>
                {[below, above].map((s) =>
                  s ? (
                    <li key={s.writers}>
                      <span className="mono num">{s.writers}</span> writers {DASH}{' '}
                      <span className="mono num">{pct(s.notionLostUpdateRate)}</span> of writes lost,{' '}
                      <span className="mono num">{n(s.notionDuplicateRows)}</span> duplicate rows on the
                      Data API arm; <span className="mono num">{pct(s.sqlLostUpdateRate)}</span> on the SQL
                      arm.
                    </li>
                  ) : null,
                )}
              </ul>
            </div>
          )}
        </div>

        {/* The mechanism. Two columns: six moments on the left, none on the
            right, which is the comparison. */}
        <div className="grid-2" style={{ alignItems: 'start', gap: '1rem' }}>
          <div style={{ display: 'grid', gap: '0.625rem', alignContent: 'start' }}>
            <div
              style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.5rem' }}
            >
              <span className="label">
                Read-then-write, step {step + 1} of {RACE.length}
              </span>
              <span className="seg no-print" role="group" aria-label="Step through the interleave">
                <button type="button" onClick={() => advance(-1)} disabled={step === 0}>
                  <Icon name="chevronLeft" size={13} />
                  back
                </button>
                <button
                  type="button"
                  onClick={() => advance(1)}
                  disabled={step === RACE.length - 1}
                >
                  next
                  <Icon name="chevronRight" size={13} />
                </button>
              </span>
            </div>

            <ol key={step} className="swap-enter" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.375rem' }}>
              {RACE.map((r, i) => (
                <RaceStep key={i} step={r} i={i} active={i === step} />
              ))}
            </ol>
          </div>

          <div style={{ display: 'grid', gap: '0.625rem', alignContent: 'start' }}>
            <span className="label">One statement, no steps</span>
            <div className="code-block">
              <div className="code-head">
                <span className="mono">tools/exp/integrity.mjs</span>
                <span>run by both writers</span>
              </div>
              <pre><code>{UPSERT}</code></pre>
            </div>
            <p className="caption" style={{ margin: 0 }}>
              There is nothing to step through. The unique index makes the second writer&rsquo;s insert a
              conflict rather than a second row, and <span className="mono">DO UPDATE</span> computes the
              new revision from the value in the row rather than from a value the client read a moment
              ago. Both writers run the same statement, in either order, at any width:{' '}
              <span className="mono num">{n(head.sql.rows)}</span> row,{' '}
              <span className="mono num">{n(head.sql.lostUpdates)}</span> lost updates,{' '}
              <span className="mono num">{n(head.sql.duplicateRows)}</span> duplicates. The invariant is
              declared where the data is, so it holds for every writer that reaches the data, including
              the ones nobody wrote the client for.
            </p>
          </div>
        </div>

        <div className="sr-only">
          <table>
            <caption>
              The concurrency sweep: lost updates and duplicate rows at each measured number of writers,
              for read-then-write against the Data API and for a single upsert against a unique index.
              Duplicate rows were not counted on the SQL arm in the sweep.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="n">Writers</th>
                <th scope="col" className="n">Lost updates, Data API</th>
                <th scope="col" className="n">Duplicate rows, Data API</th>
                <th scope="col" className="n">Lost updates, SQL</th>
              </tr>
            </thead>
            <tbody>
              {sweep.map((s) => (
                <tr key={s.writers}>
                  <th scope="row" className="n">{s.writers}</th>
                  <td className="n">{pct(s.notionLostUpdateRate)}</td>
                  <td className="n">{n(s.notionDuplicateRows)}</td>
                  <td className="n">{pct(s.sqlLostUpdateRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Figure>
  )
}
