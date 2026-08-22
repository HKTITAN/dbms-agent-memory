/* Explanatory diagrams.
 *
 * Five figures, all server components — nothing here holds state, so none of it
 * ships JavaScript. Each exists to show a mechanism rather than to decorate a
 * section: what the Notion Data API physically makes a client do to answer one
 * join, what the three surfaces of Lore sit on, what two time axes over one
 * fact actually look like when they disagree, which normalisation violations
 * survive into the shipped product, and which invariants have nothing at all
 * standing behind them.
 *
 * Every number is read from `capture` through the selectors in lib/data, never
 * typed in. Where a drawing needs a coordinate that is not measured — the day a
 * schematic fact begins, the order of the boxes — the figure says so in its
 * footer, and the measured distances beside it are drawn to the same scale so
 * the reader can tell which is which.
 *
 * Colour discipline. The four-step --data ramp is the only ramp, and inside a
 * figure it encodes exactly one variable: request phase in the round-trip comb,
 * nothing at all in the others. --accent is spent once per figure, on the single
 * mark the figure exists to point at — the one SQL statement, the waist that
 * every query has to pass through, the lag between the axes, the SHIPPING tag,
 * the broken enforcement arrow — and it never carries a value on its own: there
 * is always a word or a shape beside it. No literal hex appears anywhere.
 *
 * Framing. Each figure is wrapped in the shared `Figure` component, so the head,
 * the foot and the caption match every chart in the paper. The print classes
 * (`dia`, `dia-tall`, `dia-keep-grid`, `dia-node`) therefore sit on a wrapper
 * inside the figure body rather than on the <figure> itself; the selectors in
 * globals.css are descendant selectors, so the grid-flattening and the
 * never-split-a-node rules still apply. `.figure` already carries
 * `break-inside: avoid` on paper, which is what the tall ladders would have
 * asked for anyway.
 */

import type { CSSProperties, ReactNode } from 'react'
import type { Invariant, NormalizationStep } from '@/lib/types'
import {
  amp, bytes, capture, duration, exp, limits, n, pct, schema, times, unenforcedInvariants,
} from '@/lib/data'
import { Figure } from './charts'

/* ------------------------------------------------------------ shared atoms */

/** Present in the accessibility tree, absent from layout. Carries the fallback
 *  tables: a picture of a number is not the number. */
/* Tabular figures on every SVG root. A column of counts whose digits shift by a
   pixel from row to row reads as noise rather than as a quantity. */
const SVG_STYLE: CSSProperties = { display: 'block', fontVariantNumeric: 'tabular-nums' }

const MONO = 'var(--font-mono)'

/* Wide drawings scroll inside their own box rather than widening the page. */
const SCROLL: CSSProperties = { overflowX: 'auto', overscrollBehaviorX: 'contain' }

/* ============================================================ 1. round trips */

/* The tick field. One tick is one request and one row is a hundred of them, so
   the reader can measure the comb by counting rows instead of trusting a
   caption. Both panels are drawn at this geometry and into the same viewBox, so
   the single SQL mark sits at exactly the scale of one Notion request — which is
   the whole argument of the figure, and would be lost the moment each panel got
   an axis of its own. */
const TICKS_PER_ROW = 100
const TICK_PITCH = 4.1
const TICK_H = 9
const ROW_PITCH = 15
const TICK_X0 = 8
const TICK_Y0 = 34
const FIELD_W = TICKS_PER_ROW * TICK_PITCH
const FIELD_VB_W = 440

/** One `d` string for a whole run of ticks. A thousand <line> elements would be
 *  a thousand nodes in the served HTML for a picture that never changes. */
function tickPath(from: number, count: number): string {
  let d = ''
  for (let i = 0; i < count; i += 1) {
    const k = from + i
    const x = TICK_X0 + (k % TICKS_PER_ROW) * TICK_PITCH
    const y = TICK_Y0 + Math.floor(k / TICKS_PER_ROW) * ROW_PITCH
    d += `M${x.toFixed(1)},${y}v${TICK_H}`
  }
  return d
}

function Kw({ children }: { children: string }) {
  return <span className="tok-kw">{children}</span>
}

/**
 * The N+1 join, drawn as two request timelines at one scale.
 *
 * The question is the simplest join in the paper: a fact, the memory it came
 * from, and the author of that memory. In SQL it is one statement, because the
 * engine owns the join. Against the Notion Data API there is no join at all —
 * the client pages the Facts database, then issues one page retrieval per fact
 * to reach a property that lives on the other side of a relation, then filters
 * in its own memory. The shape of that is a comb; the shape of the other is a
 * single mark. Nothing else in the figure is doing any work.
 *
 * The rate-limit floor is the second half of the point. Round trips are free to
 * count and expensive to spend: at Notion's documented three requests per second
 * the same question has a floor measured in minutes before a single row has been
 * joined.
 */
export function RoundTripDiagram() {
  const a = amp('provenance')
  /* A capture written before this class existed has no record to draw. */
  if (!(a && a.notionRoundTrips > 0)) return null

  const rps = limits.requestsPerSecond
  const total = Math.round(a.notionRoundTrips)
  /* The amplification record splits cleanly: every row the client had to hold is
     a row it had to fetch a page for, and what is left over is the paged query
     that listed them. Deriving the split rather than asserting it keeps the two
     phases honest if the workload changes. */
  const fetches = Math.min(Math.round(a.rowsClientSide), total - 1)
  const listing = Math.max(total - fetches, 1)

  const rows = Math.max(1, Math.ceil(total / TICKS_PER_ROW))
  const fieldBottom = TICK_Y0 + rows * ROW_PITCH
  const H = fieldBottom + 34
  const viewBox = `0 0 ${FIELD_VB_W} ${H}`
  const dividerX = TICK_X0 + listing * TICK_PITCH

  /* The SQL arm is not rate limited; it is drawn at Notion's ceiling anyway so
     the two floors sit on one scale rather than on two incomparable ones. */
  const sqlFloor = a.sqlStatements / rps

  const phases = [
    {
      call: 'POST /v1/databases/{Facts}/query',
      count: `× ${n(listing)}`,
      why: `${n(limits.pageSizeMax)} rows per page. The API offers no join, so the query can only return the fact rows.`,
    },
    {
      call: 'GET  /v1/pages/{fact.Source}',
      count: `× ${n(fetches)}`,
      why: 'One retrieval per fact. Author lives on the memory page, on the far side of a relation.',
      accent: true,
    },
    {
      call: 'filter on Author',
      count: 'in the client',
      why: `${n(a.rowsClientSide, 1)} rows the caller holds in its own memory and scans itself.`,
    },
  ]

  return (
    <Figure
      full
      title="One join, two shapes"
      meta={
        <>
          {n(a.notionRoundTrips)} requests vs {n(a.sqlStatements)} statement · {times(a.notionRoundTrips / Math.max(a.sqlStatements, 1))}
        </>
      }
      caption={
        <>
          Provenance is the cheapest join a memory store can be asked for: a fact, the memory it
          came from, and who wrote it. The Notion arm answers it correctly and pays{' '}
          {n(a.notionRoundTrips)} HTTP round trips for the mean question, {n(fetches)} of them a
          single page retrieval issued because a relation cannot be followed inside a query. At the
          documented {n(rps)} requests per second that is a floor of {duration(a.notionFloorSeconds)}{' '}
          before any row is joined. The same question is one statement, and the engine does the
          join.
        </>
      }
      foot={
        <>
          Each tick is one HTTP request; each row of ticks is {n(TICKS_PER_ROW)}. Both panels are
          drawn into the same box at the same tick pitch, so the single accented mark on the right is
          exactly one request wide. Counts are the mean over the provenance questions in the
          workload, rounded to whole requests for the drawing; the unrounded means are in the table
          behind this figure. The SQL floor is the same {n(rps)} requests per second applied to one
          statement — no rate limit applies to a local engine, and it is shown at Notion&#39;s
          ceiling only so the two numbers share a scale.
        </>
      }
    >
      <div className="dia dia-keep-grid">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 'clamp(1rem, 2.5vw, 1.75rem)',
          }}
        >
          {/* ---- left: what the Data API forces */}
          <div className="dia-node" style={{ minWidth: 0 }}>
            <h3 className="heading-16" style={{ margin: '0 0 0.0625rem' }}>Notion Data API</h3>
            <p className="meta" style={{ margin: '0 0 0.625rem' }}>
              lore-fact action=query · a client-side join
            </p>

            <div className="code-block">
              <div className="code-head">
                <span>three phases</span>
                <span>{n(total)} requests</span>
              </div>
              <div style={{ padding: '0.75rem 0.875rem', display: 'grid', gap: '0.6875rem' }}>
                {phases.map((p) => (
                  <div
                    key={p.call}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      columnGap: '0.75rem',
                      alignItems: 'baseline',
                    }}
                  >
                    <span
                      className="mono"
                      style={{ fontSize: '0.75rem', overflowWrap: 'anywhere' }}
                    >
                      {p.call}
                    </span>
                    <span
                      className="mono"
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: p.accent ? 'var(--accent-text)' : 'var(--text-secondary)',
                      }}
                    >
                      {p.count}
                    </span>
                    <span className="meta" style={{ gridColumn: '1 / -1', marginTop: '0.125rem' }}>
                      {p.why}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...SCROLL, marginTop: '0.875rem' }}>
              <svg
                viewBox={viewBox}
                width="100%"
                style={{ ...SVG_STYLE, minWidth: 320 }}
                role="img"
                aria-label={
                  `A field of ${n(total)} tick marks, each one HTTP request, laid out ` +
                  `${TICKS_PER_ROW} to a row across ${rows} rows. The first ${n(listing)} ticks are ` +
                  `the paged query over the Facts database; a rule separates them from the ` +
                  `${n(fetches)} that follow, one page retrieval per fact.`
                }
              >
                <title>Notion request timeline for one provenance question</title>

                <text x={TICK_X0} y={20} fontSize={9.5} fontFamily={MONO} fill="var(--text-secondary)">
                  {n(listing)} paged query requests, then {n(fetches)} page reads — one per fact
                </text>

                {/* Phase 1 sits lighter on the ramp than phase 2, but the phases
                    are also contiguous, separated by a rule, and counted in words
                    above — colour is never carrying this on its own. */}
                <path
                  d={tickPath(0, listing)}
                  stroke="var(--data-1)"
                  strokeWidth={1.4}
                  fill="none"
                />
                <path
                  d={tickPath(listing, total - listing)}
                  stroke="var(--data-3)"
                  strokeWidth={1.3}
                  fill="none"
                />
                <line
                  x1={dividerX} x2={dividerX} y1={TICK_Y0 - 4} y2={TICK_Y0 + TICK_H + 4}
                  stroke="var(--border-strong)" strokeWidth={1.2}
                />

                <line
                  x1={TICK_X0} x2={TICK_X0 + FIELD_W} y1={fieldBottom + 6} y2={fieldBottom + 6}
                  stroke="var(--border)" strokeWidth={1}
                />
                <text x={TICK_X0} y={fieldBottom + 22} fontSize={9.5} fill="var(--text-tertiary)">
                  one tick = one request · one row = {n(TICKS_PER_ROW)}
                </text>
                <text
                  x={TICK_X0 + FIELD_W} y={fieldBottom + 22} textAnchor="end"
                  fontSize={10} fontFamily={MONO} fontWeight={600} fill="var(--text)"
                >
                  {n(total)} requests
                </text>
              </svg>
            </div>

            <p className="label num" style={{ margin: '0.625rem 0 0' }}>
              <span style={{ color: 'var(--text-faint)' }}>floor at {n(rps)} req/s </span>
              <span className="mono" style={{ fontWeight: 600 }}>
                {duration(a.notionFloorSeconds)}
              </span>
              <span style={{ color: 'var(--text-tertiary)' }}> · {bytes(a.bytesIn)} received</span>
            </p>
          </div>

          {/* ---- right: the same question as one statement */}
          <div className="dia-node" style={{ minWidth: 0 }}>
            <h3 className="heading-16" style={{ margin: '0 0 0.0625rem' }}>SQLite · PostgreSQL</h3>
            <p className="meta" style={{ margin: '0 0 0.625rem' }}>
              one statement · the engine owns the join
            </p>

            <div className="code-block">
              <div className="code-head">
                <span>one statement</span>
                <span>{n(a.sqlStatements)} round trip</span>
              </div>
              <pre>
                <code>
                  <Kw>SELECT</Kw>{' f.subject, f.predicate, f.object,\n'}
                  {'       m.title, m.author\n'}
                  <Kw>FROM</Kw>{'   fact f\n'}
                  <Kw>JOIN</Kw>{'   memory m '}<Kw>ON</Kw>{' m.memory_id = f.source_memory_id\n'}
                  <Kw>WHERE</Kw>{'  m.author = ?;'}
                </code>
              </pre>
            </div>

            <div style={{ ...SCROLL, marginTop: '0.875rem' }}>
              <svg
                viewBox={viewBox}
                width="100%"
                style={{ ...SVG_STYLE, minWidth: 320 }}
                role="img"
                aria-label={
                  `The same field at the same scale, holding ${n(a.sqlStatements)} tick: one SQL ` +
                  'statement, one round trip. The rest of the field is empty.'
                }
              >
                <title>SQL request timeline for the same provenance question</title>

                <text x={TICK_X0} y={20} fontSize={9.5} fontFamily={MONO} fill="var(--text-secondary)">
                  the join happens inside the engine — nothing crosses a network
                </text>

                <path
                  d={tickPath(0, Math.max(1, Math.round(a.sqlStatements)))}
                  stroke="var(--accent)"
                  strokeWidth={2.4}
                  fill="none"
                />
                <text
                  x={TICK_X0 + 12} y={TICK_Y0 + TICK_H - 1}
                  fontSize={10} fontFamily={MONO} fontWeight={600} fill="var(--accent-text)"
                >
                  {n(a.sqlStatements)} statement · {n(a.sqlStatements)} round trip
                </text>

                <line
                  x1={TICK_X0} x2={TICK_X0 + FIELD_W} y1={fieldBottom + 6} y2={fieldBottom + 6}
                  stroke="var(--border)" strokeWidth={1}
                />
                <text x={TICK_X0} y={fieldBottom + 22} fontSize={9.5} fill="var(--text-tertiary)">
                  same field, same tick pitch, same scale
                </text>
                <text
                  x={TICK_X0 + FIELD_W} y={fieldBottom + 22} textAnchor="end"
                  fontSize={10} fontFamily={MONO} fontWeight={600} fill="var(--text)"
                >
                  {n(a.sqlStatements)} request
                </text>
              </svg>
            </div>

            <p className="label num" style={{ margin: '0.625rem 0 0' }}>
              <span style={{ color: 'var(--text-faint)' }}>floor at the same {n(rps)} req/s </span>
              <span className="mono" style={{ fontWeight: 600 }}>{duration(sqlFloor)}</span>
              <span style={{ color: 'var(--text-tertiary)' }}> · 0 rows joined in the client</span>
            </p>
          </div>
        </div>

        <table className="sr-only">
          <caption>
            The mean cost of one provenance question — a fact, its source memory and that
            memory&#39;s author — on the Notion Data API and on a relational engine.
          </caption>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col" className="n">Notion Data API</th>
              <th scope="col" className="n">SQL</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Round trips per question</th>
              <td className="n">{n(a.notionRoundTrips, 2)}</td>
              <td className="n">{n(a.sqlStatements)}</td>
            </tr>
            <tr>
              <th scope="row">— paged query over Facts</th>
              <td className="n">{n(listing)}</td>
              <td className="n">—</td>
            </tr>
            <tr>
              <th scope="row">— page retrieval, one per fact</th>
              <td className="n">{n(fetches)}</td>
              <td className="n">—</td>
            </tr>
            <tr>
              <th scope="row">Rows joined in the client</th>
              <td className="n">{n(a.rowsClientSide, 1)}</td>
              <td className="n">0</td>
            </tr>
            <tr>
              <th scope="row">Bytes received</th>
              <td className="n">{bytes(a.bytesIn)}</td>
              <td className="n">—</td>
            </tr>
            <tr>
              <th scope="row">Floor at {n(rps)} requests per second</th>
              <td className="n">{duration(a.notionFloorSeconds)}</td>
              <td className="n">{duration(sqlFloor)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Figure>
  )
}

/* ============================================================== 2. surfaces */

/* Geometry declared once. Connectors are derived from these boxes, because
   hand-tuned coordinates in two places is how a diagram ends up with an arrow
   pointing at nothing three edits later. */
const SURF_VB_W = 920
const ROW_X = 40
const ROW_W = 840

const SURF_BOXES = [
  {
    x: 40,
    w: 236,
    h: 62,
    title: 'MCP server',
    lines: ['lore-memory · lore-fact', 'lore-entity · lore-topic'],
    sub: 'tools the model calls',
  },
  {
    x: 300,
    w: 236,
    h: 62,
    title: 'CLI',
    lines: ['lore save · lore recall', 'lore conflicts scan · migrate'],
    sub: 'commands an operator runs',
  },
  {
    x: 560,
    w: 320,
    h: 90,
    title: 'lifecycle hooks',
    lines: [
      'wake-up: recent memories, active',
      'facts, open tasks, digest window',
      'autosave: the session distilled',
    ],
    sub: 'fires with no prompt at all',
  },
]

const SURF_ROW_Y = 54
const SURF_SERVICES_Y = 190
const SURF_SERVICES_H = 96
const SURF_API_Y = 330
const SURF_API_H = 100
const SURF_DB_Y = 468
const SURF_DB_H = 50
const SURF_VB_H = 540

/* The services are named for the files they live in, so a reader can check
   them: memory-topic-key.ts, FactService.create, entity.ts and entity-merge.ts,
   policy/confidence.ts with core/decay.ts, cli/commands/conflicts.ts. */
const SERVICES = [
  { title: 'MemoryService', sub: 'upsert by topic key' },
  { title: 'FactService', sub: 'dedup key at write' },
  { title: 'EntityService', sub: 'aliases · merge' },
  { title: 'confidence policy', sub: 'seed · bump · decay' },
  { title: 'conflicts scan', sub: 'capped at 500 / project' },
]

function SurfaceBox({
  x, y, w, h, title, sub, lines,
}: {
  x: number; y: number; w: number; h: number; title: string; sub: string; lines: string[]
}) {
  return (
    <g>
      <rect
        x={x} y={y} width={w} height={h} rx={5}
        fill="var(--bg-raised)" stroke="var(--border-strong)" strokeWidth={1.2}
      />
      <text x={x + 16} y={y + 22} fontSize={12.5} fontWeight={560} fill="var(--text)">
        {title}
      </text>
      <text x={x + w - 16} y={y + 22} textAnchor="end" fontSize={8.5} fill="var(--text-faint)">
        {sub}
      </text>
      {lines.map((l, i) => (
        <text
          key={l} x={x + 16} y={y + 41 + i * 13}
          fontSize={9} fontFamily={MONO} fill="var(--text-secondary)"
        >
          {l}
        </text>
      ))}
    </g>
  )
}

/**
 * Lore, as four layers with a waist.
 *
 * Three surfaces — an MCP server, a CLI and a pair of lifecycle hooks — all call
 * the same domain services, and those services reach the store through exactly
 * one thing: the Notion Data API. That single waist is the figure. Everything
 * above it is ordinary application architecture and could be rewritten freely;
 * nothing above it can ask a question the waist cannot express, and the waist
 * offers no join, no aggregate, a hundred rows per request and three requests a
 * second. The accent is spent there, because that is the layer the rest of the
 * paper measures.
 *
 * The hooks are drawn with their triggers attached because they are the reason
 * the cost compounds: the wake-up hook fires at session start and the autosave
 * hook at session end, with no user asking for either, so the round-trip bill is
 * paid twice per session whether or not the agent ever recalls anything.
 */
export function SurfaceDiagram() {
  const dbs = capture.subject.databases
  const gap = 15
  const dbW = (ROW_W - (dbs.length - 1) * gap) / dbs.length

  /* The waist's constraints, read from the captured API limits rather than
     retyped, so a change in the documented ceilings rewrites the figure. */
  const waist = [
    { label: 'page size', value: `${n(limits.pageSizeMax)} rows` },
    { label: 'rate limit', value: `${n(limits.requestsPerSecond)} req/s` },
    { label: 'joins', value: limits.joins },
    { label: 'aggregates', value: limits.aggregates },
    { label: 'search', value: limits.searchMatches },
    { label: 'conditional writes', value: limits.conditionalWrites },
  ]
  const waistW = 124
  const waistGap = (ROW_W - 32 - waist.length * waistW) / (waist.length - 1)

  const svcW = 152
  const svcGap = (ROW_W - 32 - SERVICES.length * svcW) / (SERVICES.length - 1)

  return (
    <Figure
      full
      title="Three surfaces, one waist, five databases"
      meta={<>{capture.subject.surfaces.join(' · ')}</>}
      caption={
        <>
          Every operation Lore performs — whether the model called a tool, an operator typed a
          command, or a hook fired on its own — descends through the same domain services onto the
          same HTTP surface. That surface is where the relational vocabulary stops: it offers no
          join and no aggregate, returns at most {n(limits.pageSizeMax)} rows per request, and is
          documented at {n(limits.requestsPerSecond)} requests per second. Section 3 is about what
          that waist costs; Sections 5 and 6 are about what it makes undeclarable.
        </>
      }
      foot={
        <>
          Layers, not a call graph: an arrow means the layer above can only reach the layer below
          through this edge. Highlighted: the Notion Data API, the single point every question has
          to be expressible at. The two chips above the hooks are the events that fire them —
          session start and session end — and neither involves a prompt, so a session pays the
          wake-up bill before the agent has said anything and the autosave bill after it has
          finished. Property names and the five databases are read from Lore&#39;s own schema; the
          service names are the modules those operations live in.
        </>
      }
    >
      <div className="dia">
        <div style={SCROLL}>
          <svg
            viewBox={`0 0 ${SURF_VB_W} ${SURF_VB_H}`}
            width="100%"
            style={{ ...SVG_STYLE, minWidth: 600 }}
            role="img"
            aria-label={
              'A four-layer stack. At the top, three surfaces: an MCP server, a CLI, and lifecycle ' +
              'hooks fired by session start and session end. All three descend into one layer of ' +
              'shared domain services, which descends through a single highlighted layer, the ' +
              'Notion Data API, which is the only route to the bottom layer of five Notion ' +
              'databases: Projects, Topics, Memories, Entities and Facts. The API layer offers no ' +
              'joins and no aggregates, returns a hundred rows per request, and is limited to ' +
              'three requests per second. The layers and their contents are listed in the table ' +
              'that follows.'
            }
          >
            <title>Lore — surfaces, domain services, the Notion Data API, and the vault</title>

            <defs>
              <marker
                id="surf-arrow" viewBox="0 0 8 8" refX="6.4" refY="4"
                markerWidth="6" markerHeight="6" orient="auto"
              >
                <path d="M0,0.8 L7,4 L0,7.2 Z" fill="var(--text-tertiary)" />
              </marker>
              <marker
                id="surf-arrow-ink" viewBox="0 0 8 8" refX="6.4" refY="4"
                markerWidth="6.5" markerHeight="6.5" orient="auto"
              >
                <path d="M0,0.8 L7,4 L0,7.2 Z" fill="var(--text)" />
              </marker>
            </defs>

            {/* ---- the two events that fire the hooks, with no user involved */}
            {[
              { x: 566, w: 148, label: 'session start', cx: 640 },
              { x: 726, w: 154, label: 'session end', cx: 803 },
            ].map((c) => (
              <g key={c.label}>
                <rect
                  x={c.x} y={8} width={c.w} height={24} rx={12}
                  fill="var(--bg-sunken)" stroke="var(--border)" strokeWidth={1}
                />
                <text
                  x={c.x + c.w / 2} y={20} textAnchor="middle" dominantBaseline="central"
                  fontSize={9.5} fontFamily={MONO} fill="var(--text-secondary)"
                >
                  {c.label}
                </text>
                <line
                  x1={c.cx} x2={c.cx} y1={32} y2={SURF_ROW_Y}
                  stroke="var(--text-tertiary)" strokeWidth={1.1} markerEnd="url(#surf-arrow)"
                />
              </g>
            ))}

            <text x={ROW_X} y={48} fontSize={9} fontWeight={600} letterSpacing="0.09em" fill="var(--text-faint)">
              SURFACES
            </text>

            {SURF_BOXES.map((b) => (
              <SurfaceBox key={b.title} {...b} y={SURF_ROW_Y} />
            ))}

            {/* ---- surfaces into services */}
            {SURF_BOXES.map((b) => (
              <line
                key={`d-${b.title}`}
                x1={b.x + b.w / 2} x2={b.x + b.w / 2}
                y1={SURF_ROW_Y + b.h} y2={SURF_SERVICES_Y}
                stroke="var(--text-tertiary)" strokeWidth={1.1} markerEnd="url(#surf-arrow)"
              />
            ))}

            {/* ---- shared domain services */}
            <rect
              x={ROW_X} y={SURF_SERVICES_Y} width={ROW_W} height={SURF_SERVICES_H} rx={5}
              fill="var(--bg-raised)" stroke="var(--border-strong)" strokeWidth={1.2}
            />
            <text
              x={ROW_X + 16} y={SURF_SERVICES_Y + 20}
              fontSize={9} fontWeight={600} letterSpacing="0.09em" fill="var(--text-tertiary)"
            >
              SHARED DOMAIN SERVICES
            </text>
            {SERVICES.map((s, i) => {
              const x = ROW_X + 16 + i * (svcW + svcGap)
              return (
                <g key={s.title}>
                  <rect
                    x={x} y={SURF_SERVICES_Y + 28} width={svcW} height={38} rx={4}
                    fill="var(--bg-sunken)" stroke="var(--border)" strokeWidth={1}
                  />
                  <text
                    x={x + svcW / 2} y={SURF_SERVICES_Y + 44} textAnchor="middle"
                    fontSize={9.5} fontFamily={MONO} fontWeight={600} fill="var(--text)"
                  >
                    {s.title}
                  </text>
                  <text
                    x={x + svcW / 2} y={SURF_SERVICES_Y + 58} textAnchor="middle"
                    fontSize={8.5} fill="var(--text-tertiary)"
                  >
                    {s.sub}
                  </text>
                </g>
              )
            })}
            <text
              x={ROW_X + 16} y={SURF_SERVICES_Y + 84} fontSize={9.5} fill="var(--text-secondary)"
            >
              One code path per operation. The three surfaces differ only in who calls it.
            </text>

            {/* ---- services into the API. The only heavy edge in the figure. */}
            <line
              x1={460} x2={460} y1={SURF_SERVICES_Y + SURF_SERVICES_H} y2={SURF_API_Y}
              stroke="var(--text)" strokeWidth={1.7} markerEnd="url(#surf-arrow-ink)"
            />
            <text x={472} y={SURF_API_Y - 16} fontSize={9.5} fontFamily={MONO} fill="var(--text)">
              HTTPS · one request per operation
            </text>

            {/* ---- the waist */}
            <rect
              x={ROW_X} y={SURF_API_Y} width={ROW_W} height={SURF_API_H} rx={5}
              fill="var(--accent-quiet)" stroke="var(--accent)" strokeWidth={1.6}
            />
            <text
              x={ROW_X + 16} y={SURF_API_Y + 22} fontSize={12.5} fontWeight={600} fill="var(--text)"
            >
              Notion Data API
            </text>
            <text
              x={ROW_X + ROW_W - 16} y={SURF_API_Y + 22} textAnchor="end"
              fontSize={9} fontWeight={600} letterSpacing="0.09em" fill="var(--accent-text)"
            >
              THE ONLY ROUTE TO THE DATA
            </text>
            {waist.map((c, i) => {
              const x = ROW_X + 16 + i * (waistW + waistGap)
              return (
                <g key={c.label}>
                  <rect
                    x={x} y={SURF_API_Y + 32} width={waistW} height={32} rx={4}
                    fill="var(--bg-raised)" stroke="var(--accent-line)" strokeWidth={1}
                  />
                  <text
                    x={x + waistW / 2} y={SURF_API_Y + 45} textAnchor="middle"
                    fontSize={8} letterSpacing="0.05em" fill="var(--text-faint)"
                  >
                    {c.label}
                  </text>
                  <text
                    x={x + waistW / 2} y={SURF_API_Y + 58} textAnchor="middle"
                    fontSize={9} fontFamily={MONO} fontWeight={600} fill="var(--text)"
                  >
                    {c.value}
                  </text>
                </g>
              )
            })}
            <text
              x={ROW_X + 16} y={SURF_API_Y + 86} fontSize={9.5} fill="var(--accent-text)"
            >
              Every question the three surfaces can ask has to be expressible here, one request at a time.
            </text>

            {/* ---- the five databases */}
            <text
              x={ROW_X} y={SURF_DB_Y - 10}
              fontSize={9} fontWeight={600} letterSpacing="0.09em" fill="var(--text-faint)"
            >
              THE VAULT — {n(dbs.length)} NOTION DATABASES
            </text>
            {dbs.map((db, i) => {
              const x = ROW_X + i * (dbW + gap)
              const cx = x + dbW / 2
              return (
                <g key={db.name}>
                  <line
                    x1={cx} x2={cx} y1={SURF_API_Y + SURF_API_H} y2={SURF_DB_Y}
                    stroke="var(--text-tertiary)" strokeWidth={1.1} markerEnd="url(#surf-arrow)"
                  />
                  <rect
                    x={x} y={SURF_DB_Y} width={dbW} height={SURF_DB_H} rx={5}
                    fill="var(--bg-sunken)" stroke="var(--border-strong)" strokeWidth={1.2}
                  />
                  <text
                    x={cx} y={SURF_DB_Y + 20} textAnchor="middle"
                    fontSize={11} fontWeight={560} fill="var(--text)"
                  >
                    {db.name}
                  </text>
                  <text
                    x={cx} y={SURF_DB_Y + 36} textAnchor="middle"
                    fontSize={8.5} fontFamily={MONO} fill="var(--text-tertiary)"
                  >
                    title: {db.title}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        <table className="sr-only">
          <caption>
            The four layers of Lore, from the surfaces an agent or operator touches down to the five
            Notion databases that hold the vault.
          </caption>
          <thead>
            <tr>
              <th scope="col">Layer</th>
              <th scope="col">Component</th>
              <th scope="col">What it is</th>
            </tr>
          </thead>
          <tbody>
            {SURF_BOXES.map((b) => (
              <tr key={b.title}>
                <th scope="row">Surface</th>
                <td>{b.title}</td>
                <td>{b.sub} — {b.lines.join(' ')}</td>
              </tr>
            ))}
            {SERVICES.map((s) => (
              <tr key={s.title}>
                <th scope="row">Shared domain services</th>
                <td>{s.title}</td>
                <td>{s.sub}</td>
              </tr>
            ))}
            {waist.map((c) => (
              <tr key={c.label}>
                <th scope="row">Notion Data API</th>
                <td>{c.label}</td>
                <td>{c.value}</td>
              </tr>
            ))}
            {dbs.map((db) => (
              <tr key={db.name}>
                <th scope="row">The vault</th>
                <td>{db.name}</td>
                <td>title property {db.title}, holding the {db.entity} rows</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Figure>
  )
}

/* ============================================================ 3. bitemporal */

/* One schematic fact on a 130-day window. The days the bands begin and end are
   arbitrary; every *distance* that matters is a measured median, drawn to the
   same scale as those arbitrary endpoints, so the reader can see how large the
   lag is relative to the life of a claim. The footer says which is which. */
const BT_VB_W = 900
const BT_X0 = 100
const BT_W = 770
const BT_MAX_DAY = 130
const btX = (day: number) => BT_X0 + (day / BT_MAX_DAY) * BT_W

const BT_VALID_Y = 104
const BT_TXN_Y = 176
const BT_BAND_H = 36
const BT_AXIS_Y = 248
const BT_CALLOUT_Y = 272
const BT_VB_H = 376

/**
 * Two time axes over one fact, and the window where they disagree.
 *
 * FACT carries both axes in Lore's own schema: Valid From and Valid Until are
 * when the claim was true of the world, Observed At and Invalidated At are when
 * the vault believed it. They are not the same interval and they do not end at
 * the same moment — a retraction is written when somebody notices, which is
 * after the thing stopped being true. Between those two moments the store will
 * answer one way if a query reads valid time and the other way if it reads
 * transaction time, for the same row, at the same instant.
 *
 * The width of that window is the measurement: a median of the retraction lag,
 * with the 95th percentile drawn as its own extension so the tail is visible
 * rather than described. Everything accented is inside that window.
 */
export function BitemporalDiagram() {
  const bt = exp.bitemporal
  if (!(bt && bt.facts > 0)) return null

  /* Schematic anchors. Only these two are invented; every other day on the
     drawing is one of them plus a measured lag. */
  const validFrom = 20
  const validUntil = 70

  const observedAt = validFrom + bt.observationLagMedian
  const invalidatedAt = validUntil + bt.lagDaysMedian
  const p95End = validUntil + bt.lagDaysP95
  const probe = validUntil + Math.round(bt.lagDaysMedian / 2)

  const points = [
    { label: 'Valid From', day: validFrom, why: 'schematic — the day the claim became true' },
    {
      label: 'Observed At',
      day: observedAt,
      why: `Valid From + ${n(bt.observationLagMedian)} days, the median observation lag`,
    },
    { label: 'Valid Until', day: validUntil, why: 'schematic — the day the claim stopped being true' },
    { label: 'as-of probe D', day: probe, why: 'a read issued inside the lag' },
    {
      label: 'Invalidated At',
      day: invalidatedAt,
      why: `Valid Until + ${n(bt.lagDaysMedian)} days, the median retraction lag`,
    },
    {
      label: 'p95 retraction',
      day: p95End,
      why: `Valid Until + ${n(bt.lagDaysP95)} days, the 95th percentile`,
    },
  ]

  const probeText = bt.disagreements
    .map((d) => `${n(d.rowsWhereAxesDisagree)} as of day ${n(d.day)} (${pct(d.share)})`)
    .join(', ')

  const ticks = [0, 20, 40, 60, 80, 100, 120]

  return (
    <Figure
      full
      title="Two time axes, one fact"
      meta={
        <>
          retraction lag · median {n(bt.lagDaysMedian)} d · p95 {n(bt.lagDaysP95)} d
        </>
      }
      caption={
        <>
          Probed against the whole vault, the two axes disagree on {probeText} — out of{' '}
          {n(bt.facts)} facts carrying a validity interval, of which {n(bt.closedIntervals)} have
          been closed and {n(bt.retractionsLaggingReality)} of those (
          {pct(bt.retractionsLaggingReality / bt.closedIntervals)}) were retracted only after the
          claim had already stopped being true. {bt.note}
        </>
      }
      foot={
        <>
          Both bands are half-open: <span className="mono">[start, end)</span>. The days the bands
          begin and end are schematic; every hatched distance is measured — the observation lag is
          the median {n(bt.observationLagMedian)} days between a claim becoming true and being
          written down, and the retraction lag is the median {n(bt.lagDaysMedian)} days between it
          ceasing to be true and being invalidated, extended to the {n(bt.lagDaysP95)}-day 95th
          percentile. Highlighted: the window where a read gets a different answer depending on
          which axis it was written against. Lore stores both; a query has to mean one.
        </>
      }
    >
      <div className="dia">
        <div style={SCROLL}>
          <svg
            viewBox={`0 0 ${BT_VB_W} ${BT_VB_H}`}
            width="100%"
            style={{ ...SVG_STYLE, minWidth: 560 }}
            role="img"
            aria-label={
              `Two horizontal bands on a shared day axis. The valid-time band runs from day ` +
              `${n(validFrom)} to day ${n(validUntil)}; the transaction-time band runs from day ` +
              `${n(observedAt)} to day ${n(invalidatedAt)}, starting ` +
              `${n(bt.observationLagMedian)} days after the claim became true and ending ` +
              `${n(bt.lagDaysMedian)} days after it stopped being true, with the 95th percentile ` +
              `reaching day ${n(p95End)}. A probe at day ${n(probe)} falls between the two ends: ` +
              'valid time says the claim is already false, transaction time says it is still on ' +
              'record. The values are listed in the table that follows.'
            }
          >
            <title>Valid time and transaction time over one fact, and the lag between them</title>

            <defs>
              {/* Hatch, not tint: the lag has to read as a lag in greyscale and
                  on paper, where the accent token resolves to black. */}
              <pattern
                id="bt-lag" width="6" height="6" patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--accent-line)" strokeWidth="2" />
              </pattern>
              <pattern
                id="bt-tail" width="7" height="7" patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <line x1="0" y1="0" x2="0" y2="7" stroke="var(--data-grid)" strokeWidth="2.5" />
              </pattern>
            </defs>

            {/* ---- the p95 tail, drawn behind the median window */}
            <rect
              x={btX(invalidatedAt)} y={96} width={btX(p95End) - btX(invalidatedAt)} height={124}
              fill="url(#bt-tail)" stroke="var(--border-strong)" strokeWidth={1}
              strokeDasharray="3 3"
            />
            <text
              x={(btX(invalidatedAt) + btX(p95End)) / 2} y={234} textAnchor="middle"
              fontSize={9} fontFamily={MONO} fill="var(--text-tertiary)"
            >
              p95 {n(bt.lagDaysP95)} d
            </text>

            {/* ---- the window the figure exists for */}
            <rect
              x={btX(validUntil)} y={96} width={btX(invalidatedAt) - btX(validUntil)} height={124}
              fill="url(#bt-lag)" stroke="var(--accent)" strokeWidth={1.2}
            />
            <path
              d={`M${btX(validUntil)},92 V86 H${btX(invalidatedAt)} V92`}
              fill="none" stroke="var(--accent)" strokeWidth={1.2}
            />
            <text
              x={(btX(validUntil) + btX(invalidatedAt)) / 2} y={78} textAnchor="middle"
              fontSize={9.5} fontFamily={MONO} fontWeight={600} fill="var(--accent-text)"
            >
              retraction lag · median {n(bt.lagDaysMedian)} d
            </text>

            {/* ---- valid time */}
            <text
              x={BT_X0 - 16} y={BT_VALID_Y + 16} textAnchor="end"
              fontSize={11} fontWeight={560} fill="var(--text)"
            >
              valid time
            </text>
            <text
              x={BT_X0 - 16} y={BT_VALID_Y + 30} textAnchor="end"
              fontSize={8.5} fill="var(--text-tertiary)"
            >
              of the world
            </text>
            <rect
              x={btX(validFrom)} y={BT_VALID_Y} width={btX(validUntil) - btX(validFrom)}
              height={BT_BAND_H} rx={3}
              fill="var(--bg-sunken)" stroke="var(--border-strong)" strokeWidth={1.3}
            />
            <rect
              x={btX(validFrom)} y={BT_VALID_Y} width={btX(validUntil) - btX(validFrom)} height={4}
              fill="var(--data-3)"
            />
            <text x={btX(validFrom) + 12} y={BT_VALID_Y + 20} fontSize={10} fontWeight={560} fill="var(--text)">
              believed true of the world
            </text>
            <text
              x={btX(validFrom) + 12} y={BT_VALID_Y + 32}
              fontSize={8.5} fontFamily={MONO} fill="var(--text-secondary)"
            >
              [Valid From, Valid Until)
            </text>
            <text x={btX(validFrom)} y={96} textAnchor="middle" fontSize={8.5} fill="var(--text-tertiary)">
              Valid From
            </text>
            {/* Right-aligned rather than centred: the lag bracket has a leg on
                this exact abscissa, and a centred label would sit on it. */}
            <text x={btX(validUntil) - 6} y={96} textAnchor="end" fontSize={8.5} fill="var(--text-tertiary)">
              Valid Until
            </text>

            {/* ---- observation lag, between the two bands where there is room */}
            <path
              d={`M${btX(validFrom)},146 V152 H${btX(observedAt)} V146`}
              fill="none" stroke="var(--text-tertiary)" strokeWidth={1}
            />
            <text
              x={(btX(validFrom) + btX(observedAt)) / 2} y={166} textAnchor="middle"
              fontSize={9} fontFamily={MONO} fill="var(--text-tertiary)"
            >
              observation lag · median {n(bt.observationLagMedian)} d
            </text>

            {/* ---- transaction time. Dashed, so the two bands differ in shape
                    and not only in the colour of their top rule. */}
            <text
              x={BT_X0 - 16} y={BT_TXN_Y + 16} textAnchor="end"
              fontSize={11} fontWeight={560} fill="var(--text)"
            >
              transaction time
            </text>
            <text
              x={BT_X0 - 16} y={BT_TXN_Y + 30} textAnchor="end"
              fontSize={8.5} fill="var(--text-tertiary)"
            >
              of the vault
            </text>
            <rect
              x={btX(observedAt)} y={BT_TXN_Y} width={btX(invalidatedAt) - btX(observedAt)}
              height={BT_BAND_H} rx={3}
              fill="var(--bg-sunken)" stroke="var(--border-strong)" strokeWidth={1.3}
              strokeDasharray="5 3"
            />
            <rect
              x={btX(observedAt)} y={BT_TXN_Y} width={btX(invalidatedAt) - btX(observedAt)} height={4}
              fill="var(--data-1)"
            />
            <text x={btX(observedAt) + 12} y={BT_TXN_Y + 20} fontSize={10} fontWeight={560} fill="var(--text)">
              on record in the vault
            </text>
            <text
              x={btX(observedAt) + 12} y={BT_TXN_Y + 32}
              fontSize={8.5} fontFamily={MONO} fill="var(--text-secondary)"
            >
              [Observed At, Invalidated At)
            </text>
            <text x={btX(observedAt)} y={BT_TXN_Y + 50} textAnchor="middle" fontSize={8.5} fill="var(--text-tertiary)">
              Observed At
            </text>
            <text x={btX(invalidatedAt)} y={BT_TXN_Y + 50} textAnchor="middle" fontSize={8.5} fill="var(--text-tertiary)">
              Invalidated At
            </text>

            {/* ---- the day axis */}
            <line x1={BT_X0} x2={btX(BT_MAX_DAY)} y1={BT_AXIS_Y} y2={BT_AXIS_Y}
              stroke="var(--border-strong)" strokeWidth={1} />
            {ticks.map((t) => (
              <g key={t}>
                <line x1={btX(t)} x2={btX(t)} y1={BT_AXIS_Y} y2={BT_AXIS_Y + 4}
                  stroke="var(--border-strong)" strokeWidth={1} />
                <text
                  x={btX(t)} y={BT_AXIS_Y + 16} textAnchor="middle"
                  fontSize={9} fontFamily={MONO} fill="var(--text-tertiary)"
                >
                  {t}
                </text>
              </g>
            ))}
            <text x={BT_X0 - 16} y={BT_AXIS_Y + 4} textAnchor="end" fontSize={9} fill="var(--text-faint)">
              days
            </text>

            {/* ---- the probe. One vertical read, two different answers. It
                    starts at the top of the hatched window rather than above it,
                    so it does not strike through the lag label. */}
            <line
              x1={btX(probe)} x2={btX(probe)} y1={96} y2={BT_CALLOUT_Y}
              stroke="var(--accent)" strokeWidth={1.6} strokeDasharray="5 3"
            />
            <path
              d={`M${btX(probe) - 5},${BT_AXIS_Y} L${btX(probe)},${BT_AXIS_Y - 5} L${btX(probe) + 5},${BT_AXIS_Y} L${btX(probe)},${BT_AXIS_Y + 5} Z`}
              fill="var(--accent)"
            />

            <rect
              x={300} y={BT_CALLOUT_Y} width={570} height={84} rx={5}
              fill="var(--bg-raised)" stroke="var(--accent)" strokeWidth={1.3}
            />
            <text x={316} y={BT_CALLOUT_Y + 20} fontSize={10.5} fontWeight={600} fill="var(--accent-text)">
              as of day {n(probe)} — a read issued inside the lag
            </text>
            <text x={316} y={BT_CALLOUT_Y + 38} fontSize={9.5} fill="var(--text-secondary)">
              valid time says: already false — Valid Until has passed
            </text>
            <text x={316} y={BT_CALLOUT_Y + 54} fontSize={9.5} fill="var(--text-secondary)">
              transaction time says: still on record — Invalidated At has not
            </text>
            <text x={316} y={BT_CALLOUT_Y + 72} fontSize={9.5} fontWeight={560} fill="var(--text)">
              One row, two answers. A read has to declare which axis it means.
            </text>
          </svg>
        </div>

        <table className="sr-only">
          <caption>
            The six points drawn on the two axes, and where each day comes from. Only the two
            schematic anchors are invented; the rest are measured lags added to them.
          </caption>
          <thead>
            <tr>
              <th scope="col">Point</th>
              <th scope="col" className="n">Day</th>
              <th scope="col">Where the number comes from</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.label}>
                <th scope="row">{p.label}</th>
                <td className="n">{n(p.day)}</td>
                <td>{p.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Figure>
  )
}

/* ==================================================== 4. normalization ladder */

/**
 * The walk from the vault's shape to the target schema, one rung per step.
 *
 * HTML rather than SVG, because the rungs are mostly prose: text in an SVG is
 * unselectable, unsearchable, and renders at whatever size the viewBox scale
 * happens to produce. The only drawn marks are the rail and its arrowhead.
 *
 * The emphasis is the argument. A database course reads this ladder as a
 * sequence of definitions and stops; this paper needs the other column — which
 * of these violations is still in the shipped product. That is what carries the
 * accent, the tag and the citation, because §5 is not a normalisation exercise,
 * it is a claim about a released system. Four of the five surviving rungs
 * survive for a reason the substrate imposes, and Lore says so itself; the
 * citations are printed so a reader can check rather than take our word.
 */
export function NormalizationLadder({
  steps = schema.normalization,
}: { steps?: NormalizationStep[] }) {
  /* A capture written before the normalisation walk existed carries no steps,
     and an empty ladder is a heading over nothing. */
  if (steps.length === 0) return null

  const shipping = steps.filter((s) => s.survives).length

  return (
    <Figure
      full
      title="Normalisation ladder"
      meta={
        <>
          {n(steps.length)} rungs · {n(shipping)} still shipping in {schema.source.version}
        </>
      }
      caption={
        <>
          Every violation on this ladder was read from Lore&#39;s own schema at commit{' '}
          <span className="mono">{schema.source.commit}</span>, not invented for the exercise, and{' '}
          {n(shipping)} of the {n(steps.length)} rungs are tagged SHIPPING because they are still
          there. That is the finding of Section 5: these are not oversights waiting on a patch, they
          are what the substrate costs, and the last rung is the only place the anomalies actually
          stop.
        </>
      }
      foot={
        <>
          Each rung names the form the relation is <em>already</em> in, the rule the next form
          imposes, the anomaly that survives until you climb, and the one-line fix. The tag marks a
          rung whose violation is present in the released product; where Lore explains why, the
          explanation and the file it was read from are printed beneath. Read the tagged rungs alone
          and you have the section: an agent memory store on this substrate does not merely denormalise
          for speed, it denormalises because the store has no other shape to offer.
        </>
      }
    >
      <div className="dia dia-tall">
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {steps.map((step, i) => {
            const terminal = step.violation === null && step.anomaly === null
            const last = i === steps.length - 1
            const open = step.relation.indexOf('(')
            const relName = open > 0 ? step.relation.slice(0, open) : step.relation
            const relAttrs = open > 0 ? step.relation.slice(open) : ''

            return (
              <li
                /* Forms repeat — there are two UNF rungs — so the index is part
                   of the key or React collapses them. */
                key={`${step.form}-${i}`}
                className="dia-node"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '56px minmax(0, 1fr)',
                  gap: '0.875rem',
                  marginBottom: last ? 0 : '1.25rem',
                }}
              >
                <div style={{ position: 'relative' }}>
                  {/* The terminal rung inverts rather than recolouring, so the end
                      of the ladder survives greyscale and print. */}
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 52,
                      height: 24,
                      borderRadius: 4,
                      border: `1px solid ${terminal ? 'var(--text)' : 'var(--border-strong)'}`,
                      background: terminal ? 'var(--text)' : 'var(--bg-sunken)',
                      color: terminal ? 'var(--bg-raised)' : 'var(--text)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                    }}
                  >
                    {step.form}
                  </span>
                  {/* The rail is positioned against the bottom of this column,
                      which is only where it looks in the two-column layout. Print
                      flattens grids inside a diagram so the figure can paginate,
                      leaving this column the height of the badge alone — and a
                      rail measured from its bottom would land on the relation
                      name. Print gets the badges in sequence instead, which reads
                      as a ladder without the ink. */}
                  {!last && (
                    <span className="no-print" aria-hidden="true">
                      <span
                        style={{
                          position: 'absolute', left: 26, top: 30, bottom: -14,
                          width: 0, borderLeft: '1px solid var(--border)',
                        }}
                      />
                      <span
                        style={{
                          position: 'absolute', left: 23, bottom: -14, width: 6, height: 6,
                          borderRight: '1px solid var(--text-tertiary)',
                          borderBottom: '1px solid var(--text-tertiary)',
                          transform: 'rotate(45deg)',
                        }}
                      />
                    </span>
                  )}
                </div>

                <div style={{ minWidth: 0, paddingBottom: last ? 0 : '0.25rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      flexWrap: 'wrap',
                      marginBottom: '0.375rem',
                    }}
                  >
                    <span className="label" style={{ color: 'var(--text-faint)' }}>
                      {terminal ? 'the schema the reimplementation runs' : `already in ${step.form}`}
                    </span>
                    {step.survives ? (
                      <span className="pill pill-accent" style={{ fontWeight: 600, letterSpacing: '0.06em' }}>
                        <span
                          aria-hidden="true"
                          style={{
                            width: 6, height: 6, borderRadius: 1,
                            background: 'currentColor', flex: '0 0 auto',
                          }}
                        />
                        SHIPPING
                      </span>
                    ) : terminal ? (
                      <span className="pill pill-ok">terminal form</span>
                    ) : null}
                  </div>

                  <div
                    style={{
                      background: 'var(--bg-sunken)',
                      border: '1px solid var(--border-faint)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.4375rem 0.625rem',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>{relName}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{relAttrs}</span>
                  </div>

                  <p className="label" style={{ margin: '0.5rem 0 0', color: 'var(--text-tertiary)' }}>
                    {step.rule}
                  </p>

                  {step.violation && (
                    <p className="label" style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)' }}>
                      <span style={{ color: 'var(--text-faint)' }}>violates </span>
                      {step.violation}
                    </p>
                  )}

                  {step.anomaly ? (
                    <div
                      style={{
                        marginTop: '0.625rem',
                        borderLeft: '2px solid var(--border-strong)',
                        background: 'var(--bg-sunken)',
                        borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                        padding: '0.5rem 0.75rem 0.5625rem',
                      }}
                    >
                      <span
                        className="meta"
                        style={{
                          display: 'block',
                          letterSpacing: '0.07em',
                          textTransform: 'uppercase',
                          marginBottom: '0.1875rem',
                        }}
                      >
                        anomaly it leaves behind
                      </span>
                      <span style={{ fontSize: '0.9375rem', lineHeight: 1.5, color: 'var(--text)' }}>
                        {step.anomaly}
                      </span>
                    </div>
                  ) : (
                    <p style={{ margin: '0.625rem 0 0', fontSize: '0.9375rem', lineHeight: 1.5 }}>
                      No anomaly is left to remove: every repeating group is a relation, every
                      derivation is an index or a view, and every determinant is a candidate key.
                    </p>
                  )}

                  {!terminal && (
                    <p className="label" style={{ margin: '0.5rem 0 0', color: 'var(--text-secondary)' }}>
                      <span className="mono" style={{ color: 'var(--text-faint)' }}>{'→ '}</span>
                      {step.fix}
                    </p>
                  )}
                  {terminal && (
                    <p className="meta" style={{ margin: '0.5rem 0 0' }}>{step.fix}</p>
                  )}

                  {/* The whole argument of §5 lives in these two lines, so they get
                      the accent — and the citation beneath them so it can be
                      checked rather than believed. */}
                  {step.survives && step.surviveNote && (
                    <div
                      style={{
                        marginTop: '0.625rem',
                        borderLeft: '2px solid var(--accent)',
                        background: 'var(--accent-quiet)',
                        borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                        padding: '0.5rem 0.75rem 0.5625rem',
                      }}
                    >
                      <span
                        className="meta"
                        style={{
                          display: 'block',
                          color: 'var(--accent-text)',
                          letterSpacing: '0.07em',
                          textTransform: 'uppercase',
                          marginBottom: '0.1875rem',
                        }}
                      >
                        still shipping because
                      </span>
                      <span style={{ fontSize: '0.9375rem', lineHeight: 1.5, color: 'var(--text)' }}>
                        {step.surviveNote}
                      </span>
                    </div>
                  )}

                  {step.citation && (
                    <p className="meta" style={{ margin: '0.4375rem 0 0', overflowWrap: 'anywhere' }}>
                      <span style={{ color: 'var(--text-faint)' }}>read in </span>
                      {step.citation}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </Figure>
  )
}

/* ==================================================== 5. constraint comparison */

/* The same rule the prose counts with, so the tag on a rung and the sentence in
   the text can never disagree about how many invariants have nothing behind
   them. */
const UNENFORCED = new Set(unenforcedInvariants.map((i) => i.id))

/** An arrow between two lanes, broken when nothing bridges them. The break is a
 *  shape — a gap and a cross — so it survives greyscale and print. */
function Flow({ broken }: { broken?: boolean }) {
  const tone = broken ? 'var(--accent)' : 'var(--text-tertiary)'
  return (
    <svg
      width="18" height="10" viewBox="0 0 18 10" aria-hidden="true"
      style={{ flex: '0 0 auto', display: 'block' }}
    >
      <path
        d={broken ? 'M0,5 H4 M13,5 H14' : 'M0,5 H14'}
        stroke={tone} strokeWidth={1.2} fill="none"
      />
      <path
        d="M12,2 L15.5,5 L12,8"
        stroke={tone} strokeWidth={1.2} fill="none"
        strokeLinecap="round" strokeLinejoin="round"
      />
      {broken && (
        <path d="M6,1.5 L11,8.5 M11,1.5 L6,8.5" stroke={tone} strokeWidth={1.3} strokeLinecap="round" />
      )}
    </svg>
  )
}

function Lane({
  kicker, flow, tone, children,
}: {
  kicker: string
  flow?: 'plain' | 'broken'
  tone?: string
  children: ReactNode
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.3125rem',
        }}
      >
        {flow ? <Flow broken={flow === 'broken'} /> : null}
        <span
          className="meta"
          style={{
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: tone ?? 'var(--text-faint)',
          }}
        >
          {kicker}
        </span>
      </div>
      {children}
    </div>
  )
}

/**
 * What would enforce each invariant, what actually does, and what breaks.
 *
 * A ladder rather than a table, because the interesting thing is not the three
 * cells but the gap between the first two: the declarative form exists, it is
 * one line of DDL, and on this substrate there is nothing to declare it to. The
 * arrow between the lanes carries that — unbroken where an application-level
 * guard stands in, crossed through where nothing does — so the shape of the
 * figure is the count, and a reader can find the unenforced invariants without
 * reading a word.
 *
 * The evidence table in §6 measures what happens to the crossed ones. This
 * figure only says which they are, and it takes the marking from the same
 * selector the prose counts with, so the two cannot drift.
 */
export function ConstraintDiagram({
  invariants = schema.invariants,
}: { invariants?: Invariant[] }) {
  if (invariants.length === 0) return null

  const bare = invariants.filter((i) => UNENFORCED.has(i.id))
  const nothing = bare.filter((i) => i.enforcedBy.startsWith('nothing')).length

  return (
    <Figure
      full
      title="What would enforce it, what does, what breaks"
      meta={
        <>
          {n(invariants.length)} invariants · {n(bare.length)} with nothing declarative behind them
        </>
      }
      caption={
        <>
          Each of these is one line of standard DDL on any relational engine. On the Notion
          substrate {n(bare.length)} of {n(invariants.length)} have no declarative enforcement at
          all — {n(nothing)} of them are guarded by nothing whatsoever and are found after the fact
          by a scan, and the rest survive only as application-level convention that a concurrent
          write, an archived page or a hand edit in the Notion UI walks straight through.
        </>
      }
      foot={
        <>
          The arrow between the first two lanes is the figure: unbroken where something in Lore
          stands in for the constraint, crossed through where nothing does. A crossed arrow does not
          mean the invariant is unimportant — it means the store will accept a row that violates it
          and no one will know until a scan is run, which is precisely the class of failure §6
          measures. The declarative column is what the SQLite and PostgreSQL arms actually execute;
          PostgreSQL is the only one of the three engines that can express all of it.
        </>
      }
    >
      <div className="dia dia-tall dia-keep-grid">
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '1rem' }}>
          {invariants.map((inv) => {
            const isNothing = inv.enforcedBy.startsWith('nothing')
            const isUnknown = UNENFORCED.has(inv.id) && !isNothing
            const marked = isNothing || isUnknown

            return (
              <li
                key={inv.id}
                className="dia-node"
                style={{
                  border: '1px solid var(--border)',
                  borderLeft: `3px solid ${marked ? 'var(--accent)' : 'var(--border-strong)'}`,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-raised)',
                  padding: '0.75rem 0.875rem 0.875rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '0.625rem',
                    flexWrap: 'wrap',
                    marginBottom: '0.75rem',
                  }}
                >
                  <span
                    className="mono"
                    style={{
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      padding: '0.125rem 0.375rem',
                      borderRadius: 3,
                      border: '1px solid var(--border-strong)',
                      background: 'var(--bg-sunken)',
                      flex: '0 0 auto',
                    }}
                  >
                    {inv.id}
                  </span>
                  <span style={{ fontSize: '0.9375rem', lineHeight: 1.45, fontWeight: 540, minWidth: 0 }}>
                    {inv.statement}
                  </span>
                  {isNothing && (
                    <span className="pill pill-accent" style={{ fontWeight: 600, letterSpacing: '0.05em' }}>
                      NOTHING ENFORCES THIS
                    </span>
                  )}
                  {isUnknown && (
                    <span className="pill pill-accent" style={{ fontWeight: 600, letterSpacing: '0.05em' }}>
                      NOT VERIFIABLE
                    </span>
                  )}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                    gap: '0.875rem',
                    alignItems: 'start',
                  }}
                >
                  <Lane kicker="would enforce it">
                    <code
                      style={{
                        display: 'block',
                        fontSize: '0.6875rem',
                        lineHeight: 1.55,
                        padding: '0.4375rem 0.5625rem',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-sunken)',
                        border: '1px solid var(--border-faint)',
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {inv.declarative}
                    </code>
                  </Lane>

                  <Lane
                    kicker="enforces it in Lore"
                    flow={marked ? 'broken' : 'plain'}
                    tone={marked ? 'var(--accent-text)' : undefined}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.8125rem',
                        lineHeight: 1.5,
                        color: marked ? 'var(--text)' : 'var(--text-secondary)',
                        fontWeight: marked ? 540 : 400,
                      }}
                    >
                      {inv.enforcedBy}
                    </p>
                  </Lane>

                  <Lane kicker="what breaks" flow="plain">
                    <p
                      style={{
                        margin: 0, fontSize: '0.8125rem', lineHeight: 1.5,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {inv.breaks}
                    </p>
                    {inv.admitted && (
                      <p
                        className="meta"
                        style={{
                          margin: '0.375rem 0 0',
                          paddingLeft: '0.5rem',
                          borderLeft: '2px solid var(--border)',
                          whiteSpace: 'normal',
                        }}
                      >
                        {inv.admitted}
                      </p>
                    )}
                  </Lane>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </Figure>
  )
}
