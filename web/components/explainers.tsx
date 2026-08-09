'use client'

/**
 * The operable figures.
 *
 * Four explainers, each one an argument the paper makes in prose turned into
 * something a reader can drive. They share three decisions:
 *
 * 1. One selection model. `useSelection` holds the index, counts changes so the
 *    panel can replay its enter animation, and remembers whether the change came
 *    from a pointer or from the keyboard — a held arrow key must not restage a
 *    260ms swap on every repeat.
 *
 * 2. One layout rule. Where the panels differ in height, every variant is
 *    rendered into the same grid cell by `Deck`, so the figure is as tall as its
 *    tallest state and switching moves nothing on the page. Only the selected
 *    panel is visible; the rest are `visibility: hidden` (out of the
 *    accessibility tree) and `.no-print` (gone on paper, so the printed figure
 *    collapses to the height of what it shows). The budget explorer needs none
 *    of this: it has one row per engine at every k, so its height is fixed by
 *    construction.
 *
 * 3. One print contract. The tab strips are chrome and are `.no-print`, so the
 *    printed edition shows the default selection with no way to tell what was
 *    selected — which is why every panel names its own state in text rather than
 *    relying on the tab above it.
 *
 * Encodings follow the same rules as the static figures: bars start at zero,
 * axes carry units, numbers are tabular, and colour repeats the family coding
 * from `familyTone` so a hue means the same thing here as in the tables.
 */

import { useCallback, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import type { Capture, EngineResult, SchemaAttr, SchemaEntity } from '@/lib/types'
import { familyTone, num, pct } from '@/lib/data'

/* ------------------------------------------------------------- primitives */

/* The design system has no visually-hidden class, and a chart that encodes more
   than three values owes assistive technology a real table. `clip` rather than
   `display: none`: a hidden table is not read out at all. The other three
   explainers put a genuine table on the page instead, so this is only needed by
   the one figure whose primary encoding is a bar. */
const SR_ONLY: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
}

const DASH = '—'

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
 * Home/End jump to the ends, focus follows so the reader can keep pressing.
 * Selection is automatic on arrow — the panels are already rendered, so there is
 * nothing to defer to a separate Enter press, and Enter/Space still activate
 * because these are real buttons.
 */
function TabList({
  label,
  tabs,
  index,
  onSelect,
  tabId,
  panelId,
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
      const n = tabs.length
      let next = index
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          next = (index + n - 1) % n
          break
        case 'ArrowRight':
        case 'ArrowDown':
          next = (index + 1) % n
          break
        case 'Home':
          next = 0
          break
        case 'End':
          next = n - 1
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
      /* `.seg` is a single inline row. Eight query classes or seven table names
         do not fit one on a phone, so this instance wraps. */
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
          /* Roving tabindex: the strip is one tab stop, and the arrows move
             inside it. */
          tabIndex={i === index ? 0 : -1}
          className={i === index ? 'seg-on' : undefined}
          ref={(el) => {
            buttons.current[i] = el
          }}
          /* `detail` is 0 for Enter/Space activation and >0 for a real click, so
             keyboard activation skips the animation the same way arrows do. */
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
 * settles. `stretch` turns the cell into a grid so the selected panel can hand
 * its slack to a child (the schema browser gives it to the DDL pane) instead of
 * leaving it at the bottom of the figure.
 */
function Deck({
  index,
  panels,
  stretch,
}: {
  index: number
  panels: ReactNode[]
  stretch?: boolean
}) {
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
            display: stretch ? 'grid' : undefined,
            minHeight: 0,
          }}
        >
          {panel}
        </div>
      ))}
    </div>
  )
}

/** A zero-baselined bar. `max` is always stated by the caller's axis label. */
function Bar({
  value,
  max,
  tone,
  height = 14,
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
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <span
        style={{ display: 'block', width: `${width}%`, height: '100%', background: tone, borderRadius: 2 }}
      />
    </span>
  )
}

/* Nice axis maxima. A bar axis that ends on 1270 asks the reader to divide by a
   number nobody chose; these steps end on values you can read a bar against. */
const NICE_STEPS = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]

function niceCeil(v: number): number {
  if (!(v > 0)) return 1
  const mag = 10 ** Math.floor(Math.log10(v))
  return (NICE_STEPS.find((n) => v <= n * mag) ?? 10) * mag
}

/* =========================================================== 1. query classes */

type ClassMeta = Capture['expressibility']['classes'][number]

/**
 * An arm is similarity-only when its ranking is decided by vector distance and
 * the predicate is not part of retrieval. Post-filtering counts as similarity-
 * only on purpose: a filter applied after the fact can drop rows the index
 * ranked, but it cannot reach a row the index never returned.
 */
const similarityOnly = (e: EngineResult) => e.supports.vector !== false && e.supports.predicates !== true

/* The brief names its own class, because the tab strip that says which one is
   selected does not survive printing. */
function ClassBrief({ meta }: { meta: ClassMeta }) {
  return (
    <div style={{ display: 'grid', gap: '0.625rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.5rem' }}>
        <span className="heading-16 mono" style={{ margin: 0 }}>{meta.class}</span>
        <span className="meta">
          {num(meta.queries)} queries · {pct(meta.share)} of the set
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
        <span className={meta.predicate ? 'pill pill-accent' : 'pill'}>
          {meta.predicate
            ? `needs ${meta.predicate.field} ${meta.predicate.op}`
            : 'structural predicate: none'}
        </span>
        <span className={meta.similarityExpressible ? 'pill pill-ok' : 'pill pill-bad'}>
          {meta.similarityExpressible ? 'expressible by similarity' : 'not expressible by similarity'}
        </span>
      </div>

      {/* The example is the corpus's own text, so it is set in the monospaced
          face the rest of the paper uses for material read out of the capture. */}
      <blockquote
        style={{ margin: 0, paddingLeft: '0.75rem', borderLeft: '2px solid var(--accent-line)' }}
      >
        <span className="mono" style={{ fontSize: '0.8125rem', color: 'var(--text)' }}>
          {meta.example}
        </span>
      </blockquote>

      <p className="caption" style={{ margin: 0 }}>{meta.rationale}</p>
    </div>
  )
}

export function QueryClassExplorer({ capture }: { capture: Capture }) {
  const uid = useId()
  const classes = capture.expressibility.classes
  const sel = useSelection(0)
  const active = classes[sel.index]

  const live = useMemo(() => capture.engines.filter((e) => !e.failed), [capture.engines])

  /* Sorted per class, which is the whole point of the figure: the ordering is a
     property of the question, not of the engine. Ties keep capture order,
     because Array.prototype.sort is stable. */
  const rows = useMemo(
    () =>
      live
        .map((e) => ({ engine: e, ndcg: e.quality.byClass.find((b) => b.class === active.class)?.ndcg }))
        .filter((r): r is { engine: EngineResult; ndcg: number } => typeof r.ndcg === 'number')
        .sort((a, b) => b.ndcg - a.ndcg),
    [live, active.class],
  )

  const tabId = (i: number) => `${uid}-class-tab-${i}`
  const panelId = `${uid}-class-panel`

  /* A summary, not a readout, and phrased the way `charts.tsx` phrases every
     other chart label in the paper. The table below carries every value for
     assistive technology; enumerating all ten arms here as well would announce
     the same ten numbers twice in a row, which is worse than not labelling the
     chart at all. */
  const chartLabel =
    rows.length === 0
      ? `No engine scored the ${active.class} class`
      : `nDCG at k = ${capture.k} by engine for ${rows.length} items on ${active.class} queries, ` +
        `on a zero baseline up to 1.000, ranked best first from ${rows[0].engine.short} at ` +
        `${rows[0].ndcg.toFixed(3)} down to ${rows[rows.length - 1].engine.short} at ` +
        `${rows[rows.length - 1].ndcg.toFixed(3)}. Values are listed in the table that follows.`

  return (
    <figure className="figure">
      <div className="figure-head">
        <span className="heading-16" style={{ margin: 0 }}>What each query class asks for</span>
        <span className="meta">
          {classes.length} classes · {num(capture.expressibility.total)} queries
        </span>
      </div>

      <div className="figure-body" style={{ display: 'grid', gap: '1rem' }}>
        {/* Eight tabs will not sit beside a title in a figure head at any width
            worth designing for, so the control takes its own row. */}
        <TabList
          label="Query class"
          tabs={classes.map((c) => ({ key: c.class, label: c.class }))}
          index={sel.index}
          onSelect={sel.choose}
          tabId={tabId}
          panelId={panelId}
        />

        <div
          role="tabpanel"
          id={panelId}
          aria-labelledby={tabId(sel.index)}
          tabIndex={0}
          style={{ display: 'grid', gap: '1rem' }}
        >
          <div key={sel.swapKey} className={sel.swapClass} style={{ display: 'grid', gap: '1rem' }}>
            <Deck
              index={sel.index}
              panels={classes.map((c) => <ClassBrief key={c.class} meta={c} />)}
            />

            <div>
              <div
                className="meta"
                style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', gap: '1rem' }}
              >
                <span>nDCG@{capture.k} on this class</span>
                <span>0 {DASH} 1</span>
              </div>

              <div style={{ display: 'grid', gap: '0.375rem' }} role="img" aria-label={chartLabel}>
                {rows.map(({ engine, ndcg }) => (
                  <div
                    key={engine.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(96px, 27%) minmax(0, 1fr) auto',
                      alignItems: 'center',
                      gap: '0.625rem',
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        alignItems: 'baseline',
                        gap: '0.3125rem',
                        minWidth: 0,
                      }}
                    >
                      <span
                        className="label"
                        style={{ fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {engine.short}
                      </span>
                      {/* A word, not a colour: the hue is already spent on the
                          storage family. */}
                      {similarityOnly(engine) ? (
                        <span className="meta" style={{ fontSize: '0.625rem', color: 'var(--text-faint)' }}>
                          sim
                        </span>
                      ) : null}
                    </span>
                    <Bar value={ndcg} max={1} tone={familyTone[engine.family]} />
                    <span
                      className="mono num"
                      style={{ fontSize: '0.75rem', minWidth: '4.5ch', textAlign: 'right' }}
                    >
                      {ndcg.toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <table style={SR_ONLY}>
            <caption>
              nDCG at k = {capture.k} for every engine on {active.class} queries, best first.
            </caption>
            <thead>
              <tr>
                <th scope="col">Engine</th>
                <th scope="col">Index</th>
                <th scope="col">Retrieval</th>
                <th scope="col" className="n">nDCG</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ engine, ndcg }) => (
                <tr key={engine.id}>
                  <th scope="row">{engine.label}</th>
                  <td>{engine.index}</td>
                  <td>{similarityOnly(engine) ? 'similarity only' : 'predicates evaluated during retrieval'}</td>
                  <td className="n num">{ndcg.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="figure-foot">
        Bars are nDCG@{capture.k} on the selected class alone, on a 0{DASH}1 axis from a zero baseline;
        colour repeats the storage family used throughout the paper.{' '}
        <span className="mono">sim</span> marks an arm that ranks by vector distance and cannot evaluate
        the predicate during retrieval — post-filtering counts, because a filter can only remove rows the
        index already ranked. Change the class and the ranking changes with it — not the spacing between
        the arms, the order of them. No arm here is best on every class, so where an engine sits is a
        property of the question being asked and not of the index answering it.
      </div>
    </figure>
  )
}

/* ============================================================ 2. dense failure */

type DenseProbe = NonNullable<Capture['corpus']['denseFailure']>
type DenseSample = DenseProbe['samples'][number]

/* Word-shaped runs, hyphens kept so `ADR-297` survives as one token rather than
   as `adr` and `297`. */
const WORD = /[A-Za-z0-9][A-Za-z0-9-]*/g
/* An identifier the corpus minted: a name followed by a number. Not a general
   rule about English — a description of how this corpus names things. */
const IDENT = /^[a-z]+-\d+$/

function queryTokens(text: string): Set<string> {
  return new Set((text.toLowerCase().match(WORD) ?? []))
}

/**
 * Shades the tokens a memory shares with the query, and shades a shared
 * identifier harder. Plain string matching, not a linguistic claim — but it puts
 * the decisive fact where a reader can see it rather than take it on trust:
 * whether the memory the embedding ranked first contains the thing the query
 * named at all. In several of these probes it does not, and it still wins.
 */
function Marked({ text, shared }: { text: string; shared: Set<string> }) {
  const parts: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(WORD)) {
    const at = m.index ?? 0
    if (at > last) parts.push(text.slice(last, at))
    const word = m[0]
    last = at + word.length
    const key = word.toLowerCase()
    if (!shared.has(key)) {
      parts.push(word)
      continue
    }
    const ident = IDENT.test(key)
    parts.push(
      <mark
        key={at}
        style={{
          background: ident ? 'var(--accent-quiet)' : 'var(--bg-inset)',
          color: ident ? 'var(--accent-text)' : 'inherit',
          fontWeight: ident ? 600 : undefined,
          padding: '0.05em 0.15em',
          borderRadius: 2,
        }}
      >
        {word}
      </mark>,
    )
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

function Hit({
  heading,
  rank,
  corpusSize,
  cosine,
  body,
  shared,
  flag,
}: {
  heading: string
  rank: number
  corpusSize: number
  cosine: number | null
  body: string
  shared: Set<string>
  flag?: ReactNode
}) {
  return (
    <div
      style={{
        border: 'var(--rule)',
        borderRadius: 'var(--radius)',
        background: 'var(--bg-sunken)',
        padding: '0.75rem 0.875rem',
        display: 'grid',
        gap: '0.5rem',
        alignContent: 'start',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '0.5rem',
        }}
      >
        <span className="label">{heading}</span>
        {flag}
      </div>

      <div className="meta">
        rank <span className="num">{num(rank)}</span> of <span className="num">{num(corpusSize)}</span>
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.5rem', alignItems: 'center' }}
      >
        {/* Both sides share one 0–1 cosine axis, or the comparison the figure
            exists to make would be drawn to two different scales. */}
        <Bar value={cosine ?? 0} max={1} tone="var(--data-2)" height={10} />
        <span className="mono num" style={{ fontSize: '0.75rem' }}>
          {cosine === null ? DASH : cosine.toFixed(3)}
        </span>
      </div>

      <p className="body" style={{ margin: 0, fontSize: '0.8125rem' }}>
        {body ? <Marked text={body} shared={shared} /> : <span className="meta">no relevant memory was ranked</span>}
      </p>
    </div>
  )
}

function SamplePanel({ sample, ordinal, total }: { sample: DenseSample; ordinal: number; total: number }) {
  const shared = useMemo(() => queryTokens(sample.query), [sample.query])

  return (
    <div style={{ display: 'grid', gap: '0.875rem' }}>
      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.5rem' }}>
          {/* Names its own position: the stepper above it is chrome and does not
              print. */}
          <span className="label">Probe {ordinal} of {total}</span>
          <span className="meta">
            {num(sample.relevantCount)} relevant {sample.relevantCount === 1 ? 'memory' : 'memories'} in the corpus
          </span>
        </div>
        <p className="mono" style={{ margin: '0.3125rem 0 0', fontSize: '0.8125rem' }}>{sample.query}</p>
      </div>

      <div className="grid-2" style={{ gap: '0.875rem' }}>
        <Hit
          heading="What the embedding ranked first"
          rank={1}
          corpusSize={sample.corpusSize}
          cosine={sample.topCosine}
          body={sample.topBody}
          shared={shared}
          flag={
            sample.topIsDistractor ? (
              <span className="pill pill-bad">distractor</span>
            ) : (
              <span className="pill">grounded, wrong</span>
            )
          }
        />
        <Hit
          heading="The first genuinely relevant memory"
          rank={sample.firstRelevantRank}
          corpusSize={sample.corpusSize}
          cosine={sample.bestRelevantCosine}
          body={sample.relevantBody}
          shared={shared}
          flag={
            <span className="pill pill-accent">
              {sample.firstRelevantPercentile.toFixed(2)}% down the ranking
            </span>
          }
        />
      </div>
    </div>
  )
}

function DenseFailureFigure({ probe }: { probe: DenseProbe }) {
  const uid = useId()
  const sel = useSelection(0)
  const samples = probe.samples
  const tabId = (i: number) => `${uid}-probe-tab-${i}`
  const panelId = `${uid}-probe-panel`

  /* Counted, not asserted: probes whose top-ranked memory does not contain the
     identifier the query names. It is the sharpest way to say what the shading
     shows — the nearest neighbour is not a near-miss on the subject, it is often
     not about the subject at all.
     The denominator is the probes whose query actually names an identifier, not
     every probe. A query that names nothing cannot have its identifier missed,
     and counting it as a miss would make the sentence in the footer overstate
     the case the moment the probe class is one whose queries name nothing. */
  const identProbes = useMemo(() => {
    const named = samples.filter((s) => [...queryTokens(s.query)].some((w) => IDENT.test(w)))
    const missing = named.filter((s) => {
      const inTop = new Set(s.topBody.toLowerCase().match(WORD) ?? [])
      return ![...queryTokens(s.query)].some((w) => IDENT.test(w) && inTop.has(w))
    }).length
    return { named: named.length, missing }
  }, [samples])

  return (
    <figure className="figure">
      <div className="figure-head">
        <span className="heading-16" style={{ margin: 0 }}>Why the nearest neighbour is the wrong memory</span>
        <span className="meta">
          {samples.length} probes · {probe.class} class
        </span>
      </div>

      <div className="figure-body" style={{ display: 'grid', gap: '1rem' }}>
        <TabList
          label="Probe"
          tabs={samples.map((s, i) => ({
            key: `${i}`,
            label: `${i + 1}`,
            hint: `Probe ${i + 1}: ${s.query}`,
          }))}
          index={sel.index}
          onSelect={sel.choose}
          tabId={tabId}
          panelId={panelId}
        />

        <div role="tabpanel" id={panelId} aria-labelledby={tabId(sel.index)} tabIndex={0}>
          <div key={sel.swapKey} className={sel.swapClass}>
            <Deck
              index={sel.index}
              panels={samples.map((s, i) => (
                <SamplePanel key={i} sample={s} ordinal={i + 1} total={samples.length} />
              ))}
            />
          </div>
        </div>
      </div>

      <div className="figure-foot">
        Probes are drawn from the <span className="mono">{probe.class}</span> class, where the memory that
        answers the question contains the query&rsquo;s identifier verbatim. Across them the top-ranked
        memory is a distractor — a memory with no fact behind it — in{' '}
        {pct(probe.topIsDistractorRate, 0)} of cases, and the first genuinely relevant memory sits at rank{' '}
        <span className="num">{num(probe.medianFirstRelevantRank)}</span> on median. Shading marks a token
        the memory shares with the query; the accented shade marks a shared identifier.{' '}
        {identProbes.named > 0 ? (
          <>
            In <span className="num">{identProbes.missing}</span> of {identProbes.named} probes the nearest
            neighbour does not contain the queried identifier at all.{' '}
          </>
        ) : null}
        Step through them and the failure is the same one every
        time: the nearest neighbour is a note about looking something up and finding nothing — a sentence
        built like the question — while the memory that answers it is a flat declaration of fact. The
        embedding is ranking the shape of the sentence, not what it is about. Cosine bars run 0{DASH}1 from
        a zero baseline.
      </div>
    </figure>
  )
}

export function DenseFailureExplainer({ capture }: { capture: Capture }) {
  const probe = capture.corpus.denseFailure

  /* The probe is optional in the capture: it needs the embedding model loaded,
     which a fast run skips. Say so rather than render an empty stepper. */
  if (!probe || probe.samples.length === 0) {
    return (
      <figure className="figure">
        <div className="figure-head">
          <span className="heading-16" style={{ margin: 0 }}>Why the nearest neighbour is the wrong memory</span>
        </div>
        <div className="figure-body">
          <p className="body" style={{ margin: 0, color: 'var(--text-secondary)' }}>
            This capture carries no dense-retrieval probe. The field{' '}
            <span className="mono">corpus.denseFailure</span> is written by{' '}
            <span className="mono">tools/capture.mjs</span> only when the embedding model is available,
            so a capture taken without it has no ranked comparison to step through. Every other number in
            this section is unaffected.
          </p>
        </div>
      </figure>
    )
  }

  return <DenseFailureFigure probe={probe} />
}

/* ============================================================= 3. token budget */

export function BudgetExplorer({ capture }: { capture: Capture }) {
  const uid = useId()
  const live = useMemo(() => capture.engines.filter((e) => !e.failed), [capture.engines])

  const ks = useMemo(
    () => [...new Set(live.flatMap((e) => e.budget.map((b) => b.k)))].sort((a, b) => a - b),
    [live],
  )

  /* Open on the k every other table in the paper reports, so the figure and the
     tables agree on first read — and so the printed default is the one the prose
     is talking about. */
  const sel = useSelection(Math.max(0, ks.indexOf(capture.k)))
  const k = ks[sel.index] ?? capture.k

  /* One token axis for every k, not a fresh axis per k. Rescaling each time
     would flatten the only thing worth seeing here: widening k costs context
     linearly while quality does almost nothing. */
  const tokenMax = useMemo(
    () => niceCeil(Math.max(...live.flatMap((e) => e.budget.map((b) => b.meanTokens)), 1)),
    [live],
  )

  /* Capture order, not sorted by score. The reader is comparing the same row
     across values of k; re-sorting on every change would make that impossible,
     and the families stay grouped. */
  const rows = live.map((e) => ({ engine: e, point: e.budget.find((b) => b.k === k) }))

  const worst = Math.max(...rows.map((r) => r.point?.meanTokens ?? 0), 0)
  const corpusTokens = capture.corpus.stats.tokens

  const tabId = (i: number) => `${uid}-k-tab-${i}`
  const panelId = `${uid}-k-panel`

  return (
    <figure className="figure">
      <div className="figure-head">
        <span className="heading-16" style={{ margin: 0 }}>What a context window buys</span>
        <span className="meta">
          corpus {num(corpusTokens)} tokens · {num(capture.corpus.stats.memories)} memories
        </span>
      </div>

      <div className="figure-body" style={{ display: 'grid', gap: '0.875rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.625rem' }}>
          <span className="label">Return top k</span>
          <TabList
            label="Value of k"
            tabs={ks.map((v) => ({ key: `${v}`, label: `${v}`, hint: `k equals ${v}` }))}
            index={sel.index}
            onSelect={sel.choose}
            tabId={tabId}
            panelId={panelId}
          />
        </div>

        <div role="tabpanel" id={panelId} aria-labelledby={tabId(sel.index)} tabIndex={0}>
          <div key={sel.swapKey} className={sel.swapClass}>
            {/* A table rather than a bar list: two quantities per engine, one of
                which is a cost and one a benefit, read better in labelled
                columns — and `.table-wrap` handles a narrow screen without a
                media query. The bars are decoration on numbers that are already
                printed, so they are aria-hidden and the table is the record. */}
            <div className="table-wrap">
              <table>
                <caption>
                  Every engine at k = {k}: the mean number of tokens a recall returns, and the ranking
                  quality those tokens buy. Token bars share a 0{DASH}
                  {num(tokenMax)} axis across all values of k; nDCG bars run 0{DASH}1. Both from zero.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Engine</th>
                    <th scope="col">Index</th>
                    <th scope="col" className="n">Mean tokens returned</th>
                    <th scope="col" className="n">nDCG@{k}</th>
                    <th scope="col" className="n">Tokens per unit nDCG</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ engine, point }) => (
                    <tr key={engine.id}>
                      <th scope="row">{engine.short}</th>
                      <td className="mono">{engine.index}</td>
                      <td className="n">
                        {point ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              justifyContent: 'flex-end',
                            }}
                          >
                            <span style={{ display: 'block', width: 96 }}>
                              <Bar value={point.meanTokens} max={tokenMax} tone="var(--data-2)" height={10} />
                            </span>
                            <span className="num" style={{ minWidth: '5ch' }}>
                              {num(Math.round(point.meanTokens))}
                            </span>
                          </span>
                        ) : (
                          DASH
                        )}
                      </td>
                      <td className="n">
                        {point ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              justifyContent: 'flex-end',
                            }}
                          >
                            <span style={{ display: 'block', width: 96 }}>
                              <Bar value={point.ndcg} max={1} tone={familyTone[engine.family]} height={10} />
                            </span>
                            <span className="num" style={{ minWidth: '5ch' }}>{point.ndcg.toFixed(3)}</span>
                          </span>
                        ) : (
                          DASH
                        )}
                      </td>
                      <td className="n num">
                        {point && point.ndcg > 0 ? num(Math.round(point.meanTokens / point.ndcg)) : DASH}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="figure-foot">
        The whole corpus is <span className="num">{num(corpusTokens)}</span> tokens. At k = {k} the most
        expensive arm returns <span className="num">{num(Math.round(worst))}</span> of them —{' '}
        {pct(worst / corpusTokens, 2)} of everything the agent has ever written — and that is the budget
        a model actually pays for. The last column divides the two: how many tokens each arm spends per
        unit of ranking quality, which is the number to read when k stops improving nDCG and only keeps
        growing the bill.
      </div>
    </figure>
  )
}

/* ============================================================== 4. the schema */

/* Matched on the statement's own table name rather than on array position: the
   DDL is emitted in dependency order, which is not the order the entities are
   declared in, and position matching would quietly show the wrong table. */
function findDdl(statements: string[], table: string): string | null {
  const name = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const want = new RegExp(`^\\s*CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?"?${name}"?\\s*\\(`, 'i')
  return statements.find((s) => want.test(s)) ?? null
}

/* Terse on purpose. In a half-width column every note that wraps to a second
   line costs a row of height in a table that is already the tallest thing in the
   figure, and each of these words is expanded either by the key pills above the
   table or by the specialization block beside it. */
function attrNotes(a: SchemaAttr): string[] {
  const notes: string[] = []
  if (a.partialKey) notes.push('partial key')
  if (a.partOfNaturalKey) notes.push('natural key')
  if (a.discriminator) notes.push('discriminator')
  if (a.recursive) notes.push('recursive')
  if (a.nullable) notes.push('nullable')
  return notes
}

function EntityPanel({
  entity,
  ddl,
  paneMax,
}: {
  entity: SchemaEntity
  ddl: string | null
  paneMax: number
}) {
  return (
    <div
      /* MEMORY has eleven attributes, a specialization and a seventeen-line
         CREATE TABLE; AGENT has three attributes and six lines. The deck reserves
         the taller of the two, so a short table always has a few hundred pixels
         to put somewhere. Two decisions keep that from reading as breakage: the
         attributes and the DDL sit side by side rather than stacked, so the slack
         falls beside content as a ragged column bottom instead of opening a hole
         in the middle of the figure; and the DDL pane is capped at its own tallest
         statement, so it never grows into a window seven times taller than the
         code in it. */
      style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: '0.875rem', minHeight: 0 }}
    >
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.5rem' }}>
          {/* Named here, not only on the tab: the tab strip does not print. */}
          <span className="heading-16 mono" style={{ margin: 0 }}>{entity.name}</span>
          <span className={entity.kind === 'weak' ? 'pill pill-accent' : 'pill'}>{entity.kind} entity</span>
        </div>
        <p className="body" style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          {entity.blurb}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
          <span className="pill">PK ({entity.pk.join(', ')})</span>
          {entity.naturalKey ? (
            <span className="pill">natural key ({entity.naturalKey.join(', ')})</span>
          ) : null}
          {entity.partialKey ? <span className="pill">partial key {entity.partialKey}</span> : null}
          {entity.identifyingParent ? (
            <span className="pill">identified by {entity.identifyingParent}</span>
          ) : null}
        </div>
      </div>

      {/* `.grid-2` rather than a bespoke track list: it is the one two-column
          layout in the design system that already collapses on a narrow screen,
          and a component cannot add a media query from an inline style. */}
      <div className="grid-2" style={{ alignItems: 'start', minHeight: 0 }}>
      <div style={{ display: 'grid', gap: '0.875rem', alignContent: 'start', minHeight: 0 }}>
        <div className="table-wrap">
          <table>
            <caption>
              Attributes of {entity.name} in declaration order. No units — this table is definitional.
            </caption>
            <thead>
              <tr>
                <th scope="col">Attribute</th>
                <th scope="col">Type</th>
                <th scope="col">Key</th>
                <th scope="col" className="wrap">Notes</th>
              </tr>
            </thead>
            <tbody>
              {entity.attrs.map((a) => {
                const isPk = a.pk === true || entity.pk.includes(a.name)
                const notes = attrNotes(a)
                return (
                  <tr key={a.name}>
                    <th scope="row" className="mono">{a.name}</th>
                    <td className="mono" style={{ color: 'var(--text-tertiary)' }}>{a.type}</td>
                    {/* Marks rather than pills: a pill in every row of an
                        eleven-row table adds four pixels a row and half a column
                        of width, and the word already carries the meaning. */}
                    <td className="mono">
                      {isPk ? <span style={{ fontWeight: 600 }}>PK</span> : null}
                      {isPk && a.fk ? ' · ' : null}
                      {/* The table it points at, not the full `table.column`:
                          the referenced column is beside it in the DDL, and the
                          long form costs a hundred pixels in every row. */}
                      {a.fk ? (
                        <span style={{ color: 'var(--accent-text)' }}>FK {'→'} {a.fk.split('.')[0]}</span>
                      ) : null}
                      {!isPk && !a.fk ? <span style={{ color: 'var(--text-faint)' }}>{DASH}</span> : null}
                    </td>
                    <td className="wrap" style={{ color: 'var(--text-tertiary)' }}>
                      {notes.length > 0 ? notes.join(' · ') : DASH}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {entity.specialization ? (
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
            <span className="label">
              Specialization on <span className="mono">{entity.specialization.discriminator}</span> —{' '}
              {entity.specialization.disjoint ? 'disjoint' : 'overlapping'},{' '}
              {entity.specialization.total ? 'total' : 'partial'}
            </span>
            <ul className="caption" style={{ margin: 0, paddingLeft: '1.125rem', display: 'grid', gap: '0.25rem' }}>
              {entity.specialization.subtypes.map((s) => (
                <li key={s.name}>
                  <span className="mono" style={{ color: 'var(--text)' }}>{s.name}</span> — {s.blurb}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* Grid inside the block so the <pre> takes the leftover row: the pane is
          the same size for every table up to `paneMax`, which is the tallest
          statement in the schema. */}
      <div
        className="code-block"
        style={{
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr)',
          alignSelf: 'stretch',
          maxHeight: paneMax,
        }}
      >
        <div className="code-head">
          <span>postgres · {entity.name}</span>
          <span>DDL executed by the loader</span>
        </div>
        <pre>
          <code>
            {ddl ?? `-- no CREATE TABLE statement named "${entity.name}" in this capture`}
          </code>
        </pre>
      </div>
      </div>
    </div>
  )
}

export function SchemaBrowser({ capture }: { capture: Capture }) {
  const uid = useId()
  const entities = capture.schema.entities
  const ddl = capture.schema.ddl.postgres

  /* Open on the weak entity. It is the only table carrying a natural key, a
     partial key and a specialization at once, so the default state exercises
     every field this browser can show — which matters most on paper, where the
     default is the only state a reader gets. */
  const sel = useSelection(Math.max(0, entities.findIndex((e) => e.kind === 'weak')))

  /* The height of the longest CREATE TABLE, in pixels, so a short statement's
     pane never stretches to fill space reserved for a long one. The constants
     are the code-block metrics from globals.css — 13px monospace on a 1.62 line
     box, plus the head and the pre's own padding. Derived rather than picked, so
     the cap follows the schema if a table gains a column. */
  const paneMax = useMemo(() => {
    const lines = Math.max(...entities.map((e) => findDdl(ddl, e.name)?.split('\n').length ?? 1), 1)
    return Math.round(lines * 13 * 1.62 + 33 + 30)
  }, [entities, ddl])

  const tabId = (i: number) => `${uid}-entity-tab-${i}`
  const panelId = `${uid}-entity-panel`

  return (
    <figure className="figure">
      <div className="figure-head">
        <span className="heading-16" style={{ margin: 0 }}>The schema, table by table</span>
        <span className="meta">
          {entities.length} tables · {num(capture.schema.relationships.length)} relationships
        </span>
      </div>

      <div className="figure-body" style={{ display: 'grid', gap: '1rem' }}>
        <TabList
          label="Table"
          tabs={entities.map((e) => ({ key: e.name, label: e.name }))}
          index={sel.index}
          onSelect={sel.choose}
          tabId={tabId}
          panelId={panelId}
        />

        <div role="tabpanel" id={panelId} aria-labelledby={tabId(sel.index)} tabIndex={0}>
          <div key={sel.swapKey} className={sel.swapClass} style={{ display: 'grid' }}>
            <Deck
              index={sel.index}
              stretch
              panels={entities.map((e) => (
                <EntityPanel key={e.name} entity={e} ddl={findDdl(ddl, e.name)} paneMax={paneMax} />
              ))}
            />
          </div>
        </div>
      </div>

      <div className="figure-foot">
        Everything here is read out of the schema declaration the loaders execute, not written alongside
        it: the attributes, the keys and the statement below them come from the same source, so a table
        cannot be documented one way and created another. The DDL shown is the Postgres dialect, matched
        to the table by the name in its own <span className="mono">CREATE TABLE</span> statement.
      </div>
    </figure>
  )
}
