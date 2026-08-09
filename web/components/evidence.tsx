/* Evidence tables — the paper's primary exhibits.

   Every cell is read out of `data/capture.json` through the selectors and
   formatters in lib/data. Nothing here is recomputed from a summary and nothing
   is typed in by hand, so a claim in a sentence and the row it points at cannot
   drift apart. Server components on purpose: a table of a fixed capture has no
   state to hydrate.

   Encoding rules held throughout:
   - Colour is never the only signal. A supported capability is a check *and* a
     hidden word; a failure is the word "failed"; an absence is an em dash.
   - Numeric columns carry `n` on the <th> and the <td> so the header sits over
     its figures, and `num` for tabular numerals down the column.
   - Every caption names its population and its units. Units live in the cell
     wherever the formatter emits them (`12.4 MB`, `0.50 ms`), because a column
     that mixes magnitudes is ambiguous without them.
   - Where a table has an interpretive footnote it is a sibling <p className=
     "caption"> below the wrapper, not prose smuggled into a cell. */

import type { CSSProperties, ReactNode } from 'react'
import type { Capture, EngineResult, StorageLine } from '@/lib/types'
import { bytes, indexTone, ms, num, pct } from '@/lib/data'

/* Every export takes the numbering from the caller: the paper decides what is
   Table 3, not the component. */
type Props = { capture: Capture; n: number }

const DASH = '—'

/* `num` is toLocaleString, which drops trailing zeros — a column of means comes
   out ragged (3.7 sitting above 3.69) and stops being comparable at a glance.
   Ratios and means therefore get a fixed decimal count instead. */
const dec = (x: number, d = 2) =>
  x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

/* globals.css owns the design system and this file may not extend it, so the
   one utility it lacks is declared here. Glyph-only cells need it: "✓" reaches a
   screen reader as "check mark", which is not an answer to the column's
   question. */
const SR_ONLY: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
}

function Yes({ label = 'yes' }: { label?: string }) {
  return (
    <span className="pill pill-ok">
      <span aria-hidden="true">✓</span>
      <span style={SR_ONLY}>{label}</span>
    </span>
  )
}

function No({ label = 'no' }: { label?: string }) {
  return (
    <span style={{ color: 'var(--text-faint)' }}>
      <span aria-hidden="true">{DASH}</span>
      <span style={SR_ONLY}>{label}</span>
    </span>
  )
}

/** Bold marks the winning cell. Which cell that is, is computed per run. */
const mark = (value: number, best: number, text: string): ReactNode =>
  value === best ? <strong>{text}</strong> : text

/* The engine name and its implementation on one row header. The sub-line is
   `.meta` — mono, tabular, tertiary — so the eye reads the label first and the
   identifier only when it needs to cross-reference another table. */
function EngineHead({ label, sub }: { label: string; sub: string }) {
  return (
    <th scope="row" className="wrap" style={{ minWidth: '12.5rem' }}>
      {label}
      <span className="meta" style={{ display: 'block' }}>{sub}</span>
    </th>
  )
}

/* Engines that failed are excluded from every table and named once, in the
   footnote under Table 2. A row of blanks would imply a measurement that was
   never taken. */
const live = (capture: Capture): EngineResult[] => capture.engines.filter((e) => !e.failed)

/* ------------------------------------------------------- 1. corpus validation */

/**
 * Whether each query class is *reachable* by similarity at all, measured on the
 * labelled pairs rather than asserted. The cosine column is meaningless without
 * the random-pair baseline in the footer: a class whose mean cosine sits on that
 * baseline is one where the embedding carries no signal about relevance.
 */
export function ValidationTable({ capture, n }: Props) {
  const { byClass, randomPairCosine, randomPairs } = capture.corpus.validation
  const pairs = byClass.reduce((s, c) => s + c.pairs, 0)
  const queries = byClass.reduce((s, c) => s + c.queries, 0)
  // Classes whose labelled pairs score no better than two unrelated memories.
  // For those the embedding is not weak, it is empty, and no amount of tuning
  // moves them — which is the point the footnote has to make.
  const atFloor = byClass.filter((c) => c.meanCosine <= randomPairCosine)

  return (
    <>
      <div className="table-wrap">
        <table>
          <caption>
            Table {n}. Lexical and embedding evidence for each of the {byClass.length} query
            classes, measured over the {num(queries)} labelled queries and the {num(pairs)}{' '}
            query–memory pairs their ground truth contains. Term overlap is the fraction of query
            terms present in a relevant memory; identifier overlap is the same fraction restricted
            to rare tokens (ticket and ADR identifiers); cosine is over the{' '}
            {capture.toolchain.embeddingDim}-dimensional{' '}
            <span className="mono">{capture.toolchain.embeddingModel}</span> embedding. The final
            column records whether the class can be expressed as a similarity query at all.
          </caption>
          <thead>
            <tr>
              <th scope="col">Query class</th>
              <th scope="col" className="n">Queries</th>
              <th scope="col" className="n">Relevant / query</th>
              <th scope="col" className="n">Term overlap</th>
              <th scope="col" className="n">Identifier overlap</th>
              <th scope="col" className="n">Mean cosine</th>
              <th scope="col">Similarity-expressible</th>
            </tr>
          </thead>
          <tbody>
            {byClass.map((c) => (
              <tr key={c.class}>
                <th scope="row" className="mono">{c.class}</th>
                <td className="n num">{num(c.queries)}</td>
                <td className="n num">{dec(c.meanRelevantPerQuery)}</td>
                <td className="n num">{pct(c.meanTermOverlap)}</td>
                <td className="n num">{pct(c.meanRareTermOverlap)}</td>
                <td className="n num">{dec(c.meanCosine, 3)}</td>
                <td>{c.similarityExpressible ? <Yes /> : <No />}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th
                scope="row"
                colSpan={5}
                className="wrap"
                style={{ borderTop: '1px solid var(--border-strong)' }}
              >
                Baseline — {num(randomPairs)} random memory pairs
              </th>
              <td className="n num">{dec(randomPairCosine, 3)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="caption">
        Read the cosine column against the baseline row, not against 1.0: two unrelated memories
        already score {dec(randomPairCosine, 3)}, so a class carries embedding signal only to the
        extent it clears that floor.
        {atFloor.length > 0 ? (
          <>
            {' '}
            {num(atFloor.length)} of the {num(byClass.length)} classes average at or below it
            ({atFloor.map((c) => c.class).join(', ')}) — for those the embedding is not a weak
            signal, it is no signal, and no retriever built on it can be tuned into correctness.
          </>
        ) : null}
      </p>
    </>
  )
}

/* ------------------------------------------------------------- 2. engine results */

/**
 * The headline result. Ten storage architectures, one corpus, one query set —
 * so the columns are directly comparable and the bold cell in each is the arm
 * that actually won this run.
 */
export function EngineTable({ capture, n }: Props) {
  const rows = live(capture)
  const failed = capture.engines.filter((e) => e.failed)

  /* Math.max of nothing is -Infinity. If every arm failed there is no column to
     compare and no best value to mark, so state that rather than print an empty
     grid under a footnote claiming an impossible range. */
  if (rows.length === 0) {
    return (
      <p className="caption">
        Table {n} is empty: none of the {num(capture.engines.length)} configured engines completed
        the run
        {failed.length > 0 ? ` — ${failed.map((e) => `${e.id}: ${e.failed}`).join('; ')}` : ''}.
      </p>
    )
  }

  const hi = (f: (e: EngineResult) => number) => Math.max(...rows.map(f))
  const lo = (f: (e: EngineResult) => number) => Math.min(...rows.map(f))
  const best = {
    ndcg: hi((e) => e.quality.overall.ndcg),
    recall: hi((e) => e.quality.overall.r),
    mrr: hi((e) => e.quality.overall.mrr),
    p50: lo((e) => e.quality.overall.p50Ms),
    p95: lo((e) => e.quality.overall.p95Ms),
    perMemory: lo((e) => e.bytesPerMemory),
    total: lo((e) => e.storage.totalBytes),
  }
  const widestPerMemory = hi((e) => e.bytesPerMemory)

  return (
    <>
      <div className="table-wrap">
        <table>
          <caption>
            Table {n}. Retrieval quality, latency and size for the {rows.length} storage
            architectures, each measured over the same {num(capture.corpus.queriesUsed)} queries
            against the same {num(capture.corpus.stats.memories)} memories at k ={' '}
            {capture.k}. Quality columns are means over all queries; latency is per query, measured
            end to end inside the process; size is the whole store on disk after the load. Bold
            marks the best value in each column — highest for quality, lowest for latency and size.
          </caption>
          <thead>
            <tr>
              <th scope="col">Engine</th>
              <th scope="col">Index</th>
              <th scope="col" className="n">nDCG@{capture.k}</th>
              <th scope="col" className="n">Recall</th>
              <th scope="col" className="n">MRR</th>
              <th scope="col" className="n">p50</th>
              <th scope="col" className="n">p95</th>
              <th scope="col" className="n">Bytes / memory</th>
              <th scope="col" className="n">Total size</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const o = e.quality.overall
              return (
                <tr key={e.id}>
                  <EngineHead label={e.label} sub={e.engine} />
                  <td>
                    {/* The swatch keys this row to the same index colour the
                        charts use; the word carries the meaning on its own. */}
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        marginRight: '0.5rem',
                        background: indexTone[e.index],
                      }}
                    />
                    <span className="mono">{e.index}</span>
                  </td>
                  <td className="n num">{mark(o.ndcg, best.ndcg, dec(o.ndcg, 3))}</td>
                  <td className="n num">{mark(o.r, best.recall, dec(o.r, 3))}</td>
                  <td className="n num">{mark(o.mrr, best.mrr, dec(o.mrr, 3))}</td>
                  <td className="n num">{mark(o.p50Ms, best.p50, ms(o.p50Ms))}</td>
                  <td className="n num">{mark(o.p95Ms, best.p95, ms(o.p95Ms))}</td>
                  <td className="n num">
                    {mark(e.bytesPerMemory, best.perMemory, num(Math.round(e.bytesPerMemory)))}
                  </td>
                  <td className="n num">
                    {mark(e.storage.totalBytes, best.total, bytes(e.storage.totalBytes))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="caption">
        Bytes per memory is given as a plain byte count rather than through the size formatter:
        the column spans {num(Math.round(best.perMemory))} B to{' '}
        {num(Math.round(widestPerMemory))} B, and switching half the column into kilobytes would
        break the comparison the column exists to support.
        {failed.length > 0 ? (
          <>
            {' '}Excluded, having failed to complete the run:{' '}
            {failed.map((e, i) => (
              <span key={e.id}>
                {i > 0 ? ', ' : ''}
                <span className="mono">{e.id}</span> ({e.failed})
              </span>
            ))}
            .
          </>
        ) : (
          <> All {capture.engines.length} configured engines completed the run.</>
        )}
      </p>
    </>
  )
}

/* --------------------------------------------------------- 3. capability grid */

type SupportValue = boolean | 'post' | 'scan' | 'hnsw'

const CAPS = [
  { key: 'predicates', head: 'Predicates' },
  { key: 'joins', head: 'Joins' },
  { key: 'aggregates', head: 'Aggregates' },
  { key: 'transactions', head: 'Transactions' },
  { key: 'vector', head: 'Vector search' },
] as const

/* A qualified yes is not a yes, and the distinction is the whole argument: a
   post-filter applies the predicate *after* the index has already chosen the
   rows. So a word gets a neutral pill and only an unqualified capability gets
   the check. */
function Support({ value }: { value: SupportValue }) {
  if (value === true) return <Yes />
  if (value === false) return <No />
  return <span className="pill">{value}</span>
}

/**
 * The paper in one grid. Reading down the vector column and across the predicate
 * column at the same time is the argument: the arms that can do similarity and
 * the arms that can do relational work are almost disjoint, and the overlap is
 * counted in the footnote rather than asserted here, because which arms fall in
 * it is a property of the run.
 */
export function CapabilityTable({ capture, n }: Props) {
  const rows = live(capture)
  const full = rows.filter((e) => e.supports.predicates === true && e.supports.vector !== false)

  return (
    <>
      <div className="table-wrap">
        <table>
          <caption>
            Table {n}. What each of the {rows.length} architectures can express, as declared by its
            loader and confirmed by the query plans in the appendix. A check is an unqualified
            capability; a word is a qualified one and names the mechanism; {DASH} is an absence.
            No units — this table is definitional, and it does not depend on the corpus.
          </caption>
          <thead>
            <tr>
              <th scope="col">Engine</th>
              {CAPS.map((c) => (
                <th scope="col" key={c.key}>{c.head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <EngineHead label={e.label} sub={e.id} />
                {CAPS.map((c) => (
                  <td key={c.key}>
                    <Support value={e.supports[c.key]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="caption">
        <span className="mono">post</span> — the predicate is applied to the rows the index already
        returned, so it can only remove, never recover.{' '}
        <span className="mono">scan</span> — cosine is computed over every stored vector, because no
        access method exists for it. <span className="mono">hnsw</span> — an approximate
        nearest-neighbour graph the planner can combine with an ordinary predicate.{' '}
        {full.length} of {rows.length} architectures offer both unqualified predicates and a vector
        access method.
      </p>
    </>
  )
}

/* ------------------------------------------------------- 4. query expressibility */

/**
 * The workload split. Each class is decided by one predicate, and the predicate
 * is shown: an argument that a class "cannot be similarity search" is only worth
 * anything if the reader can see the operator that makes it so.
 */
export function ExpressibilityTable({ capture, n }: Props) {
  const { classes, similarityExpressible, total, similarityShare } = capture.expressibility
  const structural = total - similarityExpressible

  return (
    <>
      <div className="table-wrap">
        <table>
          <caption>
            Table {n}. The {num(total)} queries of the workload by class, with the predicate that
            decides each class and the reason it can or cannot be answered by nearest-neighbour
            search over the memory text. Share is of the whole query set; the predicate column names
            the field and operator the correct answer depends on, or {DASH} where correctness
            depends only on the text.
          </caption>
          <thead>
            <tr>
              <th scope="col">Query class</th>
              <th scope="col" className="n">Queries</th>
              <th scope="col" className="n">Share</th>
              <th scope="col">Similarity-expressible</th>
              <th scope="col">Deciding predicate</th>
              <th scope="col" className="wrap">Rationale</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c.class}>
                <th scope="row" className="mono">{c.class}</th>
                <td className="n num">{num(c.queries)}</td>
                <td className="n num">{pct(c.share)}</td>
                <td>{c.similarityExpressible ? <Yes /> : <No />}</td>
                <td>
                  {c.predicate ? (
                    <span className="mono">{c.predicate.field} {c.predicate.op}</span>
                  ) : (
                    <No label="none" />
                  )}
                </td>
                <td className="wrap" style={{ minWidth: '20rem' }}>{c.rationale}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" style={{ borderTop: '1px solid var(--border-strong)' }}>
                All classes
              </th>
              <td className="n num">{num(total)}</td>
              <td className="n num">{pct(classes.reduce((s, c) => s + c.share, 0))}</td>
              <td className="num">
                {num(similarityExpressible)} of {num(total)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="caption">
        {num(similarityExpressible)} queries ({pct(similarityShare)}) are similarity-expressible.
        The remaining {num(structural)} ({pct(1 - similarityShare)}) turn on a range restriction, a
        foreign-key equality, a null test or a count — four operators an embedding index does not
        have. That fraction, not any quality score, is the ceiling on a similarity-only store.
      </p>
    </>
  )
}

/* ------------------------------------------------------------------ 5. storage */

const KINDS: Array<{ kind: StorageLine['kind']; head: string }> = [
  { kind: 'heap', head: 'Heap' },
  { kind: 'btree', head: 'B-tree' },
  { kind: 'inverted', head: 'Inverted' },
  { kind: 'vector', head: 'Vector' },
]

const sumKind = (e: EngineResult, kind: StorageLine['kind']) =>
  e.storage.breakdown.reduce((s, line) => (line.kind === kind ? s + line.bytes : s), 0)

/**
 * Where the bytes go. The four kinds are the four access-method families the
 * paper compares, so summing the per-relation breakdown by kind turns a list of
 * file names into the cost of each design decision.
 */
export function StorageTable({ capture, n }: Props) {
  const rows = live(capture)
  const cluster = rows.filter((e) => typeof e.storage.clusterBytes === 'number')

  return (
    <>
      <div className="table-wrap">
        <table>
          <caption>
            Table {n}. On-disk size of each store after loading{' '}
            {num(capture.corpus.stats.memories)} memories, with every relation and index attributed
            to one of four kinds and summed. Heap is row storage, B-tree covers primary keys and
            secondary indexes, inverted is the full-text index, vector is the embedding column plus
            any nearest-neighbour index over it. The four kinds sum exactly to the total. Vector
            share is that column as a fraction of the total.
          </caption>
          <thead>
            <tr>
              <th scope="col">Engine</th>
              {KINDS.map((k) => (
                <th scope="col" className="n" key={k.kind}>{k.head}</th>
              ))}
              <th scope="col" className="n">Total</th>
              <th scope="col" className="n">Vector share</th>
              <th scope="col" className="n">Bytes / memory</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const total = e.storage.totalBytes
              const vector = sumKind(e, 'vector')
              return (
                <tr key={e.id}>
                  <EngineHead label={e.label} sub={e.id} />
                  {KINDS.map((k) => {
                    const v = sumKind(e, k.kind)
                    return (
                      <td className="n num" key={k.kind}>
                        {v === 0 ? <No label="none" /> : bytes(v)}
                      </td>
                    )
                  })}
                  <td className="n num">{bytes(total)}</td>
                  <td className="n num">
                    {vector === 0 ? <No label="none" /> : pct(vector / total)}
                  </td>
                  <td className="n num">{num(Math.round(e.bytesPerMemory))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {cluster.length > 0 ? (
        <p className="caption">
          The total is the sum of the measured relation and index sizes. The Postgres arms also
          report a whole-cluster figure, which includes the catalogue, the write-ahead log and
          free space and is therefore not comparable across families:{' '}
          {cluster.map((e, i) => (
            <span key={e.id}>
              {i > 0 ? ', ' : ''}
              <span className="mono">{e.id}</span> {bytes(e.storage.clusterBytes ?? 0)}
            </span>
          ))}
          .
        </p>
      ) : null}
    </>
  )
}

/* ------------------------------------------------------------------ 6. scaling */

type ScalePoint = Capture['scaling'][number]['engines'][number]

/* Five arms, chosen so each row of the table is a different design and not a
   different tuning of the same one: no index, an inverted index in each family,
   and a hybrid in each family. */
const SCALING_IDS = ['file-jsonl', 'sqlite-fts', 'sqlite-hybrid', 'pg-gin', 'pg-hybrid']

/**
 * How each design responds to corpus growth. Latency and size are reported in
 * separate blocks of the same table because they scale for different reasons —
 * one with the work a query does, the other with what the load wrote down.
 */
export function ScalingTable({ capture, n }: Props) {
  const cols = SCALING_IDS
    .map((id) => capture.engines.find((e) => e.id === id))
    .filter((e): e is EngineResult => e !== undefined)
  const width = cols.length + 1

  /* An engine that failed the main run is written to the capture as a stub —
     id, label, family and the reason — so `short` is absent on exactly those
     rows even though the type declares it present. The sweep loads every scale
     independently of the main run, so such a column can still carry real
     measurements: keep it, and label it by the id the reader can cross-
     reference against the other tables. */
  const colLabel = (e: EngineResult) => e.short || e.id

  const at = (scaleIndex: number, id: string): ScalePoint | undefined =>
    capture.scaling[scaleIndex]?.engines.find((x) => x.id === id)

  // flatMap rather than filter-then-map: it narrows `failed` to a string inside
  // the branch, so the footnote can print the reason without an assertion.
  const failures = capture.scaling.flatMap((s) =>
    s.engines.flatMap((e) =>
      e.failed && SCALING_IDS.includes(e.id)
        ? [{ memories: s.memories, id: e.id, failed: e.failed }]
        : [],
    ),
  )

  const blocks: Array<{
    head: string
    cell: (p: ScalePoint | undefined) => ReactNode
  }> = [
    {
      head: `Median query latency, p50 — ${num(capture.k)} results per query`,
      cell: (p) => (p?.p50Ms === undefined ? <No label="not measured" /> : ms(p.p50Ms)),
    },
    {
      head: 'Store size, bytes per memory',
      cell: (p) =>
        p?.bytesPerMemory === undefined
          ? <No label="not measured" />
          : num(Math.round(p.bytesPerMemory)),
    },
  ]

  return (
    <>
      <div className="table-wrap">
        <table>
          <caption>
            Table {n}. {num(cols.length)} architectures re-measured at {capture.scaling.length}{' '}
            corpus sizes, each a fresh load and a fresh query set drawn from the same generator,
            chosen so that each column is a different design rather than a different tuning of the
            same one. Rows are scales,
            labelled by the memories actually produced; columns are engines. The upper block is
            median query latency, the lower block is store size per memory — the two costs that grow
            for different reasons.
          </caption>
          <thead>
            <tr>
              <th scope="col">Scale</th>
              {cols.map((e) => (
                <th scope="col" className="n" key={e.id}>{colLabel(e)}</th>
              ))}
            </tr>
          </thead>
          {blocks.map((b) => (
            <tbody key={b.head}>
              <tr>
                {/* rowgroup, not colgroup: this header spans the full width and
                    names the rows below it inside this <tbody>. colgroup would
                    claim it labels a group of columns, which is the other axis
                    and would make a screen reader announce it on every row of
                    both blocks. */}
                <th
                  scope="rowgroup"
                  colSpan={width}
                  className="label wrap"
                  style={{ background: 'var(--bg-sunken)' }}
                >
                  {b.head}
                </th>
              </tr>
              {capture.scaling.map((s, i) => (
                <tr key={s.target}>
                  <th scope="row" className="wrap">
                    {num(s.memories)} memories
                    <span className="meta" style={{ display: 'block' }}>
                      target {num(s.target)} · {num(s.queries)} queries
                    </span>
                  </th>
                  {cols.map((e) => {
                    const p = at(i, e.id)
                    return (
                      <td className="n num" key={e.id}>
                        {p?.failed ? <span className="pill pill-bad">failed</span> : b.cell(p)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      {failures.length > 0 ? (
        <p className="caption">
          Marked failed:{' '}
          {failures.map((f, i) => (
            <span key={`${f.id}-${f.memories}`}>
              {i > 0 ? '; ' : ''}
              <span className="mono">{f.id}</span> at {num(f.memories)} memories — {f.failed}
            </span>
          ))}
          .
        </p>
      ) : (
        <p className="caption">
          Every arm completed every scale; no cell is marked failed. Latency and size are therefore
          comparable down each column as well as across each row.
        </p>
      )}
    </>
  )
}

/* -------------------------------------------------------------- 7. post-filter */

/**
 * The post-filter sweep — the strongest available defence of a vector-only store,
 * measured to its limit. Overfetch is the only knob, so the table is read as a
 * cost curve: what recall does per unit of extra work.
 */
export function PostFilterTable({ capture, n }: Props) {
  const points = capture.postFilter
  const first = points[0]
  const last = points[points.length - 1]

  return (
    <>
      <div className="table-wrap">
        <table>
          <caption>
            Table {n}. Retrieving k {'×'} overfetch rows by similarity and discarding those that
            fail the predicate, swept across {points.length} overfetch factors on the{' '}
            {num(capture.corpus.stats.memories)}-memory corpus at k = {capture.k}. Slot fill rate is
            the mean number of surviving rows divided by k; scanned is the fraction of the corpus the
            fetch had to touch. Latency is the mean over all queries in the sweep.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="n">Overfetch</th>
              <th scope="col" className="n">Rows fetched</th>
              <th scope="col" className="n">Slot fill rate</th>
              <th scope="col" className="n">Recall</th>
              <th scope="col" className="n">Mean latency</th>
              <th scope="col" className="n">Corpus scanned</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.overfetch}>
                <th scope="row" className="n num">{num(p.overfetch)}{'×'}</th>
                <td className="n num">{num(p.fetched)}</td>
                <td className="n num">{pct(p.slotFillRate)}</td>
                <td className="n num">{pct(p.recall)}</td>
                <td className="n num">{ms(p.meanMs)}</td>
                <td className="n num">{pct(p.scanFraction, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {first && last ? (
        <p className="caption">
          Work grows exactly with overfetch — {num(first.fetched)} rows to{' '}
          {num(last.fetched)}, {num(last.overfetch / first.overfetch)}
          {'×'} — while recall moves from {pct(first.recall)} to {pct(last.recall)}. At the last
          point the fetch already touches {pct(last.scanFraction, 1)} of the corpus and{' '}
          {pct(1 - last.slotFillRate)} of the k slots are still empty: overfetching buys a
          diminishing amount of the answer, because the filter can only remove rows the index
          already ranked, never recover one it did not.
        </p>
      ) : null}
    </>
  )
}

/* -------------------------------------------------------------- 8. durability */

/**
 * A kill test, not a claim about ACID. Each store is written to until it reaches
 * steady state, killed mid-write, then reopened and read: the only column that
 * decides anything is whether the store came back readable.
 */
export function DurabilityTable({ capture, n }: Props) {
  const rows = capture.durability
  const trials = rows.reduce((s, d) => s + d.trials, 0)
  const integrity = rows.filter((d) => d.integrity !== null)

  return (
    <>
      <div className="table-wrap">
        <table>
          <caption>
            Table {n}. {num(trials)} kill trials across {rows.length} store designs. Each trial
            seeds the store, writes until it reaches steady state, kills the process without warning,
            then reopens and reads. Caught mid-write counts trials where the kill landed during a
            write; reopened counts trials where the store opened again at all; unreadable counts
            trials where it did not. Records durable is the mean number of rows still present after
            reopening.
          </caption>
          <thead>
            <tr>
              <th scope="col">Store</th>
              <th scope="col" className="n">Trials</th>
              <th scope="col" className="n">Caught mid-write</th>
              <th scope="col" className="n">Reopened</th>
              <th scope="col" className="n">Unreadable</th>
              <th scope="col" className="n">Records durable</th>
              <th scope="col" className="wrap">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.kind}>
                <th scope="row" className="mono">{d.kind}</th>
                <td className="n num">{num(d.trials)}</td>
                <td className="n num">{num(d.caughtMidWrite)}</td>
                <td className="n num">{num(d.reopenedOk)}</td>
                <td className="n">
                  {/* The one cell that carries a verdict, so it is the one cell
                      that gets state colour — always with the number beside it. */}
                  <span className={d.unreadable > 0 ? 'pill pill-bad' : 'pill pill-ok'}>
                    <span className="num">{num(d.unreadable)}</span>
                  </span>
                </td>
                <td className="n num">{num(Math.round(d.meanDurable))}</td>
                <td className="wrap" style={{ minWidth: '18rem' }}>{d.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="caption">
        Records durable is not comparable across rows: each design was seeded to its own steady
        state, so the count reflects write throughput before the kill rather than how much was
        preserved. What is comparable is the unreadable column, and the outcome text beside it.
        {integrity.length > 0 ? (
          <>
            {' '}Where the engine offers its own consistency check the result is recorded:{' '}
            {integrity.map((d, i) => (
              <span key={d.kind}>
                {i > 0 ? ', ' : ''}
                <span className="mono">{d.kind}</span> {'→'} {d.integrity}
              </span>
            ))}
            .
          </>
        ) : null}
      </p>
    </>
  )
}

/* ------------------------------------------------------------- 9. concurrency */

/**
 * Concurrent writers against one counter. The mechanism column is the finding:
 * the file store does not lose updates because it is a file, it loses them
 * because a whole-document read-modify-write has no way to order two writers.
 */
export function ConcurrencyTable({ capture, n }: Props) {
  const { writers, rounds, results } = capture.concurrency
  const rows = Object.entries(results)

  return (
    <div className="table-wrap">
      <table>
        <caption>
          Table {n}. {num(writers)} concurrent writers, {num(rounds)} increments each, against a
          single counter in each of {rows.length} stores. Expected is writers {'×'} rounds; observed
          is the value read back after every writer finished; lost is the difference. The mechanism
          column names what did — or did not — order the two writers.
        </caption>
        <thead>
          <tr>
            <th scope="col">Store</th>
            <th scope="col" className="n">Expected</th>
            <th scope="col" className="n">Observed</th>
            <th scope="col" className="n">Lost</th>
            <th scope="col" className="n">Lost share</th>
            <th scope="col" className="wrap">Mechanism</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([store, r]) => (
            <tr key={store}>
              <th scope="row" className="mono">{store}</th>
              <td className="n num">{num(r.expected)}</td>
              <td className="n num">{num(r.observed)}</td>
              <td className="n num">{num(r.lost)}</td>
              <td className="n">
                <span className={r.lost > 0 ? 'pill pill-bad' : 'pill pill-ok'}>
                  {/* expected is writers × rounds, so it is only ever zero for a
                      store whose trial never ran — in which case there is no
                      share to report rather than a share of nothing. */}
                  <span className="num">{r.expected > 0 ? pct(r.lost / r.expected) : DASH}</span>
                </span>
              </td>
              <td className="wrap" style={{ minWidth: '22rem' }}>{r.mechanism}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------------------------------------------------------------- 10. anomaly */

/**
 * The update anomaly, measured three ways: how often a fact gets restated, how
 * many rows a correction has to touch under each design, and what fraction of a
 * fact's history a top-k retrieval never reaches — which is the fraction a
 * repair pass cannot fix even if it is perfect.
 */
export function AnomalyTable({ capture, n }: Props) {
  const a = capture.anomaly
  const r = a.restatementsPerFact
  const u = a.rowsToUpdate
  const t = a.topKRepair

  const sections: Array<{ head: string; rows: Array<{ label: string; value: ReactNode }> }> = [
    {
      head: `Restatements per fact — ${num(a.factsWithRestatements)} facts restated at least once`,
      rows: [
        { label: 'Mean', value: dec(r.mean) },
        { label: 'Median', value: num(r.median) },
        { label: '90th percentile', value: num(r.p90) },
        { label: 'Maximum', value: num(r.max) },
      ],
    },
    {
      head: 'Rows a single correction must update',
      rows: [
        { label: 'Normalised — the fact is stored once', value: num(u.normalised) },
        { label: 'Denormalised — mean over restated facts', value: dec(u.denormalisedMean) },
        { label: 'Denormalised — worst case observed', value: num(u.denormalisedMax) },
      ],
    },
    {
      head: `Repair through top-k retrieval — k = ${num(t.k)}, ${num(t.factsProbed)} facts probed`,
      rows: [
        { label: 'Restatements a fact has, mean', value: dec(t.meanTotal) },
        { label: 'Restatements top-k reaches, mean', value: dec(t.meanReached) },
        { label: 'Left stale after a perfect repair', value: pct(t.staleFraction) },
      ],
    },
  ]

  return (
    <>
      <div className="table-wrap">
        <table>
          <caption>
            Table {n}. The cost of a corrected fact, over the{' '}
            {num(capture.corpus.stats.facts)} facts and{' '}
            {num(capture.corpus.stats.memories)} memories of the corpus. A restatement is a later
            memory that supersedes an earlier one about the same fact. The third block assumes a
            repair pass that rewrites every row a top-k retrieval returns and gets every one of them
            right; what it leaves stale is what retrieval never showed it.
          </caption>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col" className="n">Value</th>
            </tr>
          </thead>
          {sections.map((s) => (
            <tbody key={s.head}>
              <tr>
                {/* rowgroup for the same reason as Table 6: the header names
                    the measures in this <tbody>, not a group of columns. */}
                <th
                  scope="rowgroup"
                  colSpan={2}
                  className="label wrap"
                  style={{ background: 'var(--bg-sunken)' }}
                >
                  {s.head}
                </th>
              </tr>
              {s.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="wrap" style={{ fontWeight: 400 }}>{row.label}</th>
                  <td className="n num">{row.value}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <div className="table-wrap">
        <table>
          <caption>
            Table {n}, continued. {num(a.examples.length)} sampled facts from the probe, showing how
            much of each fact&rsquo;s history a single top-{num(t.k)} retrieval reaches. Stale is
            restatements minus reached — rows a repair driven by that retrieval would never see.
          </caption>
          <thead>
            <tr>
              <th scope="col">Fact</th>
              <th scope="col" className="n">Restatements</th>
              <th scope="col" className="n">Reached by top-{num(t.k)}</th>
              <th scope="col" className="n">Left stale</th>
              <th scope="col" className="n">Stale share</th>
            </tr>
          </thead>
          <tbody>
            {a.examples.map((ex) => (
              <tr key={ex.factId}>
                <th scope="row" className="mono">{ex.factId}</th>
                <td className="n num">{num(ex.restatements)}</td>
                <td className="n num">{num(ex.reachedByTopK)}</td>
                <td className="n num">{num(ex.stale)}</td>
                <td className="n num">
                  {ex.stale === 0 ? <No label="none" /> : pct(ex.stale / ex.restatements)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="caption">
        A normalised store updates {num(u.normalised)} row and the correction is complete. Copying
        the fact into every memory that mentions it turns the same correction into{' '}
        {dec(u.denormalisedMean)} rows on average and {num(u.denormalisedMax)} at worst — and since
        top-{num(t.k)} retrieval reaches only {dec(t.meanReached)} of the {dec(t.meanTotal)} rows a
        fact occupies, {pct(t.staleFraction)} of them stay wrong however good the repair is.
      </p>
    </>
  )
}
