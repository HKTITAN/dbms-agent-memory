/* Chart primitives.
 *
 * Hand-rolled, with no charting dependency. A library would have to be argued
 * out of its defaults on every point this paper cares about — zero baselines,
 * direct labels instead of legends, tabular figures, a real <table> behind every
 * picture — and the argument is longer than the code.
 *
 * Every component here is a server component: the capture is a fixed build-time
 * artifact, so there is nothing to hydrate and nothing to re-render. Anything
 * that needs state belongs in its own client file, not in this one.
 *
 * Rules that hold across all of them:
 *   - Length encodes magnitude from zero. No truncated bar, ever.
 *   - Colour is never the only signal. Every mark that carries a number prints
 *     the number too, so the chart survives greyscale, print, and colour vision
 *     deficiency without a second version.
 *   - Anything encoding more than three values ships a visually hidden <table>.
 *     A picture of a number is not the number.
 *   - Colours come from the tokens in globals.css only, so the machine audience
 *     and the print stylesheet re-theme these charts for free.
 */

import type { CSSProperties, ReactNode } from 'react'

/* ------------------------------------------------------------------ atoms */

const DASH = '—'

/* Present in the accessibility tree, absent from layout. Used for the fallback
 * tables, which must not be reachable by eye or by the print stylesheet. */
const SR: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  border: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
}

/* Ordered by luminance, not by hue: the series stay separable in greyscale and
 * the accent sits last so it is spent on the arm a figure is arguing about. */
const RAMP = ['var(--data-3)', 'var(--data-2)', 'var(--data-1)', 'var(--data-4)']

/* Significant figures scaled to magnitude. A latency of 0.5019 ms and a corpus
 * of 8282 memories both want to be read at a glance, and neither wants four
 * decimals. Callers with a real unit (bytes, ms, %) pass their own formatter
 * from lib/data. */
function auto(n: number): string {
  if (n === 0) return '0'
  const a = Math.abs(n)
  const d = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

/* One decimal count for a whole axis, taken from the finest tick on it. Scaling
 * the precision per value instead gives a column reading 0.200, 0.400, 1.00,
 * which is the formatter describing itself rather than the data. */
function tickFormatter(ticks: number[]): (n: number) => string {
  const dec = Math.max(
    0,
    ...ticks.map((v) => {
      const s = String(Number(v.toPrecision(12)))
      const dot = s.indexOf('.')
      return dot < 0 ? 0 : s.length - dot - 1
    }),
  )
  return (n) =>
    n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

/* Axis ticks only. Compact suffixes are readable under a tick mark but wrong in
 * a sentence, so this never escapes an axis. */
function axisNum(n: number): string {
  if (n === 0) return '0'
  const a = Math.abs(n)
  if (a >= 1e6) return `${+(n / 1e6).toPrecision(3)}M`
  if (a >= 1e3) return `${+(n / 1e3).toPrecision(3)}k`
  return auto(n)
}

/* Compact suffixes suit a counted axis (500, 1k, 50k); a shared decimal count
 * suits a measured one (0.0, 0.2, 0.4). The choice is made once per axis rather
 * than per value, which is what makes a column of ticks read as one scale. */
function axisFormatter(ticks: number[]): (n: number) => string {
  const counted =
    ticks.every((v) => Number.isInteger(v)) && Math.max(...ticks.map(Math.abs)) >= 1000
  return counted ? axisNum : tickFormatter(ticks)
}

/* A log axis is the one place a shared decimal count is meaningless: every tick
 * is a different magnitude, so each is printed at its own natural precision. */
function logLabel(n: number): string {
  return Math.abs(n) >= 1000 ? axisNum(n) : String(Number(n.toPrecision(12)))
}

/* Round outward to the nearest 1/2/5 × 10ⁿ — the values a reader can divide in
 * their head, and the only ones a log axis should be anchored to. */
function nice125(v: number, dir: 'up' | 'down'): number {
  if (v <= 0) return 0
  const mag = 10 ** Math.floor(Math.log10(v))
  const f = v / mag
  const steps = [1, 2, 5, 10]
  if (dir === 'up') return (steps.find((s) => f <= s + 1e-9) ?? 10) * mag
  return (steps.slice().reverse().find((s) => s <= f + 1e-9) ?? 1) * mag
}

/* A zero-anchored linear axis. The step is picked *nearest* on the 1/2/2.5/5
 * ladder rather than rounded up, because rounding up turns a 4178-byte maximum
 * into a 6000-byte axis and throws away a third of the plot. */
function linearAxis(dataMax: number, want = 4): { max: number; ticks: number[] } {
  if (!(dataMax > 0)) return { max: 1, ticks: [0, 1] }
  const raw = dataMax / want
  const mag = 10 ** Math.floor(Math.log10(raw))
  const f = raw / mag
  const ladder = [1, 2, 2.5, 5, 10]
  const nearest = ladder.reduce((a, b) => (Math.abs(b - f) < Math.abs(a - f) ? b : a))
  let step = nearest * mag
  let max = Math.ceil(dataMax / step - 1e-9) * step
  /* Rounding the maximum outward can add an interval or two. Coarsen the step
     until the axis is back near the tick count that was asked for — seven
     labels where four would do is noise the reader has to look past. */
  while (max / step > want + 1) {
    step *= 2
    max = Math.ceil(dataMax / step - 1e-9) * step
  }
  const ticks: number[] = []
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(Number(v.toPrecision(12)))
  return { max, ticks }
}

function ticksIn(lo: number, hi: number, mantissas: number[]): number[] {
  const out: number[] = []
  for (let d = Math.floor(Math.log10(lo)); d <= Math.ceil(Math.log10(hi)); d++) {
    for (const m of mantissas) {
      const v = m * 10 ** d
      if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v)
    }
  }
  return out.sort((a, b) => a - b)
}

/* Drop ticks until they fit, but never the last one: the top of the axis has to
 * stay labelled or the reader cannot tell what the plot area is bounded by. */
function thin(list: number[], maxN: number): number[] {
  if (list.length <= maxN) return list
  const step = Math.ceil((list.length - 1) / (maxN - 1))
  const kept = list.filter((_, i) => i % step === 0)
  const last = list[list.length - 1]
  if (kept[kept.length - 1] !== last) kept.push(last)
  return kept
}

/**
 * A log axis, bounded so that its top and bottom are both labelled ticks.
 *
 * Narrow ranges get 1/2/5 bounds, which keep the data filling the plot: the
 * corpus sweep runs 609 to 33,197 memories, and rounding that out to whole
 * decades would spend a third of the axis on sizes nobody ran. Wide ranges thin
 * their ticks down to decades to stay readable, and once that happens the bounds
 * are snapped to decades too — a 1/2/5 bound like 50 would otherwise sit above
 * the last labelled tick at 10 and make the axis look cut off.
 */
function logAxis(min: number, max: number): { lo: number; hi: number; ticks: number[] } {
  let lo = nice125(min, 'down')
  let hi = nice125(max, 'up')
  /* A flat axis — every value identical and already a round 1/2/5 number, which
     is what a one-point sweep or a metric that did not move produces — rounds
     down and up to the same bound. A zero-width log range then divides by zero
     for every mark on the chart, so give it a decade either side and draw the
     line through the middle of a real scale. */
  if (!(hi > lo)) {
    lo /= 10
    hi *= 10
  }
  const fine = ticksIn(lo, hi, [1, 2, 5])
  if (fine.length <= 7) return { lo, hi, ticks: fine }
  /* `lo` and `hi` sit inside the same decades as the data they were rounded
     from, so this is the data's own decade span — taken from the bounds rather
     than the raw values only so a widened flat axis keeps its width. */
  const dLo = 10 ** Math.floor(Math.log10(lo))
  const dHi = 10 ** Math.ceil(Math.log10(hi))
  return { lo: dLo, hi: dHi, ticks: thin(ticksIn(dLo, dHi, [1]), 7) }
}

/* A label sits where its series ends, which on a crowded plot is often on top of
 * another series' line. Stroking the glyphs in the surface colour and painting
 * that stroke first knocks a small halo out of whatever is behind them, so the
 * text stays readable without a filled box that would hide the data. */
const HALO = {
  stroke: 'var(--bg-raised)',
  strokeLinejoin: 'round' as const,
  paintOrder: 'stroke' as const,
}

/* Direct labels beat a legend, but only if two of them never sit on the same
 * baseline. Series are pushed apart to a minimum gap and the whole stack is
 * lifted if it runs off the bottom; the marker itself never moves, so a leader
 * is drawn whenever a label has been displaced from the value it names. */
type Label = { id: string; text: string; tone: string; bold: boolean; x: number; py: number; y: number }

/* Roughly one glyph of the mono face at the size labels are drawn — the same
 * figure the right gutter is measured with, so the two agree. */
const LABEL_ADV = 6.2

/* Where a direct label starts. The gutter is sized from the longest series name
 * but capped, so that one very long name cannot eat the plot; past the cap the
 * label would run off the edge of the viewBox and be clipped to nothing. Pulling
 * it back over the plot instead costs little, because the halo already keeps a
 * label readable on top of a line. */
function labelX(x: number, text: string, w: number): number {
  return Math.max(0, Math.min(x + 10, w - 4 - text.length * LABEL_ADV))
}

function stackLabels(items: Omit<Label, 'y'>[], top: number, bottom: number, gap = 13): Label[] {
  const out: Label[] = items
    .map((i) => ({ ...i, y: i.py }))
    .sort((a, b) => a.y - b.y)
  let prev = top - gap
  for (const l of out) {
    l.y = Math.max(l.y, prev + gap)
    prev = l.y
  }
  const last = out[out.length - 1]
  const over = last ? last.y - bottom : 0
  if (over > 0) for (const l of out) l.y -= over
  return out
}

/* SVG text scales with the viewBox: at 375px a chart drawn 640 units wide would
 * render its 10.5px tick labels at under 6px. The floor is a legibility floor,
 * not the design width — it is set below the drawing width so that two of these
 * side by side in `.grid-2` still fit a laptop without scrolling, and only a
 * phone ever has to pan. Below the floor the container scrolls rather than
 * shrinking the type any further. */
const MIN_W = 520
const scroller: CSSProperties = { overflowX: 'auto', overscrollBehaviorX: 'contain' }

/* ----------------------------------------------------------------- figure */

/**
 * The frame every exhibit sits in. The caption is deliberately a sibling of the
 * <figure> rather than a <figcaption>: it is numbered by the caller ("Figure 4 —
 * …"), it belongs to the prose that references it, and keeping it outside means
 * `.figure`'s border stops at the chart instead of wrapping the sentence about
 * it.
 *
 * The head's title is a plain span, not a heading. Twenty figures would put
 * twenty entries into the document outline, and in the machine register every
 * heading class grows a `####` prefix — a figure label is neither of those
 * things.
 */
export function Figure({
  title, meta, caption, full, foot, children,
}: {
  title: string
  meta?: ReactNode
  caption?: ReactNode
  full?: boolean
  foot?: ReactNode
  children: ReactNode
}) {
  return (
    /* The wrapper exists so figure + caption are one item to the parent layout.
       As a fragment, a Figure dropped into `.grid-2` would eat two cells. */
    <div style={full ? { minWidth: 0, gridColumn: '1 / -1' } : { minWidth: 0 }}>
      <figure className="figure">
        <div className="figure-head">
          <span>{title}</span>
          {meta ? <span className="meta">{meta}</span> : null}
        </div>
        <div className="figure-body">{children}</div>
        {foot ? <div className="figure-foot">{foot}</div> : null}
      </figure>
      {caption ? <p className="caption">{caption}</p> : null}
    </div>
  )
}

/* ------------------------------------------------------------ stat display */

export function StatStrip({
  stats,
}: {
  stats: { value: string; unit?: string; label: string }[]
}) {
  return (
    <div className="stat-strip">
      {stats.map((s) => (
        <div className="stat" key={s.label}>
          <span className="stat-value">
            {s.value}
            {s.unit ? <span className="stat-unit">{s.unit}</span> : null}
          </span>
          <span className="stat-label">{s.label}</span>
        </div>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------- bar chart */

type Bar = { label: string; value: number; emphasis?: boolean; tone?: string }

/**
 * Horizontal bars. Horizontal because the categories are engine names — a
 * vertical chart would rotate ten labels to 45° and cost the reader more than
 * the extra column of width saves.
 *
 * `max` lets two sibling charts share one scale so their bars are comparable;
 * it can only extend the axis, never crop a bar, because a bar that runs past
 * its track is a lie about the number printed beside it.
 */
export function BarChart({
  data, unit, tableLabel, format = auto, max,
}: {
  data: Bar[]
  unit?: string
  tableLabel: string
  format?: (n: number) => string
  max?: number
}) {
  const top = Math.max(max ?? 0, ...data.map((d) => d.value), 0)
  const width = (v: number) => (top <= 0 ? 0 : (Math.max(0, v) / top) * 100)

  return (
    <>
      <div
        role="img"
        aria-label={`${tableLabel}${unit ? ` in ${unit}` : ''} for ${data.length} items, on a zero baseline up to ${format(top)}. Values are listed in the table that follows.`}
        style={{ display: 'grid', gap: '0.5rem' }}
      >
        {data.map((d) => (
          <div
            key={d.label}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(92px, 26%) minmax(0, 1fr) auto',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <span className="label" style={{ fontSize: '0.75rem', textAlign: 'right' }}>
              {d.label}
            </span>
            {/* The track is the axis: every bar starts at the same left edge, so
                the zero origin is visible without drawing a rule for it. */}
            <span
              style={{
                display: 'block',
                height: 18,
                background: 'var(--data-grid)',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <span
                style={{
                  display: 'block',
                  width: `${width(d.value)}%`,
                  height: '100%',
                  background: d.tone ?? (d.emphasis ? 'var(--data-4)' : 'var(--data-2)'),
                  borderRadius: 2,
                }}
              />
            </span>
            <span
              className="mono"
              style={{ fontSize: '0.8125rem', minWidth: '5ch', textAlign: 'right' }}
            >
              {format(d.value)}
              {unit ? <span style={{ color: 'var(--text-tertiary)' }}> {unit}</span> : null}
            </span>
          </div>
        ))}
      </div>

      <table style={SR}>
        <caption>{tableLabel}{unit ? ` (${unit})` : ''} — the values drawn above.</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col" className="n">{tableLabel}{unit ? ` (${unit})` : ''}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td className="n">{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

/* ----------------------------------------------------------- grouped bars */

type Group = { label: string; bars: { label: string; value: number; tone?: string }[] }

/**
 * One block per group, one bar per member, all on a single shared scale — the
 * comparison is both within and across groups, and two scales would make the
 * second comparison impossible.
 *
 * Colour is keyed to the bar's label rather than to its position, so a group
 * that omits a member does not silently recolour the ones that remain.
 */
export function GroupedBars({
  groups, unit, tableLabel, format = auto,
}: {
  groups: Group[]
  unit?: string
  tableLabel: string
  format?: (n: number) => string
}) {
  const legend = (groups[0]?.bars ?? []).map((b, i) => ({
    label: b.label,
    tone: b.tone ?? RAMP[i % RAMP.length],
  }))
  const toneOf = new Map(legend.map((l) => [l.label, l.tone]))
  const top = Math.max(...groups.flatMap((g) => g.bars.map((b) => b.value)), 0)
  const width = (v: number) => (top <= 0 ? 0 : (Math.max(0, v) / top) * 100)

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.375rem 0.875rem',
          marginBottom: '0.875rem',
        }}
      >
        {legend.map((l) => (
          <span
            key={l.label}
            className="meta"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
          >
            <span
              aria-hidden="true"
              style={{ width: 10, height: 10, borderRadius: 2, background: l.tone, flex: '0 0 auto' }}
            />
            {l.label}
          </span>
        ))}
        {unit ? <span className="meta" style={{ color: 'var(--text-faint)' }}>values in {unit}</span> : null}
      </div>

      <div
        role="img"
        aria-label={`${tableLabel}${unit ? ` in ${unit}` : ''} for ${groups.length} groups of ${legend.length} series, on a shared zero baseline up to ${format(top)}. Values are listed in the table that follows.`}
        style={{ display: 'grid', gap: '0.75rem' }}
      >
        {groups.map((g) => (
          <div key={g.label}>
            <span className="label" style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>
              {g.label}
            </span>
            <div style={{ display: 'grid', gap: 3 }}>
              {g.bars.map((b, i) => (
                <div
                  key={b.label}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    alignItems: 'center',
                    gap: '0.625rem',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      height: 12,
                      background: 'var(--data-grid)',
                      borderRadius: 2,
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        width: `${width(b.value)}%`,
                        height: '100%',
                        background: b.tone ?? toneOf.get(b.label) ?? RAMP[i % RAMP.length],
                        borderRadius: 2,
                      }}
                    />
                  </span>
                  <span className="mono" style={{ fontSize: '0.75rem', minWidth: '5ch', textAlign: 'right' }}>
                    {format(b.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <table style={SR}>
        <caption>{tableLabel}{unit ? ` (${unit})` : ''} — the values drawn above.</caption>
        <thead>
          <tr>
            <th scope="col">Group</th>
            {legend.map((l) => (
              <th scope="col" className="n" key={l.label}>{l.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.label}>
              <th scope="row">{g.label}</th>
              {legend.map((l) => {
                const b = g.bars.find((x) => x.label === l.label)
                return (
                  <td className="n" key={l.label}>{b ? format(b.value) : DASH}</td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

/* ------------------------------------------------------------ line chart */

type Series = {
  id: string
  label: string
  tone?: string
  emphasis?: boolean
  points: { x: number; y: number }[]
}

/**
 * Multi-series lines with every measured point marked, because there are three
 * or four of them per series and a smooth curve between two measurements would
 * be an assertion nobody made.
 *
 * Log scales are offered rather than assumed. The corpus sweep spans 609 to
 * 8282 memories and the storage figures span three orders of magnitude: on a
 * linear axis the small end collapses into the origin and the shape of the
 * growth — the thing the figure exists to show — becomes unreadable. Where a log
 * scale is used the axis title says so, since a reader who misses that misreads
 * every slope on the chart.
 */
export function ScalingChart({
  series, xLabel, yLabel, logX, logY, formatY,
}: {
  series: Series[]
  xLabel: string
  yLabel: string
  logX?: boolean
  logY?: boolean
  formatY?: (n: number) => string
}) {
  const W = 640
  const H = 300
  const all = series.flatMap((s) => s.points)
  const xs = all.map((p) => p.x)
  const ys = all.map((p) => p.y)

  /* A log axis cannot represent zero or a negative value. Rather than drop the
     point and quietly change the dataset, fall back to linear. */
  const useLogX = !!logX && xs.length > 0 && xs.every((v) => v > 0)
  const useLogY = !!logY && ys.length > 0 && ys.every((v) => v > 0)

  /* An empty series still has to draw an axis. Seeding the maximum from the data
     alone would hand linearAxis a 1e-9 range and print six ticks reading
     0.00000. */
  const xLog = useLogX ? logAxis(Math.min(...xs), Math.max(...xs)) : null
  const xLin = linearAxis(xs.length ? Math.max(...xs) : 1)
  const xLo = xLog ? xLog.lo : 0
  const xHi = xLog ? xLog.hi : xLin.max
  const xTicks = xLog ? xLog.ticks : xLin.ticks

  const yLog = useLogY ? logAxis(Math.min(...ys), Math.max(...ys)) : null
  const yLin = linearAxis(ys.length ? Math.max(...ys) : 1)
  const yLo = yLog ? yLog.lo : 0
  const yHi = yLog ? yLog.hi : yLin.max
  const yTicks = yLog ? yLog.ticks : yLin.ticks

  /* An axis wants one shared precision; a table wants the value it was given.
     A caller who supplies a unit formatter owns both. */
  const tickX = xLog ? logLabel : axisFormatter(xTicks)
  const tickY = formatY ?? (yLog ? logLabel : axisFormatter(yTicks))
  const cellY = formatY ?? auto

  /* Both side gutters are measured from the text that has to sit in them: the
     right from the longest series name, the left from the widest tick label a
     caller's formatter produces. A fixed 56 was enough for "100" and pushed
     "953.7 MB" off the edge of the drawing. */
  const nameChars = Math.max(...series.map((s) => s.label.length), 4)
  const tickChars = Math.max(...yTicks.map((v) => tickY(v).length), 1)
  const pad = {
    t: 16,
    r: Math.min(148, 16 + nameChars * LABEL_ADV),
    b: 46,
    l: Math.max(34, Math.min(104, 20 + tickChars * 6.4)),
  }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b

  const sx = (x: number) =>
    useLogX
      ? pad.l + ((Math.log10(x) - Math.log10(xLo)) / (Math.log10(xHi) - Math.log10(xLo))) * iw
      : pad.l + (x / xHi) * iw
  const sy = (y: number) =>
    useLogY
      ? pad.t + ih - ((Math.log10(y) - Math.log10(yLo)) / (Math.log10(yHi) - Math.log10(yLo))) * ih
      : pad.t + ih - (y / yHi) * ih

  const drawn = series.map((s, i) => ({
    ...s,
    tone: s.tone ?? RAMP[i % RAMP.length],
    sorted: s.points.slice().sort((a, b) => a.x - b.x),
  }))

  const labels = stackLabels(
    drawn
      .filter((s) => s.sorted.length > 0)
      .map((s) => {
        const last = s.sorted[s.sorted.length - 1]
        return {
          id: s.id,
          text: s.label,
          tone: s.tone,
          bold: !!s.emphasis,
          x: sx(last.x),
          py: sy(last.y),
        }
      }),
    pad.t + 4,
    H - pad.b,
  )

  const axis = (label: string, log: boolean) => (log ? `${label} · log scale` : label)

  return (
    <>
      <div style={scroller}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', minWidth: MIN_W, height: 'auto', display: 'block' }}
          role="img"
          aria-label={`${yLabel} against ${xLabel} for ${series.length} engines${useLogX || useLogY ? ', drawn on logarithmic axes' : ''}. Values are listed in the table that follows.`}
        >
          <title>{`${yLabel} against ${xLabel}`}</title>

          {yTicks.map((v) => (
            <g key={`y${v}`}>
              <line
                x1={pad.l} x2={W - pad.r} y1={sy(v)} y2={sy(v)}
                stroke="var(--data-grid)" strokeWidth={1}
              />
              <text
                x={pad.l - 8} y={sy(v) + 3.5} textAnchor="end"
                fill="var(--text-tertiary)" fontSize={10.5} fontFamily="var(--font-mono)"
              >
                {tickY(v)}
              </text>
            </g>
          ))}

          {/* The baseline is drawn as ink, not as a gridline: it is where the
              axis actually starts, and on a log scale that is not zero. */}
          <line
            x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih}
            stroke="var(--border-strong)" strokeWidth={1}
          />

          {xTicks.map((v) => (
            <g key={`x${v}`}>
              <line
                x1={sx(v)} x2={sx(v)} y1={pad.t + ih} y2={pad.t + ih + 4}
                stroke="var(--border-strong)" strokeWidth={1}
              />
              <text
                x={sx(v)} y={pad.t + ih + 16} textAnchor="middle"
                fill="var(--text-tertiary)" fontSize={10.5} fontFamily="var(--font-mono)"
              >
                {tickX(v)}
              </text>
            </g>
          ))}

          {drawn.map((s) => (
            <g key={s.id}>
              <path
                d={s.sorted
                  .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
                  .join(' ')}
                fill="none"
                stroke={s.tone}
                strokeWidth={s.emphasis ? 2.2 : 1.4}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.sorted.map((p) => (
                <circle
                  key={`${s.id}-${p.x}`}
                  cx={sx(p.x)} cy={sy(p.y)} r={s.emphasis ? 3.4 : 2.6}
                  fill={s.tone}
                />
              ))}
            </g>
          ))}

          {labels.map((l) => {
            const lx = labelX(l.x, l.text, W)
            return (
              <g key={l.id}>
                {/* The leader starts at the marker, which never moves, and ends
                    at the text, which may have been pushed down the stack or
                    pulled left to stay inside the drawing. */}
                {Math.abs(l.y - l.py) > 3 ? (
                  <path
                    d={`M${(l.x + 5).toFixed(1)},${l.py.toFixed(1)} L${(lx - 1).toFixed(1)},${(l.y - 3.5).toFixed(1)}`}
                    fill="none" stroke={l.tone} strokeWidth={0.9} strokeOpacity={0.5}
                  />
                ) : null}
                <text
                  x={lx} y={l.y} dominantBaseline="middle"
                  fill={l.tone} fontSize={10.5} fontWeight={l.bold ? 600 : 500}
                  fontFamily="var(--font-mono)" {...HALO} strokeWidth={3}
                >
                  {l.text}
                </text>
              </g>
            )
          })}

          <text
            x={pad.l + iw / 2} y={H - 6} textAnchor="middle"
            fill="var(--text-secondary)" fontSize={12}
          >
            {axis(xLabel, useLogX)}
          </text>
          <text
            x={-(pad.t + ih / 2)} y={12} textAnchor="middle" transform="rotate(-90)"
            fill="var(--text-secondary)" fontSize={12}
          >
            {axis(yLabel, useLogY)}
          </text>
        </svg>
      </div>

      <table style={SR}>
        <caption>{yLabel} against {xLabel}, per engine — the values drawn above.</caption>
        <thead>
          <tr>
            <th scope="col">Engine</th>
            <th scope="col" className="n">{xLabel}</th>
            <th scope="col" className="n">{yLabel}</th>
          </tr>
        </thead>
        <tbody>
          {drawn.flatMap((s) =>
            s.sorted.map((p) => (
              <tr key={`${s.id}-${p.x}`}>
                <th scope="row">{s.label}</th>
                <td className="n">{auto(p.x)}</td>
                <td className="n">{cellY(p.y)}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </>
  )
}

/* ------------------------------------------------------------ pareto plot */

type ParetoSeries = {
  id: string
  label: string
  tone?: string
  emphasis?: boolean
  points: { x: number; y: number; k: number }[]
}

/**
 * Quality against cost, with each engine's budget sweep joined in k order and
 * every point labelled with its k. The join is what makes this a trajectory
 * rather than a cloud: the reader has to be able to see which direction the
 * curve moves as k grows, because the claim being tested is that past some k
 * the extra tokens buy nothing.
 *
 * Both axes are zero-anchored and linear. Cost is the honest place to refuse a
 * log scale — compressing it would flatter every arm that answers by spending
 * five times the context.
 */
export function ParetoChart({
  series, xLabel, yLabel,
}: {
  series: ParetoSeries[]
  xLabel: string
  yLabel: string
}) {
  const W = 640
  const H = 320
  const all = series.flatMap((s) => s.points)
  const xAxis = linearAxis(Math.max(...all.map((p) => p.x), 0))
  const yAxis = linearAxis(Math.max(...all.map((p) => p.y), 0))
  const tickX = axisFormatter(xAxis.ticks)
  const tickY = axisFormatter(yAxis.ticks)

  const nameChars = Math.max(...series.map((s) => s.label.length), 4)
  const tickChars = Math.max(...yAxis.ticks.map((v) => tickY(v).length), 1)
  const pad = {
    t: 18,
    r: Math.min(148, 16 + nameChars * LABEL_ADV),
    b: 46,
    l: Math.max(34, Math.min(104, 20 + tickChars * 6.4)),
  }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b

  const sx = (x: number) => pad.l + (x / xAxis.max) * iw
  const sy = (y: number) => pad.t + ih - (y / yAxis.max) * ih

  /* Ten arms swept over six budgets is sixty k labels, which is a texture rather
     than an annotation. On a crowded plot only the arm under discussion carries
     its whole sweep; every other curve gets the k it starts at, and its far end
     is already named by its direct label — which is enough to read the direction
     of travel, the only thing k has to communicate here. */
  const dense = series.length > 3
  const showK = (emphasis: boolean, i: number) => !dense || emphasis || i === 0

  const drawn = series.map((s, i) => ({
    ...s,
    tone: s.tone ?? RAMP[i % RAMP.length],
    sorted: s.points.slice().sort((a, b) => a.k - b.k),
  }))

  const labels = stackLabels(
    drawn
      .filter((s) => s.sorted.length > 0)
      .map((s) => {
        const last = s.sorted[s.sorted.length - 1]
        return {
          id: s.id,
          text: s.label,
          tone: s.tone,
          bold: !!s.emphasis,
          x: sx(last.x),
          py: sy(last.y),
        }
      }),
    pad.t + 4,
    H - pad.b,
  )

  return (
    <>
      <div style={scroller}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', minWidth: MIN_W, height: 'auto', display: 'block' }}
          role="img"
          aria-label={`${yLabel} against ${xLabel} for ${series.length} engines, each traced across its retrieval budget k. Values are listed in the table that follows.`}
        >
          <title>{`${yLabel} against ${xLabel}, traced over k`}</title>

          {yAxis.ticks.map((v) => (
            <g key={`y${v}`}>
              <line
                x1={pad.l} x2={W - pad.r} y1={sy(v)} y2={sy(v)}
                stroke="var(--data-grid)" strokeWidth={1}
              />
              <text
                x={pad.l - 8} y={sy(v) + 3.5} textAnchor="end"
                fill="var(--text-tertiary)" fontSize={10.5} fontFamily="var(--font-mono)"
              >
                {tickY(v)}
              </text>
            </g>
          ))}

          <line
            x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih}
            stroke="var(--border-strong)" strokeWidth={1}
          />

          {xAxis.ticks.map((v) => (
            <g key={`x${v}`}>
              <line
                x1={sx(v)} x2={sx(v)} y1={pad.t + ih} y2={pad.t + ih + 4}
                stroke="var(--border-strong)" strokeWidth={1}
              />
              <text
                x={sx(v)} y={pad.t + ih + 16} textAnchor="middle"
                fill="var(--text-tertiary)" fontSize={10.5} fontFamily="var(--font-mono)"
              >
                {tickX(v)}
              </text>
            </g>
          ))}

          {drawn.map((s, si) => (
            <g key={s.id}>
              <path
                d={s.sorted
                  .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
                  .join(' ')}
                fill="none"
                stroke={s.tone}
                strokeWidth={s.emphasis ? 2 : 1.3}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.sorted.map((p, i) => (
                <g key={`${s.id}-k${p.k}`}>
                  <circle
                    cx={sx(p.x)} cy={sy(p.y)} r={s.emphasis ? 3.4 : 2.6}
                    fill={s.tone}
                  />
                  {/* Above or below by series parity, which is what keeps two
                      crossing trajectories from stacking their marks on the
                      same pixel. */}
                  {showK(!!s.emphasis, i) ? (
                    <text
                      x={sx(p.x)} y={sy(p.y) + (si % 2 === 0 ? -7 : 13)}
                      textAnchor="middle" fill="var(--text-faint)"
                      fontSize={8.5} fontFamily="var(--font-mono)"
                      {...HALO} strokeWidth={2.4}
                    >
                      {p.k}
                    </text>
                  ) : null}
                </g>
              ))}
            </g>
          ))}

          {labels.map((l) => {
            const lx = labelX(l.x, l.text, W)
            return (
              <g key={l.id}>
                {/* The leader starts at the marker, which never moves, and ends
                    at the text, which may have been pushed down the stack or
                    pulled left to stay inside the drawing. */}
                {Math.abs(l.y - l.py) > 3 ? (
                  <path
                    d={`M${(l.x + 5).toFixed(1)},${l.py.toFixed(1)} L${(lx - 1).toFixed(1)},${(l.y - 3.5).toFixed(1)}`}
                    fill="none" stroke={l.tone} strokeWidth={0.9} strokeOpacity={0.5}
                  />
                ) : null}
                <text
                  x={lx} y={l.y} dominantBaseline="middle"
                  fill={l.tone} fontSize={10.5} fontWeight={l.bold ? 600 : 500}
                  fontFamily="var(--font-mono)" {...HALO} strokeWidth={3}
                >
                  {l.text}
                </text>
              </g>
            )
          })}

          <text
            x={pad.l + iw / 2} y={H - 6} textAnchor="middle"
            fill="var(--text-secondary)" fontSize={12}
          >
            {xLabel}
          </text>
          <text
            x={-(pad.t + ih / 2)} y={12} textAnchor="middle" transform="rotate(-90)"
            fill="var(--text-secondary)" fontSize={12}
          >
            {yLabel}
          </text>
        </svg>
      </div>

      {/* A reader who sees k on some markers and not others will assume the
          unlabelled ones are different in kind. They are not, so the rule is
          stated where the chart applies it. */}
      {dense ? (
        <p className="meta" style={{ marginTop: '0.5rem' }}>
          Every marker is one measured budget. k is printed in full on the highlighted
          arms and at the smallest budget on the rest; each line ends at its largest k.
        </p>
      ) : null}

      <table style={SR}>
        <caption>{yLabel} and {xLabel} at each retrieval budget k — the values drawn above.</caption>
        <thead>
          <tr>
            <th scope="col">Engine</th>
            <th scope="col" className="n">k</th>
            <th scope="col" className="n">{xLabel}</th>
            <th scope="col" className="n">{yLabel}</th>
          </tr>
        </thead>
        <tbody>
          {drawn.flatMap((s) =>
            s.sorted.map((p) => (
              <tr key={`${s.id}-k${p.k}`}>
                <th scope="row">{s.label}</th>
                <td className="n">{p.k}</td>
                <td className="n">{auto(p.x)}</td>
                <td className="n">{auto(p.y)}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </>
  )
}

/* ------------------------------------------------------------ heat matrix */

/* The ramp stops well short of solid accent. The number is printed in every
 * cell in --text, and --text has to stay readable against the darkest shade in
 * all three themes this stylesheet defines — the light page, the machine canvas
 * where --accent is a pale amber on near-black, and print where --accent is
 * pure black. Capping the mix keeps every one of those legible without a second
 * palette, and costs nothing: the shade is a redundant encoding, so it only has
 * to rank cells, not carry them. */
const SHADE_FLOOR = 2
const SHADE_CEIL = 34

/* The alpha has to be applied to a token whose value changes with the audience,
 * so it is computed in CSS rather than in JavaScript. */
function accentShade(t: number): string {
  const pct = SHADE_FLOOR + Math.max(0, Math.min(1, t)) * (SHADE_CEIL - SHADE_FLOOR)
  return `color-mix(in srgb, var(--accent) ${pct.toFixed(1)}%, transparent)`
}

/**
 * Engines down, query classes across. This is a real <table> rather than a grid
 * of coloured boxes: it is evidence, so it wants a caption, row and column
 * scopes, selectable figures, and a print rendering — all of which come free
 * from the element and none of which come free from a chart.
 *
 * Shading is normalised over the whole matrix rather than per row. Per-row
 * normalisation would make every engine look like it has a best class and a
 * worst class, including the ones that fail uniformly, which is the opposite of
 * what this figure is for.
 */
export function HeatMatrix({
  rows, cols, value, format = (n) => n.toFixed(2), caption, legendLabel = 'value',
}: {
  rows: { id: string; label: string; sub?: string }[]
  cols: { id: string; label: string; flag?: string }[]
  value: (rowId: string, colId: string) => number | null
  format?: (n: number) => string
  caption?: string
  legendLabel?: string
}) {
  const cells = rows.flatMap((r) => cols.map((c) => value(r.id, c.id)))
  const present = cells.filter((v): v is number => v !== null)
  /* Anchored at zero unless the data goes below it, so shade stays proportional
     to magnitude instead of to rank within whatever band this run happened to
     produce. */
  const lo = Math.min(0, ...present)
  const hi = Math.max(...present, lo + 1e-9)
  const t = (v: number) => (v - lo) / (hi - lo)

  return (
    <>
      <div className="table-wrap">
        <table>
          {caption ? <caption>{caption}</caption> : null}
          <thead>
            <tr>
              <th scope="col">
                <span style={SR}>Row</span>
              </th>
              {cols.map((c) => (
                <th scope="col" className="n" key={c.id}>
                  {c.label}
                  {c.flag ? (
                    <span className="meta" style={{ display: 'block', fontSize: '0.6875rem' }}>
                      {c.flag}
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">
                  {r.label}
                  {r.sub ? (
                    <span className="meta" style={{ display: 'block', fontSize: '0.6875rem' }}>
                      {r.sub}
                    </span>
                  ) : null}
                </th>
                {cols.map((c) => {
                  const v = value(r.id, c.id)
                  return (
                    <td
                      key={c.id}
                      className="n mono"
                      style={v === null ? undefined : { background: accentShade(t(v)) }}
                    >
                      {v === null ? DASH : format(v)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The key ranks the shading; it does not decode it, because the cells
          already print their own values. */}
      <p
        className="meta"
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
      >
        <span>{legendLabel}</span>
        <span>{format(lo)}</span>
        <span
          aria-hidden="true"
          style={{ display: 'inline-flex', border: '1px solid var(--border-faint)', borderRadius: 2 }}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((s) => (
            <span key={s} style={{ width: 22, height: 10, background: accentShade(s) }} />
          ))}
        </span>
        <span>{format(hi)}</span>
        <span style={{ color: 'var(--text-faint)' }}>{DASH} not applicable</span>
      </p>
    </>
  )
}
