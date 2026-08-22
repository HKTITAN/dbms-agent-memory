/**
 * What is inside the download.
 *
 * `capture.json` is offered on every page of this site, and until now it was
 * offered blind: a 547 kB file named "the dataset" and nothing else. A reader
 * deciding whether to take it had to take it first.
 *
 * This measures the file at render time rather than describing it. Every byte
 * figure here is `JSON.stringify(value).length` computed against the same import
 * the rest of the paper reads, so the map cannot drift from the thing it maps —
 * add a section to the capture and it appears here without anyone editing this
 * file, and the proportions stay true because nothing is typed by hand.
 *
 * The treemap is squarified rather than sliced. With one section holding 78% of
 * the file and eleven holding under half a percent each, slice-and-dice would
 * render the tail as eleven hairlines; squarified keeps the small rectangles
 * close to square and therefore still legible and still clickable-sized.
 */

import { capture, n, bytes } from '@/lib/data'
import { Figure } from './charts'

/* ---------------------------------------------------------------- grouping
   Three kinds of content, and the colour says which. This is the one place in
   the paper where a section's colour is not its family — it is its role, and
   the legend names all three, so colour is never the only signal. */

type Role = 'measured' | 'model' | 'provenance'

const ROLE: Record<string, Role> = {
  rows: 'measured',
  byArm: 'measured',
  byArmClass: 'measured',
  amplification: 'measured',
  expressibility: 'measured',
  experiments: 'measured',

  schema: 'model',
  plans: 'model',
  workload: 'model',
  arms: 'model',
  families: 'model',

  capturedAt: 'provenance',
  durationMs: 'provenance',
  runs: 'provenance',
  machine: 'provenance',
  toolchain: 'provenance',
  subject: 'provenance',
  apiLimits: 'provenance',
  vault: 'provenance',
  vaultMeta: 'provenance',
  injected: 'provenance',
}

const ROLE_STYLE: Record<Role, { fill: string; lip: string; ink: string; label: string; what: string }> = {
  measured: {
    fill: 'var(--accent-quiet)',
    lip: 'var(--accent-line)',
    ink: 'var(--accent-text)',
    label: 'Measured',
    what: 'every number the paper reports',
  },
  model: {
    fill: 'var(--substrate-tint)',
    lip: 'var(--substrate-lip)',
    ink: 'var(--substrate-ink)',
    label: 'The model',
    what: 'the schema, the workload, the query plans',
  },
  provenance: {
    fill: 'var(--bg-inset)',
    lip: 'var(--border-strong)',
    ink: 'var(--text-secondary)',
    label: 'Provenance',
    what: 'what was run, on what, against which commit',
  },
}

/** One sentence per section, because a key name is not a description. */
const WHAT: Record<string, string> = {
  rows: 'One record per question per arm. 361 × 5.',
  plans: 'Planner output for the four SQL arms.',
  schema: 'Entities, relationships, FDs, invariants, DDL.',
  injected: 'The defects planted in the vault, by id.',
  byArmClass: 'The aggregates, split by arm and class.',
  experiments: 'The thirteen side experiments.',
  workload: 'The ten question classes and their algebra.',
  amplification: 'Notion cost against SQL, per class.',
  arms: 'The five stores that were measured.',
  byArm: 'The aggregates, per arm.',
  subject: "Lore's repo, licence, databases, surfaces.",
  vault: 'Row counts of the generated vault.',
  apiLimits: 'The documented Notion limits, with sources.',
  families: 'The three system families.',
  expressibility: 'How much of the workload Notion can express.',
  machine: 'The host the benchmark ran on.',
  toolchain: 'Node, PGlite, SQLite and the harness commit.',
  vaultMeta: 'Seed, scale and span of the generator.',
  capturedAt: 'When the run finished.',
  durationMs: 'How long it took.',
  runs: 'Repeats each timing was averaged over.',
}

/* -------------------------------------------------------------- treemap
   Bruls, Huizing and van Wijk's squarified layout. The published algorithm,
   not an approximation of it: lay a row along the shorter side, keep adding
   while the worst aspect ratio in the row improves, and commit the row the
   moment adding would make it worse. */

type Cell = { key: string; value: number; x: number; y: number; w: number; h: number }

function worst(row: number[], side: number, scale: number): number {
  const sum = row.reduce((a, b) => a + b, 0) * scale
  const max = Math.max(...row) * scale
  const min = Math.min(...row) * scale
  const s2 = sum * sum
  const w2 = side * side
  return Math.max((w2 * max) / s2, s2 / (w2 * min))
}

function squarify(values: { key: string; value: number }[], W: number, H: number): Cell[] {
  const total = values.reduce((a, b) => a + b.value, 0)
  if (total <= 0) return []
  const scale = (W * H) / total

  const out: Cell[] = []
  let x = 0
  let y = 0
  let w = W
  let h = H
  let i = 0
  let row: { key: string; value: number }[] = []

  const layRow = () => {
    const side = Math.min(w, h)
    const area = row.reduce((a, b) => a + b.value, 0) * scale
    const thickness = area / side
    let off = 0
    for (const item of row) {
      const len = (item.value * scale) / thickness
      out.push(
        side === h
          ? { key: item.key, value: item.value, x, y: y + off, w: thickness, h: len }
          : { key: item.key, value: item.value, x: x + off, y, w: len, h: thickness },
      )
      off += len
    }
    if (side === h) { x += thickness; w -= thickness } else { y += thickness; h -= thickness }
    row = []
  }

  while (i < values.length) {
    const side = Math.min(w, h)
    const next = values[i]
    const current = row.map((r) => r.value)
    const withNext = [...current, next.value]
    if (row.length === 0 || worst(withNext, side, scale) <= worst(current, side, scale)) {
      row.push(next)
      i += 1
    } else {
      layRow()
    }
  }
  if (row.length) layRow()
  return out
}

/* ------------------------------------------------------------------ figure */

const VB_W = 760
const VB_H = 300

export function DatasetMap() {
  /* Measured, not declared. `capture` is the same import every other figure in
     the paper reads, so this is the real file. */
  const sections = Object.entries(capture as unknown as Record<string, unknown>)
    .map(([key, value]) => ({ key, value: JSON.stringify(value).length }))
    .sort((a, b) => b.value - a.value)

  const total = sections.reduce((s, x) => s + x.value, 0)
  const cells = squarify(sections, VB_W, VB_H)

  const rows = capture.rows.length
  const arms = capture.arms.length
  const questions = Math.round(rows / arms)
  const fields = Object.keys(capture.rows[0] ?? {}).length

  const roleTotals = (['measured', 'model', 'provenance'] as Role[]).map((r) => ({
    role: r,
    bytes: sections.filter((s) => ROLE[s.key] === r).reduce((a, b) => a + b.value, 0),
    count: sections.filter((s) => ROLE[s.key] === r).length,
  }))

  return (
    <Figure
      full
      title="The dataset, by weight"
      meta={<>{bytes(total)} · {sections.length} sections</>}
      caption={
        <>
          Every rectangle is one top-level key of <span className="mono">capture.json</span>, drawn at
          its true share of the file. The areas are measured at render time from the same import the
          rest of this paper reads, so the map cannot describe a file the download does not have.
          One section is most of it: <span className="mono">rows</span> holds{' '}
          {n(rows)} records — {n(questions)} questions against {arms} arms, fully crossed, {fields} fields
          each — and everything the paper claims is a reduction of that one table.
        </>
      }
      foot={
        <>
          Colour is role, not family: <strong>measured</strong> is what the harness observed,{' '}
          <strong>the model</strong> is what it was told, and <strong>provenance</strong> is what it
          ran on. Rectangles smaller than a label are named in the table below rather than on the map.
        </>
      }
    >
      <div style={{ overflowX: 'auto', overscrollBehaviorX: 'contain' }}>
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          width="100%"
          style={{ display: 'block', minWidth: 520, fontVariantNumeric: 'tabular-nums' }}
          role="img"
          aria-label={
            `A treemap of capture.json, ${bytes(total)} across ${sections.length} sections. `
            + `The rows section dominates at ${((sections[0].value / total) * 100).toFixed(0)} per cent, `
            + `holding ${rows} measurement records. The full breakdown is in the table that follows.`
          }
        >
          <title>capture.json by section, sized by bytes</title>

          {/* One clip per rectangle. The label gates below are arithmetic on an
              estimated advance width, and arithmetic on an estimate is exactly
              the kind of thing that leaks three characters of a byte figure out
              of a 9px cell and into the margin. The clip makes it impossible
              rather than unlikely. */}
          <defs>
            {cells.map((c) => (
              <clipPath key={`clip-${c.key}`} id={`dsm-${c.key}`}>
                <rect x={c.x} y={c.y} width={Math.max(0, c.w)} height={Math.max(0, c.h)} />
              </clipPath>
            ))}
          </defs>

          {cells.map((c) => {
            const role = ROLE[c.key] ?? 'provenance'
            const st = ROLE_STYLE[role]
            const share = c.value / total
            /* A label only goes on the map when the rectangle can actually hold
               it. Everything else is named in the fallback table, which is a
               better place for it than a leader line into a 6px box. */
            /* Estimated at the mono face's advance width rather than a flat
               threshold: `experiments` is eleven characters and overflowed a box
               that `arms` fits inside twice. */
            const named = c.w > c.key.length * 7.1 + 20 && c.h > 30
            const sized = named && c.w > 96 && c.h > 46
            const detailed = sized && c.w > 200 && c.h > 90 && WHAT[c.key]
            return (
              <g key={c.key} clipPath={`url(#dsm-${c.key})`}>
                <rect
                  x={c.x + 0.75} y={c.y + 0.75}
                  width={Math.max(0, c.w - 1.5)} height={Math.max(0, c.h - 1.5)}
                  rx={c.w > 30 && c.h > 30 ? 8 : 3}
                  fill={st.fill}
                  stroke={st.lip}
                  strokeWidth={1.5}
                />
                {named && (
                  <text
                    x={c.x + 10} y={c.y + 20}
                    fontSize={12} fontWeight={800} fill={st.ink}
                    fontFamily="var(--font-mono)"
                  >
                    {c.key}
                  </text>
                )}
                {sized && (
                  <text
                    x={c.x + 10} y={c.y + 37}
                    fontSize={11} fill={st.ink} opacity={0.85}
                  >
                    {bytes(c.value)} · {(share * 100).toFixed(share < 1 ? 1 : 0)}%
                  </text>
                )}
                {/* A rectangle this size can say what it holds. Leaving 78% of
                    the figure as an empty green field wastes the one place with
                    room for the sentence. */}
                {detailed && (
                  <text x={c.x + 10} y={c.y + 58} fontSize={11.5} fill={st.ink} opacity={0.9}>
                    {WHAT[c.key]}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Legend. Named in words as well as colour, so the encoding survives
          greyscale and the printed edition. */}
      <ul
        style={{
          display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.25rem',
          listStyle: 'none', margin: '0.875rem 0 0', padding: 0,
        }}
      >
        {roleTotals.map(({ role, bytes: b, count }) => {
          const st = ROLE_STYLE[role]
          return (
            <li key={role} style={{ display: 'flex', alignItems: 'baseline', gap: '0.4375rem' }}>
              <span
                aria-hidden="true"
                style={{
                  width: 12, height: 12, flex: '0 0 auto', borderRadius: 4,
                  background: st.fill, border: `1.5px solid ${st.lip}`,
                  transform: 'translateY(1px)',
                }}
              />
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: st.ink }}>{st.label}</span>
              <span className="meta">{count} · {bytes(b)}</span>
            </li>
          )
        })}
      </ul>

      {/* A picture of a number is not the number. */}
      <table className="sr-only">
        <caption>Every section of capture.json, its size, its share of the file, and what it holds</caption>
        <thead>
          <tr><th scope="col">Section</th><th scope="col">Role</th><th scope="col" className="n">Bytes</th><th scope="col" className="n">Share</th><th scope="col">Holds</th></tr>
        </thead>
        <tbody>
          {sections.map((s) => (
            <tr key={s.key}>
              <th scope="row" className="mono">{s.key}</th>
              <td>{ROLE_STYLE[ROLE[s.key] ?? 'provenance'].label}</td>
              <td className="n">{n(s.value)}</td>
              <td className="n">{((s.value / total) * 100).toFixed(2)}%</td>
              <td className="wrap">{WHAT[s.key] ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Figure>
  )
}

/* --------------------------------------------------------------- the table
   The map answers "how big"; this answers "what is it". Separated because a
   reader scanning for one is not scanning for the other, and a treemap with
   twenty-one captions is a treemap nobody reads. */

export function DatasetSections() {
  const sections = Object.entries(capture as unknown as Record<string, unknown>)
    .map(([key, value]) => ({ key, value: JSON.stringify(value).length }))
    .sort((a, b) => b.value - a.value)
  const total = sections.reduce((s, x) => s + x.value, 0)

  return (
    <div className="table-wrap">
      <table>
        <caption>
          Table — <span className="mono">capture.json</span> section by section. Sizes are the
          serialised length of each value, measured at render time.
        </caption>
        <thead>
          <tr>
            <th scope="col">Section</th>
            <th scope="col">Role</th>
            <th scope="col" className="n">Size</th>
            <th scope="col" className="n">Share</th>
            <th scope="col" className="wrap">Holds</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((s) => {
            const st = ROLE_STYLE[ROLE[s.key] ?? 'provenance']
            return (
              <tr key={s.key}>
                <th scope="row" className="mono">{s.key}</th>
                <td><span className="pill" style={{ color: st.ink, background: st.fill }}>{st.label}</span></td>
                <td className="n">{bytes(s.value)}</td>
                <td className="n">{((s.value / total) * 100).toFixed(2)}%</td>
                <td className="wrap">{WHAT[s.key] ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td />
            <td className="n">{bytes(total)}</td>
            <td className="n">100%</td>
            <td className="wrap">One run, {n(capture.runs)} repeats per timing.</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
