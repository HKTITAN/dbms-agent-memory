/* Explanatory diagrams.
 *
 * Five figures, all server components — nothing here holds state, so none of it
 * ships JavaScript. They exist to show mechanism: what the agent loop actually
 * does to a store, what an access method physically *is*, what normalization
 * removes, why a vector index plus a predicate loses answers, and what the
 * bytes on disk are actually spent on.
 *
 * Where a diagram carries a measurement it takes the measurement from `capture`
 * as a prop rather than from a literal, so a number drawn here and the same
 * number in the prose cannot drift. Where a diagram is definitional — a B-tree
 * has leaves whether or not this run happened — it says so in its footer, and
 * the ids and keys in it are schematic.
 *
 * Colour discipline: the four-step --data ramp is the only ramp, and within a
 * figure it encodes exactly one variable — storage kind in the stack, overfetch
 * setting in the post-filter racks. --accent appears once per figure, on the
 * single element that figure exists to point at, and never as the only signal:
 * there is always a word or a shape beside it. Nothing is a gradient and
 * nothing is a literal hex.
 */

import type { CSSProperties, ReactNode } from 'react'
import type { Capture, Family, NormalizationStep, StorageLine } from '@/lib/types'
import { bytes, ms, num, pct } from '@/lib/data'

/* ------------------------------------------------------------ shared atoms */

/** Present in the accessibility tree, absent from the page. */
const SR: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
}

/* Tabular figures on every SVG root: a rank column whose digits are 1px apart
   from row to row reads as noise rather than as an order. */
const SVG_STYLE: CSSProperties = { display: 'block', fontVariantNumeric: 'tabular-nums' }

const MONO = 'var(--font-mono)'

/* ============================================================ 1. memory loop */

/* Node geometry is declared once so the connectors can be derived from it. Hand
   -tuned coordinates in two places is how a diagram ends up with an arrow that
   points at nothing after an edit. */
type LoopBox = { x: number; y: number; w: number; h: number }

const TOP_Y = 26
const TOP_H = 76
const BOT_H = 88

const LOOP: Record<string, LoopBox> = {
  perceive: { x: 44, y: TOP_Y, w: 186, h: TOP_H },
  write: { x: 268, y: TOP_Y, w: 186, h: TOP_H },
  consolidate: { x: 492, y: TOP_Y, w: 186, h: TOP_H },
  recall: { x: 560, y: 346, w: 202, h: BOT_H },
  inject: { x: 300, y: 346, w: 210, h: BOT_H },
  act: { x: 44, y: 352, w: 186, h: 76 },
}

const STORE = { x: 300, y: 150, w: 320, h: 150, ry: 18 }

function LoopNode({
  box, step, title, lines,
}: { box: LoopBox; step: number; title: string; lines: string[] }) {
  return (
    <g>
      <rect
        x={box.x} y={box.y} width={box.w} height={box.h} rx={5}
        fill="var(--bg-raised)" stroke="var(--border-strong)" strokeWidth={1.1}
      />
      <circle cx={box.x + 16} cy={box.y + 17} r={8.5}
        fill="var(--bg-sunken)" stroke="var(--border)" strokeWidth={1} />
      <text x={box.x + 16} y={box.y + 17} textAnchor="middle" dominantBaseline="central"
        fontSize={10} fontWeight={600} fontFamily={MONO} fill="var(--text-secondary)">
        {step}
      </text>
      <text x={box.x + 32} y={box.y + 17} dominantBaseline="central"
        fontSize={12.5} fontWeight={560} fill="var(--text)">
        {title}
      </text>
      {lines.map((l, i) => (
        <text key={l} x={box.x + 14} y={box.y + 40 + i * 14}
          fontSize={9.5} fontFamily={MONO} fill="var(--text-secondary)">
          {l}
        </text>
      ))}
    </g>
  )
}

/**
 * The agent memory cycle, drawn as a circuit around a single store.
 *
 * The claim the geometry makes: step 2 and step 4 are two ends of one object.
 * A vector store that is written by an append and read by a similarity scan has
 * the same shape on a whiteboard and a completely different one in practice —
 * so the store is drawn once, in the middle, with both heavy arrows landing on
 * it, and the light rails around the outside carry everything else.
 *
 * The accent is spent on the k slots inside the context window, because that is
 * the bound most memory designs get wrong: the store's capacity is not what
 * limits recall, the window's is.
 */
export function MemoryLoopDiagram() {
  const s = STORE
  const cxStore = s.x + s.w / 2
  const writeX = LOOP.write.x + LOOP.write.w / 2
  const recallX = LOOP.recall.x + LOOP.recall.w / 2

  /* The k slot outlines inside the context-window node. Ten is the shape of a
     LIMIT, not a measurement — the figure that measures slot occupancy is the
     post-filter one below. */
  const SLOTS = 10
  const rackX = LOOP.inject.x + 14
  const rackW = LOOP.inject.w - 28
  const slotGap = 3
  const slotW = (rackW - (SLOTS - 1) * slotGap) / SLOTS

  return (
    <figure className="figure dia">
      <div className="figure-head">
        <span className="heading-16" style={{ margin: 0 }}>The agent memory cycle</span>
        <span className="meta">write path and recall path, one store</span>
      </div>
      <div className="figure-body">
        <div style={{ overflowX: 'auto', overscrollBehaviorX: 'contain' }}>
          <svg
            viewBox="0 0 880 460" width="100%" style={{ ...SVG_STYLE, minWidth: 560 }}
            role="img"
            aria-label={
              'The agent memory cycle as a loop of six steps: perceive, write inside a transaction, ' +
              'consolidate, recall with a predicate and a rank, inject into the context window, act. ' +
              'The write step and the recall step both connect to a single central store holding the ' +
              'memory rows and every index over them. The context window holds a fixed number of ' +
              'slots, and that number — not the size of the store — bounds what recall may return.'
            }
          >
            <title>Agent memory cycle — write and recall over one store</title>

            <defs>
              {/* Two heads, because the two classes of edge are weighted
                  differently: the store edges are the argument, the rails are
                  the sequence. A marker does not inherit its parent's stroke,
                  so each one carries its own fill. */}
              <marker id="mem-arrow" viewBox="0 0 8 8" refX="6.6" refY="4"
                markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,0.8 L7,4 L0,7.2 Z" fill="var(--text-tertiary)" />
              </marker>
              <marker id="mem-arrow-ink" viewBox="0 0 8 8" refX="6.6" refY="4"
                markerWidth="6.5" markerHeight="6.5" orient="auto">
                <path d="M0,0.8 L7,4 L0,7.2 Z" fill="var(--text)" />
              </marker>
            </defs>

            {/* ---- the outer circuit. Light, because it is only the order. */}
            <g stroke="var(--text-tertiary)" strokeWidth={1.15} fill="none"
              markerEnd="url(#mem-arrow)">
              <path d="M 230 64 L 260 64" />
              <path d="M 454 64 L 484 64" />
              <path d="M 678 64 L 812 64 Q 818 64 818 70 L 818 384 Q 818 390 812 390 L 770 390" />
              <path d="M 560 390 L 518 390" />
              <path d="M 300 390 L 238 390" />
              <path d="M 44 390 L 24 390 Q 18 390 18 384 L 18 70 Q 18 64 24 64 L 36 64" />
            </g>

            {/* ---- the store. Drawn before the nodes so the two heavy edges
                    can tuck under the boxes they leave. */}
            <path
              d={`M ${s.x} ${s.y} L ${s.x} ${s.y + s.h} A ${s.w / 2} ${s.ry} 0 0 0 ${s.x + s.w} ${s.y + s.h} L ${s.x + s.w} ${s.y} Z`}
              fill="var(--bg-sunken)" stroke="var(--border-strong)" strokeWidth={1.3}
            />
            <ellipse cx={cxStore} cy={s.y} rx={s.w / 2} ry={s.ry}
              fill="var(--bg-inset)" stroke="var(--border-strong)" strokeWidth={1.3} />

            <text x={cxStore} y={s.y + 42} textAnchor="middle"
              fontSize={13} fontWeight={600} fontFamily={MONO} letterSpacing="0.06em"
              fill="var(--text)">
              ONE STORE
            </text>
            <text x={cxStore} y={s.y + 62} textAnchor="middle" fontSize={10}
              fill="var(--text-secondary)">
              memory · session · fact · entity rows
            </text>
            <text x={cxStore} y={s.y + 77} textAnchor="middle" fontSize={10}
              fill="var(--text-secondary)">
              and every index built over them
            </text>
            {['B-tree', 'inverted', 'vector'].map((t, i) => (
              <g key={t}>
                <rect x={cxStore - 120 + i * 82} y={s.y + 90} width={76} height={20} rx={3}
                  fill="var(--bg-raised)" stroke="var(--border)" strokeWidth={1} />
                <text x={cxStore - 82 + i * 82} y={s.y + 100} textAnchor="middle"
                  dominantBaseline="central" fontSize={9.5} fontFamily={MONO}
                  fill="var(--text-secondary)">
                  {t}
                </text>
              </g>
            ))}
            <text x={cxStore} y={s.y + 132} textAnchor="middle" fontSize={10}
              fontWeight={560} fill="var(--text)">
              both heavy arrows land here
            </text>

            {/* ---- the two edges that touch the store. The head stops on the
                    lid rather than inside it: an arrow buried in the fill reads
                    as a line that ran out, not as one that arrived. */}
            <path d={`M ${writeX} ${TOP_Y + TOP_H} L ${writeX} ${s.y - s.ry + 2}`}
              fill="none" stroke="var(--text)" strokeWidth={1.7}
              markerEnd="url(#mem-arrow-ink)" />
            <text x={writeX + 8} y={s.y - 34} fontSize={10} fontFamily={MONO}
              fill="var(--text)" fontWeight={600}>
              INSERT
            </text>

            <path
              d={`M ${s.x + s.w} ${s.y + 92} C ${s.x + s.w + 70} ${s.y + 92}, ${recallX} ${s.y + 140}, ${recallX} ${LOOP.recall.y - 8}`}
              fill="none" stroke="var(--text)" strokeWidth={1.7}
              markerEnd="url(#mem-arrow-ink)"
            />
            <text x={s.x + s.w + 52} y={s.y + 152} fontSize={10} fontFamily={MONO}
              fill="var(--text)" fontWeight={600}>
              SELECT
            </text>

            {/* ---- the six stations. */}
            <LoopNode box={LOOP.perceive} step={1} title="perceive"
              lines={['user turn · tool result', 'observation of the world']} />
            <LoopNode box={LOOP.write} step={2} title="write"
              lines={['BEGIN', 'INSERT INTO memory (…)', 'COMMIT']} />
            <LoopNode box={LOOP.consolidate} step={3} title="consolidate"
              lines={['embed · link to fact', 'set superseded_by']} />
            <LoopNode box={LOOP.recall} step={4} title="recall"
              lines={['SELECT … FROM memory', 'WHERE predicate', 'ORDER BY rank LIMIT k']} />
            <LoopNode box={LOOP.act} step={6} title="act"
              lines={['reply · tool call · plan']} />

            {/* Step 5 is drawn by hand rather than through LoopNode: it is the
                only station whose content is a quantity. */}
            <rect x={LOOP.inject.x} y={LOOP.inject.y} width={LOOP.inject.w} height={LOOP.inject.h}
              rx={5} fill="var(--bg-raised)" stroke="var(--accent)" strokeWidth={1.4} />
            <circle cx={LOOP.inject.x + 16} cy={LOOP.inject.y + 17} r={8.5}
              fill="var(--accent-quiet)" stroke="var(--accent-line)" strokeWidth={1} />
            <text x={LOOP.inject.x + 16} y={LOOP.inject.y + 17} textAnchor="middle"
              dominantBaseline="central" fontSize={10} fontWeight={600} fontFamily={MONO}
              fill="var(--accent-text)">
              5
            </text>
            <text x={LOOP.inject.x + 32} y={LOOP.inject.y + 17} dominantBaseline="central"
              fontSize={12.5} fontWeight={560} fill="var(--text)">
              inject into context
            </text>
            <text x={LOOP.inject.x + 14} y={LOOP.inject.y + 38} fontSize={9.5} fontFamily={MONO}
              fill="var(--text-secondary)">
              the window has k slots
            </text>
            {Array.from({ length: SLOTS }, (_, i) => (
              <rect key={i} x={rackX + i * (slotW + slotGap)} y={LOOP.inject.y + 46}
                width={slotW} height={18} rx={2}
                fill="var(--accent-quiet)" stroke="var(--accent-line)" strokeWidth={1} />
            ))}
            <text x={LOOP.inject.x + 14} y={LOOP.inject.y + 78} fontSize={9.5} fontFamily={MONO}
              fill="var(--accent-text)">
              LIMIT k — the budget sets k
            </text>
          </svg>
        </div>

        <ol style={SR}>
          <li>Perceive: a user turn, a tool result, an observation.</li>
          <li>Write: BEGIN, INSERT INTO memory, COMMIT — one transaction.</li>
          <li>Consolidate: embed the text, link it to the fact it restates, set superseded_by on
            anything it replaces. This writes to the same store.</li>
          <li>Recall: SELECT from memory WHERE a predicate holds, ORDER BY a rank, LIMIT k. This
            reads the same store the write path wrote.</li>
          <li>Inject into the context window, which has k slots. The context budget fixes k; the
            size of the store does not.</li>
          <li>Act: reply, call a tool, or plan — which produces the next perception and closes the
            loop.</li>
        </ol>
      </div>
      <div className="figure-foot">
        Heavy arrows touch the store; light arrows carry sequence only. The write path (2) and the
        recall path (4) are two ends of one object — the same rows, the same indexes, the same
        transaction log. Highlighted: the k slots of the context window. Recall is bounded by that
        budget rather than by what the store holds, which is why the cost of a wrong answer is a
        slot spent, not a row missed. Schematic; no measurement is encoded in this figure.
      </div>
    </figure>
  )
}

/* ========================================================= 2. index anatomy */

function Panel({
  title, kind, answers, cannot, children,
}: {
  title: string; kind: string; answers: string; cannot: string; children: ReactNode
}) {
  return (
    <div className="dia-node" style={{ minWidth: 0 }}>
      <h3 className="heading-16" style={{ margin: '0 0 0.0625rem' }}>{title}</h3>
      <p className="meta" style={{ margin: '0 0 0.5rem' }}>{kind}</p>
      {children}
      <p className="label" style={{ margin: '0.625rem 0 0', color: 'var(--text)' }}>
        <span style={{ color: 'var(--text-faint)' }}>answers </span>{answers}
      </p>
      <p className="label" style={{ margin: '0.3125rem 0 0', color: 'var(--text-tertiary)' }}>
        <span style={{ color: 'var(--text-faint)' }}>cannot </span>{cannot}
      </p>
    </div>
  )
}

/* One geometry for all three panels, so the eye can compare them without also
   compensating for three different scales. */
const PANEL_VB = '0 0 300 250'

function BtreePanel() {
  const leaves = [
    { x: 4, keys: '03 · 07 · 11', hot: false },
    { x: 106, keys: '12 · 14 · 18', hot: true },
    { x: 208, keys: '19 · 22 · 27', hot: true },
  ]
  return (
    <svg viewBox={PANEL_VB} width="100%" style={SVG_STYLE} role="img"
      aria-label={
        'A two-level B-tree over ordered day keys. One internal node holds the separator keys ' +
        '12 and 19 and points at three leaf pages holding 03 07 11, 12 14 18 and 19 22 27. The ' +
        'leaves are chained left to right. The highlighted path descends once to the leaf ' +
        'containing 12 and then walks the chain into the next leaf, which is how a range scan ' +
        'for created_day between 12 and 19 is answered.'
      }>
      <title>B-tree — ordered keys, one descent then a leaf walk</title>

      <text x={150} y={12} textAnchor="middle" fontSize={9} fill="var(--text-faint)">
        internal node — separator keys
      </text>

      {/* edges, drawn first; the middle one is the descent the query takes */}
      <path d="M 97 46 L 48 108" stroke="var(--text-tertiary)" strokeWidth={1.1} fill="none" />
      <path d="M 203 46 L 252 108" stroke="var(--text-tertiary)" strokeWidth={1.1} fill="none" />
      <path d="M 150 46 L 150 108" stroke="var(--accent)" strokeWidth={2} fill="none" />

      <rect x={84} y={18} width={132} height={28} rx={3}
        fill="var(--bg-raised)" stroke="var(--border-strong)" strokeWidth={1.2} />
      {[110, 134, 166, 190].map((x) => (
        <line key={x} x1={x} y1={18} x2={x} y2={46} stroke="var(--border)" strokeWidth={1} />
      ))}
      <text x={122} y={32} textAnchor="middle" dominantBaseline="central" fontSize={11}
        fontFamily={MONO} fontWeight={600} fill="var(--text)">12</text>
      <text x={178} y={32} textAnchor="middle" dominantBaseline="central" fontSize={11}
        fontFamily={MONO} fontWeight={600} fill="var(--text)">19</text>

      {/* leaf chain — the pointer that makes a range scan cheap */}
      <path d="M 92 150 L 104 150" stroke="var(--text-tertiary)" strokeWidth={1.1} />
      <path d="M 194 150 L 206 150" stroke="var(--accent)" strokeWidth={2} />
      <path d="M 202 147 L 208 150 L 202 153 Z" fill="var(--accent)" />

      {leaves.map((l) => (
        <g key={l.x}>
          <rect x={l.x} y={112} width={88} height={40} rx={3}
            fill={l.hot ? 'var(--accent-quiet)' : 'var(--bg-raised)'}
            stroke={l.hot ? 'var(--accent)' : 'var(--border-strong)'}
            strokeWidth={l.hot ? 1.5 : 1.1} />
          <text x={l.x + 44} y={128} textAnchor="middle" fontSize={10.5} fontFamily={MONO}
            fill="var(--text)">{l.keys}</text>
          <text x={l.x + 44} y={143} textAnchor="middle" fontSize={8.5}
            fill="var(--text-tertiary)">→ row pointers</text>
        </g>
      ))}

      <text x={150} y={172} textAnchor="middle" fontSize={9} fill="var(--text-faint)">
        leaf pages — keys in order, chained
      </text>
      <text x={6} y={200} fontSize={10.5} fontFamily={MONO} fill="var(--accent-text)">
        created_day BETWEEN 12 AND 19
      </text>
      <text x={6} y={218} fontSize={10} fill="var(--text-secondary)">
        Descend once, then walk the chain.
      </text>
      <text x={6} y={234} fontSize={10} fill="var(--text-secondary)">
        Cost is the answer, not the table.
      </text>
    </svg>
  )
}

function InvertedPanel() {
  const rows = [
    { term: 'latency', posts: ['m14', 'm61'], hot: false },
    { term: 'restart', posts: ['m07', 'm14', 'm88'], hot: false },
    { term: 'svc-4470', posts: ['m14', 'm61', 'm88'], hot: true },
    { term: 'timeout', posts: ['m14', 'm61'], hot: true },
  ]
  const hits = ['m14', 'm61']
  return (
    <svg viewBox={PANEL_VB} width="100%" style={SVG_STYLE} role="img"
      aria-label={
        'A term dictionary of four sorted terms — latency, restart, svc-4470, timeout — each ' +
        'mapping to a posting list of memory ids. The lists for svc-4470 and timeout are ' +
        'highlighted, and the two ids they share, m14 and m61, are the result of intersecting ' +
        'them. A conjunctive term query is answered by intersecting posting lists and ranking ' +
        'the survivors by BM25.'
      }>
      <title>Inverted index — term dictionary and posting lists</title>

      <text x={6} y={12} fontSize={9} fill="var(--text-faint)">term dictionary</text>
      <text x={118} y={12} fontSize={9} fill="var(--text-faint)">posting lists — memory ids</text>

      {rows.map((r, i) => {
        const y = 24 + i * 32
        return (
          <g key={r.term}>
            <rect x={6} y={y} width={98} height={24} rx={3}
              fill={r.hot ? 'var(--accent-quiet)' : 'var(--bg-raised)'}
              stroke={r.hot ? 'var(--accent)' : 'var(--border-strong)'}
              strokeWidth={r.hot ? 1.4 : 1.1} />
            <text x={14} y={y + 12} dominantBaseline="central" fontSize={10.5} fontFamily={MONO}
              fill="var(--text)">{r.term}</text>
            <line x1={104} y1={y + 12} x2={116} y2={y + 12}
              stroke="var(--text-tertiary)" strokeWidth={1} />
            {r.posts.map((p, j) => {
              const on = r.hot && hits.includes(p)
              return (
                <g key={p}>
                  <rect x={118 + j * 46} y={y + 3} width={40} height={18} rx={2}
                    fill={on ? 'var(--accent-quiet)' : 'var(--bg-sunken)'}
                    stroke={on ? 'var(--accent)' : 'var(--border)'} strokeWidth={1} />
                  <text x={138 + j * 46} y={y + 12} textAnchor="middle" dominantBaseline="central"
                    fontSize={9.5} fontFamily={MONO}
                    fill={on ? 'var(--accent-text)' : 'var(--text-secondary)'}>{p}</text>
                </g>
              )
            })}
          </g>
        )
      })}

      {/* the intersection bracket spans exactly the two highlighted rows */}
      <path d="M 266 91 L 272 91 L 272 141 L 266 141" fill="none"
        stroke="var(--accent)" strokeWidth={1.3} />
      <text x={278} y={116} dominantBaseline="central" fontSize={12} fontFamily={MONO}
        fill="var(--accent-text)">∩</text>

      <text x={6} y={176} fontSize={10.5} fontFamily={MONO} fill="var(--accent-text)">
        MATCH &#39;svc-4470 AND timeout&#39;
      </text>
      <text x={6} y={196} fontSize={10} fill="var(--text-secondary)">
        Intersect the two lists → {'{'}{hits.join(', ')}{'}'}.
      </text>
      <text x={6} y={214} fontSize={10} fill="var(--text-secondary)">
        Rank the survivors by BM25.
      </text>
      <text x={6} y={232} fontSize={10} fill="var(--text-tertiary)">
        The dictionary holds strings, not meaning.
      </text>
    </svg>
  )
}

function HnswPanel() {
  /* Nodes keep their x across layers, because in HNSW a node present in layer l
     is the same node in every layer below it. Drawing them offset would make
     the descent look like a hand-off between structures rather than a zoom. */
  const L0 = [
    [26, 188], [50, 178], [74, 194], [98, 182], [122, 196], [146, 180],
    [170, 192], [194, 178], [218, 190], [242, 180], [266, 194], [288, 184],
  ]
  const L1 = [[50, 114], [98, 120], [146, 110], [194, 118], [242, 112], [288, 116]]
  const L2 = [[50, 48], [146, 44], [242, 50]]

  /* --border, not --data-grid: these edges *are* the structure the panel exists
     to show, and the gridline token is tuned to disappear. At 0.08 alpha the
     graph read as three rows of loose dots in light mode. */
  const edge = (a: number[], b: number[], key: string) => (
    <line key={key} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
      stroke="var(--border)" strokeWidth={1.2} />
  )

  /* entry → coarse hops → drop → refine → drop → nearest */
  const PATH: number[][] = [
    L2[0], L2[1], L2[2], L1[4], L1[5], L0[11], L0[10],
  ]
  const target = L0[10]

  return (
    <svg viewBox={PANEL_VB} width="100%" style={SVG_STYLE} role="img"
      aria-label={
        'A three-layer HNSW proximity graph. The sparse top layer holds three nodes, the middle ' +
        'layer six, and the bottom layer all twelve; a node keeps its position across layers. ' +
        'The highlighted greedy descent starts at the entry point in the top layer, moves right ' +
        'through two coarse hops, drops into the middle layer, moves once more, drops into the ' +
        'bottom layer and arrives at the node nearest the query point q. Edges encode cosine ' +
        'proximity between vectors and nothing else.'
      }>
      <title>HNSW — layered proximity graph and greedy descent</title>

      {/* Bands, so "layered" is legible before a single edge is traced. Without
          them three rows of dots read as one scatter drawn three times. */}
      {[26, 94, 162].map((y) => (
        <rect key={y} x={18} y={y + 6} width={278} height={34} rx={4}
          fill="var(--bg-sunken)" />
      ))}
      {[['layer 2', 26], ['layer 1', 94], ['layer 0', 162]].map(([t, y]) => (
        <text key={String(t)} x={6} y={Number(y)} fontSize={9} fill="var(--text-faint)">{t}</text>
      ))}

      {/* in-layer edges */}
      <g>
        {edge(L2[0], L2[1], 'e20')}
        {edge(L2[1], L2[2], 'e21')}
        {[[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [1, 3], [2, 4]].map(([a, b]) =>
          edge(L1[a], L1[b], `e1-${a}-${b}`))}
        {[[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10],
          [10, 11], [0, 2], [1, 3], [4, 6], [5, 8], [7, 10], [9, 11]].map(([a, b]) =>
            edge(L0[a], L0[b], `e0-${a}-${b}`))}
      </g>

      {/* the same node, seen from two layers */}
      {[[L2[0], L1[0]], [L2[1], L1[2]], [L2[2], L1[4]], [L1[5], L0[11]],
        [L1[0], L0[1]], [L1[2], L0[5]]].map(([a, b], i) => (
          <line key={`d${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
            stroke="var(--border-faint)" strokeWidth={1} strokeDasharray="2 3" />
      ))}

      <path d={PATH.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ')}
        fill="none" stroke="var(--accent)" strokeWidth={2}
        strokeLinejoin="round" strokeLinecap="round" />

      {[L0, L1, L2].flatMap((layer, li) =>
        layer.map((p, i) => (
          <circle key={`n${li}-${i}`} cx={p[0]} cy={p[1]} r={4}
            fill="var(--bg-raised)" stroke="var(--text-tertiary)" strokeWidth={1.1} />
        )))}

      <circle cx={L2[0][0]} cy={L2[0][1]} r={5.5} fill="var(--bg-raised)"
        stroke="var(--accent)" strokeWidth={2} />
      <text x={L2[0][0]} y={32} textAnchor="middle" fontSize={9}
        fill="var(--accent-text)">entry</text>

      <circle cx={target[0]} cy={target[1]} r={5.5} fill="var(--accent)" />
      <line x1={target[0] + 8} y1={target[1] + 10} x2={target[0] + 2} y2={target[1] + 5}
        stroke="var(--accent-line)" strokeWidth={1} strokeDasharray="2 2" />
      <text x={target[0] + 10} y={target[1] + 15} fontSize={11} fontFamily={MONO}
        fontWeight={600} fill="var(--accent-text)">q</text>

      <text x={6} y={224} fontSize={10.5} fontFamily={MONO} fill="var(--accent-text)">
        ORDER BY embedding &lt;=&gt; q
      </text>
      <text x={6} y={242} fontSize={10} fill="var(--text-secondary)">
        Coarse layer first, then refine.
      </text>
    </svg>
  )
}

/**
 * What each access method physically is.
 *
 * This is the figure the per-class results hang off. A B-tree is a search over
 * an order, so it answers ranges on a column and nothing about the text. An
 * inverted index is a dictionary of strings, so it answers term conjunctions
 * and nothing about paraphrase. An HNSW graph is built from vectors alone, so
 * it answers nearest-neighbour and cannot see a column at all — which is why
 * the pure-vector arms collapse on the structural classes, and why a predicate
 * over a vector index has to be applied after the fact.
 */
export function IndexAnatomyDiagram() {
  return (
    <figure className="figure dia">
      <div className="figure-head">
        <span className="heading-16" style={{ margin: 0 }}>What an access method physically is</span>
        <span className="meta">B-tree · inverted · HNSW</span>
      </div>
      <div className="figure-body">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 'clamp(1rem, 2.5vw, 1.75rem)',
          }}
        >
          <Panel
            title="B-tree"
            kind="balanced search tree over one ordered key"
            answers="ranges and equalities on the indexed column, in key order"
            cannot="anything about what the text says — the key is a value, not a meaning"
          >
            <BtreePanel />
          </Panel>
          <Panel
            title="Inverted index"
            kind="term dictionary → posting lists"
            answers="documents containing given terms, ranked by term statistics"
            cannot="a paraphrase that shares no term — nothing files it under the query's words"
          >
            <InvertedPanel />
          </Panel>
          <Panel
            title="HNSW"
            kind="layered proximity graph over vectors"
            answers="approximate nearest neighbours of a query vector under cosine distance"
            cannot="a predicate on any column — the graph never saw one, so filtering happens after"
          >
            <HnswPanel />
          </Panel>
        </div>
      </div>
      <div className="figure-foot">
        Highlighted in each panel: the traversal the structure was built to make cheap. Keys, terms
        and memory ids are schematic — these three panels are definitional, not measured. They are
        the reason the per-class results split the way they do: each structure answers exactly the
        query shape its traversal expresses, and degrades to a scan for every other shape.
      </div>
    </figure>
  )
}

/* ==================================================== 3. normalization ladder */

/**
 * UNF → BCNF as a ladder, with the anomaly as the payload.
 *
 * HTML rather than SVG on purpose: the rungs are mostly prose, and prose in an
 * SVG is unselectable, unsearchable, and renders at whatever size the viewBox
 * scale happens to produce. The only drawn marks are the rail and its arrowhead.
 *
 * The emphasis is deliberate. A database course reads this ladder as a sequence
 * of definitions; an agent-memory reader needs the other column — what goes
 * wrong in the store if you stop here — so that is what gets the accent, the
 * larger type and the box, and the rule that was violated is set as the quiet
 * supporting line.
 */
export function NormalizationLadder({ steps }: { steps: NormalizationStep[] }) {
  /* A capture written before the normalization walk existed carries no steps;
     an empty ladder is a heading over nothing, so draw nothing. */
  if (steps.length === 0) return null

  return (
    <figure className="figure dia dia-tall">
      <div className="figure-head">
        <span className="heading-16" style={{ margin: 0 }}>Normalization ladder</span>
        <span className="meta">{steps.length} rungs · UNF → BCNF</span>
      </div>
      <div className="figure-body">
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {steps.map((step, i) => {
            const terminal = step.violation === null && step.anomaly === null
            const last = i === steps.length - 1
            const open = step.relation.indexOf('(')
            const relName = open > 0 ? step.relation.slice(0, open) : step.relation
            const relAttrs = open > 0 ? step.relation.slice(open) : ''

            return (
              <li
                key={step.form}
                className="dia-node"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '56px minmax(0, 1fr)',
                  gap: '0.875rem',
                  marginBottom: last ? 0 : '1.25rem',
                }}
              >
                <div style={{ position: 'relative' }}>
                  {/* Terminal rung inverts rather than recolouring, so the end of
                      the ladder survives greyscale and print. */}
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
                  {/* The rail and its arrowhead are positioned against the
                      bottom of this column, which is only where it looks in the
                      two-column layout. Print flattens every grid inside a
                      diagram so the figure can paginate (see the `.dia` rules in
                      globals.css), leaving this column the height of the badge
                      alone — and a rail measured from its bottom lands on top of
                      the relation name. Print gets the badges in sequence
                      instead, which reads as a ladder without the ink. */}
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
                        anomaly it leaves behind
                      </span>
                      <span style={{ fontSize: '0.9375rem', lineHeight: 1.5, color: 'var(--text)' }}>
                        {step.anomaly}
                      </span>
                    </div>
                  ) : (
                    <div style={{ marginTop: '0.625rem', display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span className="pill pill-ok">terminal form</span>
                      <span style={{ fontSize: '0.9375rem', lineHeight: 1.5, color: 'var(--text)' }}>
                        No anomaly is left to remove: every determinant is a candidate key.
                      </span>
                    </div>
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
                </div>
              </li>
            )
          })}
        </ol>
      </div>
      <div className="figure-foot">
        Each rung names the form the relation is <em>already</em> in, the rule the next form imposes,
        and the anomaly that survives until you climb. Read the accented boxes alone and you have the
        argument: an unnormalised memory store does not merely waste bytes, it stores the same claim
        many times, and every stale copy is a sentence the agent will retrieve and believe.
      </div>
    </figure>
  )
}

/* ========================================================= 4. post-filtering */

/* Which of the top-k candidates satisfy the predicate is illustrative; how many
   of them do is measured. This fixed preference order decides which ranks are
   drawn as survivors — it puts rank 1 near the end, because the case worth
   teaching is the one where the nearest neighbour is the wrong row. */
const SURVIVOR_ORDER = [1, 3, 4, 7, 9, 2, 5, 8, 0, 6]

export function PostFilterDiagram({ capture }: { capture: Capture }) {
  const rows = capture.postFilter
  const lo = rows[0]
  const hi = rows[rows.length - 1]
  const k = capture.k
  /* `!(k >= 1)` rather than `k < 1`, so a capture that never wrote k lands here
     instead of dividing the rack by NaN further down. */
  if (!lo || !hi || !(k >= 1)) return null

  /* Whether latency tracks overfetch is a claim the footer makes, so it is read
     off the table rather than asserted — a re-run that reverses it rewrites the
     sentence instead of falsifying it. When it does *not* order, first → last is
     not the sweep: report the observed range, or the parenthetical understates
     a spread it was meant to disclose. */
  const latencyOrders = rows.every((r, i) => i === 0 || r.meanMs >= rows[i - 1].meanMs)
  const latencySpan = latencyOrders
    ? `${ms(lo.meanMs)} → ${ms(hi.meanMs)}`
    : `${ms(Math.min(...rows.map((r) => r.meanMs)))}–${ms(Math.max(...rows.map((r) => r.meanMs)))}`

  /* SURVIVOR_ORDER names ten ranks. A capture with k above that has more slots
     than the illustration can place, so clamp to what is drawable — otherwise
     the footer's "rounded to N survivors in the drawing" names an N larger than
     the number of survivors actually drawn. */
  const ranks = SURVIVOR_ORDER.filter((r) => r < k)
  const survivorCount = Math.min(Math.round(lo.meanSurvivingSlots), ranks.length)
  const survivors = ranks.slice(0, survivorCount).sort((a, b) => a - b)
  const isSurvivor = (i: number) => survivors.includes(i)

  /* One measured setting means lo and hi are the same row; drawing it twice is
     two identical racks under one React key. */
  const racks = lo === hi ? [lo] : [lo, hi]

  const Y0 = 52
  const PITCH = 28
  const ROW_H = 22
  const cy = (i: number) => Y0 + i * PITCH + ROW_H / 2
  const lastBottom = Y0 + (k - 1) * PITCH + ROW_H

  const RACK_X = 248
  const RACK_W = 480
  const rackFill = (slots: number) => (slots / k) * RACK_W

  return (
    <figure className="figure dia">
      <div className="figure-head">
        <span className="heading-16" style={{ margin: 0 }}>Post-filtering loses answers</span>
        <span className="meta">k = {k} · measured over {num(rows.length)} overfetch settings</span>
      </div>
      <div className="figure-body">
        <div style={{ overflowX: 'auto', overscrollBehaviorX: 'contain' }}>
          <svg
            viewBox="0 0 860 500" width="100%" style={{ ...SVG_STYLE, minWidth: 560 }}
            role="img"
            aria-label={
              `A vector index returns ${k} candidates ranked by cosine. The predicate is applied ` +
              `afterwards, so candidates that fail it are discarded and the answer of ${k} slots is ` +
              `filled only by the survivors, leaving the remaining slots empty. Measured: at ` +
              `overfetch ${lo.overfetch}, ${lo.meanSurvivingSlots} of ${k} slots fill on average and ` +
              `recall is ${pct(lo.recall)}; at overfetch ${hi.overfetch}, ${hi.meanSurvivingSlots} ` +
              `of ${k} slots fill and recall is ${pct(hi.recall)}.`
            }
          >
            <title>Post-filtering a vector index — unfilled answer slots</title>
            <defs>
              {/* An empty slot has to look empty in greyscale and in print, so it
                  is hatched rather than tinted. */}
              <pattern id="pf-empty" width="6" height="6" patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--data-grid)" strokeWidth="2.5" />
              </pattern>
            </defs>

            <text x={26} y={30} fontSize={10.5} fontWeight={560} fill="var(--text-secondary)">
              ① nearest neighbours, ranked
            </text>
            <text x={300} y={30} textAnchor="middle" fontSize={10.5} fontWeight={560}
              fill="var(--text-secondary)">
              ② predicate
            </text>
            <text x={470} y={30} fontSize={10.5} fontWeight={560} fill="var(--text-secondary)">
              ③ answer — k = {k} slots
            </text>

            <text x={16} y={(Y0 + lastBottom) / 2} textAnchor="middle" fontSize={9}
              fill="var(--text-faint)"
              transform={`rotate(-90 16 ${(Y0 + lastBottom) / 2})`}>
              cosine rank ↓
            </text>

            {/* the gate: the predicate is a wall the index never saw */}
            <line x1={300} y1={42} x2={300} y2={lastBottom + 14}
              stroke="var(--border-strong)" strokeWidth={1.2} strokeDasharray="4 4" />

            {/* connectors first so the boxes sit on top of them */}
            {Array.from({ length: k }, (_, i) => {
              if (!isSurvivor(i)) {
                return (
                  <g key={`x${i}`}>
                    <line x1={224} y1={cy(i)} x2={292} y2={cy(i)}
                      stroke="var(--text-faint)" strokeWidth={1} strokeDasharray="3 3" />
                    <path d={`M ${296} ${cy(i) - 4} L ${304} ${cy(i) + 4} M ${304} ${cy(i) - 4} L ${296} ${cy(i) + 4}`}
                      stroke="var(--text-tertiary)" strokeWidth={1.3} />
                  </g>
                )
              }
              const slot = survivors.indexOf(i)
              return (
                <path key={`c${i}`}
                  d={`M 224 ${cy(i)} C 300 ${cy(i)}, 400 ${cy(slot)}, 466 ${cy(slot)}`}
                  fill="none" stroke="var(--text-tertiary)" strokeWidth={1.1} />
              )
            })}

            {/* ① the ranked candidate list */}
            {Array.from({ length: k }, (_, i) => {
              const keep = isSurvivor(i)
              return (
                <g key={`r${i}`}>
                  <rect x={26} y={Y0 + i * PITCH} width={196} height={ROW_H} rx={3}
                    fill="var(--bg-raised)"
                    stroke={keep ? 'var(--border-strong)' : 'var(--border-faint)'}
                    strokeWidth={1} />
                  <text x={38} y={cy(i)} dominantBaseline="central" fontSize={10} fontFamily={MONO}
                    fill={keep ? 'var(--text)' : 'var(--text-faint)'}>
                    #{i + 1}
                  </text>
                  <text x={68} y={cy(i)} dominantBaseline="central" fontSize={9.5}
                    fill={keep ? 'var(--text-secondary)' : 'var(--text-faint)'}>
                    {keep ? 'predicate holds' : 'predicate fails — discarded'}
                  </text>
                </g>
              )
            })}

            {/* ③ the answer slots */}
            {Array.from({ length: k }, (_, j) => {
              const filled = j < survivors.length
              const from = filled ? survivors[j] : null
              return (
                <g key={`s${j}`}>
                  <rect x={470} y={Y0 + j * PITCH} width={250} height={ROW_H} rx={3}
                    fill={filled ? 'var(--bg-raised)' : 'url(#pf-empty)'}
                    stroke={filled ? 'var(--border-strong)' : 'var(--accent)'}
                    strokeWidth={filled ? 1 : 1.3}
                    strokeDasharray={filled ? undefined : '4 3'} />
                  <text x={482} y={cy(j)} dominantBaseline="central" fontSize={10} fontFamily={MONO}
                    fill={filled ? 'var(--text)' : 'var(--accent-text)'}>
                    {j + 1}
                  </text>
                  <text x={504} y={cy(j)} dominantBaseline="central" fontSize={9.5}
                    fill={filled ? 'var(--text-secondary)' : 'var(--accent-text)'}>
                    {filled && from !== null
                      ? `filled from candidate #${from + 1}`
                      : 'empty — no candidate reaches this slot'}
                  </text>
                </g>
              )
            })}

            {/* the bracket is the finding, so it gets the accent and a word */}
            <path
              d={`M 728 ${Y0 + survivors.length * PITCH + 2} L 736 ${Y0 + survivors.length * PITCH + 2} L 736 ${lastBottom - 2} L 728 ${lastBottom - 2}`}
              fill="none" stroke="var(--accent)" strokeWidth={1.4}
            />
            <text x={744} y={(Y0 + survivors.length * PITCH + lastBottom) / 2 - 6}
              fontSize={10} fontWeight={560} fill="var(--accent-text)">
              {k - survivors.length} of {k}
            </text>
            <text x={744} y={(Y0 + survivors.length * PITCH + lastBottom) / 2 + 8}
              fontSize={10} fontWeight={560} fill="var(--accent-text)">
              slots empty
            </text>

            {/* ---- the measured half */}
            <line x1={26} y1={352} x2={834} y2={352} stroke="var(--border)" strokeWidth={1} />
            <text x={26} y={376} fontSize={10.5} fontWeight={560} fill="var(--text-secondary)">
              measured — mean answer slots filled, of k = {k}
            </text>

            {racks.map((row, i) => {
              const top = 396 + i * 40
              return (
                <g key={`rack-${i}`}>
                  <text x={26} y={top + 12} dominantBaseline="central" fontSize={10.5}
                    fontFamily={MONO} fill="var(--text-secondary)">
                    overfetch ×{num(row.overfetch)} · {num(row.fetched)} fetched
                  </text>
                  {/* zero baseline: the rack starts at RACK_X for both rows and
                      one slot is one tenth of it, so the two bars are directly
                      comparable and comparable to the racks above. */}
                  <rect x={RACK_X} y={top} width={RACK_W} height={24} rx={2}
                    fill="var(--bg-sunken)" stroke="var(--border-faint)" strokeWidth={1} />
                  <rect x={RACK_X} y={top} width={rackFill(row.meanSurvivingSlots)} height={24}
                    rx={2} fill={i === 1 ? 'var(--data-3)' : 'var(--data-2)'} />
                  {/* Ticks last, over the fill as well as the gap: the reader is
                      counting slots, and half a ruler cannot be counted. */}
                  {Array.from({ length: k - 1 }, (_, t) => (
                    <line key={t} x1={RACK_X + ((t + 1) / k) * RACK_W} y1={top}
                      x2={RACK_X + ((t + 1) / k) * RACK_W} y2={top + 24}
                      stroke="var(--bg-raised)" strokeWidth={1} />
                  ))}
                  <text x={RACK_X + rackFill(row.meanSurvivingSlots) + 8} y={top + 12}
                    dominantBaseline="central" fontSize={10.5} fontFamily={MONO}
                    fill="var(--text)" fontWeight={600}>
                    {row.meanSurvivingSlots.toFixed(2)}
                  </text>
                  <text x={RACK_X + RACK_W + 12} y={top + 12} dominantBaseline="central"
                    fontSize={10.5} fontFamily={MONO} fill="var(--text-secondary)">
                    recall {pct(row.recall)}
                  </text>
                </g>
              )
            })}

            <text x={26} y={488} fontSize={10} fill="var(--text-secondary)">
              Fetching {num(hi.overfetch)}× more candidates still leaves{' '}
              {(k - hi.meanSurvivingSlots).toFixed(2)} of {k} slots empty.
            </text>
          </svg>
        </div>

        <table style={SR}>
          <caption>
            Measured post-filtering over a vector index at k = {k}: candidates fetched, mean answer
            slots filled, slot fill rate, recall, and the fraction of the corpus scanned, per
            overfetch multiplier.
          </caption>
          <thead>
            <tr>
              <th scope="col">Overfetch multiplier</th>
              <th scope="col" className="n">Candidates fetched</th>
              <th scope="col" className="n">Mean slots filled (of {k})</th>
              <th scope="col" className="n">Slot fill rate (%)</th>
              <th scope="col" className="n">Recall (%)</th>
              <th scope="col" className="n">Corpus scanned (%)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.overfetch}>
                <th scope="row">{num(r.overfetch)}</th>
                <td className="n">{num(r.fetched)}</td>
                <td className="n">{r.meanSurvivingSlots.toFixed(2)}</td>
                <td className="n">{pct(r.slotFillRate)}</td>
                <td className="n">{pct(r.recall)}</td>
                <td className="n">{pct(r.scanFraction, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="figure-foot">
        Which candidates satisfy the predicate is schematic; how many of them do is measured —{' '}
        {lo.meanSurvivingSlots} of {k}, rounded to {survivorCount} survivors in the drawing. The
        index ranks on cosine alone, so the predicate can only be applied to what it already
        returned: every discarded candidate is a slot the answer never fills. Overfetching buys back
        {' '}{(hi.meanSurvivingSlots - lo.meanSurvivingSlots).toFixed(2)} slots and{' '}
        {pct(hi.recall - lo.recall)} of recall for {pct(hi.scanFraction, 1)} of the corpus scanned
        per query. Mean latency {latencyOrders ? 'rises with' : 'does not order with'} overfetch
        across the {rows.length} settings ({latencySpan}), so at this corpus size the price is paid
        in recall rather than in time. Pushing the predicate below the index instead of above it is
        the only version of this that terminates.
      </div>
    </figure>
  )
}

/* ========================================================== 5. storage stack */

const KINDS = ['heap', 'btree', 'inverted', 'vector'] as const
type Kind = (typeof KINDS)[number]

/* The ramp is ordered heap → vector by increasing weight, so the segment that
   dominates every vector-bearing arm is also the darkest one on the bar. It
   survives greyscale for the same reason. */
const KIND_TONE: Record<Kind, string> = {
  heap: 'var(--data-1)',
  btree: 'var(--data-2)',
  inverted: 'var(--data-3)',
  vector: 'var(--data-4)',
}

const KIND_LABEL: Record<Kind, string> = {
  heap: 'heap (the rows)',
  btree: 'B-tree',
  inverted: 'inverted',
  vector: 'vector (embeddings + graph)',
}

const FAMILY_ORDER: Family[] = ['file', 'sqlite', 'postgres']

const MIB = 1024 ** 2

function sumByKind(lines: StorageLine[]): Record<Kind, number> {
  const out: Record<Kind, number> = { heap: 0, btree: 0, inverted: 0, vector: 0 }
  for (const l of lines) out[l.kind] += l.bytes
  return out
}

/** A step that lands 5–8 gridlines on the axis, whatever the corpus size is. */
function niceStep(maxMb: number): number {
  for (const s of [0.5, 1, 2, 5, 10, 20, 50, 100]) if (maxMb / s <= 8) return s
  return 200
}

/**
 * On-disk bytes per engine, segmented by what the bytes are for.
 *
 * One shared zero-based axis across all ten arms rather than ten bars each
 * normalised to their own width: composition alone would hide the result, which
 * is that turning an index on does not shift a proportion, it multiplies the
 * store. Grouped by family so the within-family comparison — the same rows,
 * different access methods — is adjacent.
 */
export function StorageStackDiagram({ capture }: { capture: Capture }) {
  const live = capture.engines.filter((e) => !e.failed)
  /* Math.max of nothing is -Infinity, which would draw a frame of NaN rather
     than fail; a run where every arm errored has no figure to draw. */
  if (live.length === 0) return null

  const maxMb = Math.max(...live.map((e) => e.storage.totalBytes)) / MIB
  const step = niceStep(maxMb)
  /* Floor at one step: an axis that ends at zero divides every segment width by
     zero, and a fast capture that reports no sizes should still draw the frame. */
  const axisMax = Math.max(Math.ceil(maxMb / step) * step, step)
  const ticks = Math.round(axisMax / step)

  const PX0 = 196
  const PW = 594
  const ROW_H = 30
  const BAR_H = 18
  const HEAD_H = 26
  const x = (mb: number) => PX0 + (mb / axisMax) * PW

  /* Lay the rows out first so the axis knows where the plot ends. */
  type Row = { kind: 'head'; y: number; label: string } | { kind: 'bar'; y: number; id: string }
  const layout: Row[] = []
  let y = 10
  for (const f of FAMILY_ORDER) {
    const arms = live.filter((e) => e.family === f)
    if (arms.length === 0) continue
    layout.push({ kind: 'head', y, label: capture.families[f].label })
    y += HEAD_H
    for (const e of arms) {
      layout.push({ kind: 'bar', y, id: e.id })
      y += ROW_H
    }
    y += 10
  }
  const plotBottom = y - 4
  const H = plotBottom + 44

  const engineById = (id: string) => live.find((e) => e.id === id)

  return (
    <figure className="figure dia">
      <div className="figure-head">
        <span className="heading-16" style={{ margin: 0 }}>Where the bytes go</span>
        <span className="meta">
          {num(capture.corpus.stats.memories)} memories · {capture.toolchain.embeddingDim}-d embeddings
        </span>
      </div>
      <div className="figure-body">
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', gap: '0.75rem 1.125rem',
            marginBottom: '0.875rem',
          }}
        >
          {KINDS.map((kd) => (
            <span key={kd} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4375rem' }}>
              <span aria-hidden="true" style={{
                width: 12, height: 12, borderRadius: 2, background: KIND_TONE[kd],
                border: '1px solid var(--border-faint)',
              }} />
              <span className="label" style={{ fontSize: '0.75rem' }}>{KIND_LABEL[kd]}</span>
            </span>
          ))}
        </div>

        <div style={{ overflowX: 'auto', overscrollBehaviorX: 'contain' }}>
          <svg
            viewBox={`0 0 880 ${H}`} width="100%" style={{ ...SVG_STYLE, minWidth: 620 }}
            role="img"
            aria-label={
              'Stacked bars of on-disk bytes per engine, grouped by family and drawn on one ' +
              'shared zero-based axis in megabytes. Each bar is segmented into heap, B-tree, ' +
              'inverted and vector bytes. Every arm carrying embeddings is several times larger ' +
              'than the same schema without them, and the vector segment is roughly four fifths ' +
              'of each such bar.'
            }
          >
            <title>On-disk bytes per engine, segmented by storage kind</title>

            {/* gridlines behind everything, labelled with their unit */}
            {Array.from({ length: ticks + 1 }, (_, i) => {
              const v = i * step
              return (
                <g key={v}>
                  <line x1={x(v)} y1={6} x2={x(v)} y2={plotBottom}
                    stroke="var(--data-grid)" strokeWidth={1} />
                  <text x={x(v)} y={plotBottom + 16} textAnchor="middle" fontSize={10}
                    fontFamily={MONO} fill="var(--text-tertiary)">
                    {v}
                  </text>
                </g>
              )
            })}
            <text x={PX0 + PW / 2} y={plotBottom + 34} textAnchor="middle" fontSize={11}
              fill="var(--text-secondary)">
              on-disk bytes (MB, 2²⁰)
            </text>

            {layout.map((r) => {
              if (r.kind === 'head') {
                return (
                  <g key={`h-${r.label}`}>
                    <text x={0} y={r.y + 13} fontSize={10} fontWeight={600} letterSpacing="0.08em"
                      fill="var(--text-tertiary)">
                      {r.label.toUpperCase()}
                    </text>
                    <line x1={0} y1={r.y + 20} x2={880} y2={r.y + 20}
                      stroke="var(--border-faint)" strokeWidth={1} />
                  </g>
                )
              }
              const e = engineById(r.id)
              if (!e) return null
              const agg = sumByKind(e.storage.breakdown)
              const total = e.storage.totalBytes
              let cursor = PX0
              const barY = r.y + (ROW_H - BAR_H) / 2
              return (
                <g key={r.id}>
                  <text x={182} y={barY + BAR_H / 2} textAnchor="end" dominantBaseline="central"
                    fontSize={11} fontFamily={MONO} fill="var(--text)">
                    {e.short}
                  </text>
                  {KINDS.map((kd) => {
                    const w = (agg[kd] / MIB / axisMax) * PW
                    if (w <= 0) return null
                    const seg = (
                      <rect key={kd} x={cursor} y={barY} width={w} height={BAR_H}
                        fill={KIND_TONE[kd]} stroke="var(--bg-raised)" strokeWidth={0.9} />
                    )
                    cursor += w
                    return seg
                  })}
                  {/* Direct label instead of a leader into the legend: the share
                      is the whole point, and it only needs room to be true. */}
                  {total > 0 && agg.vector > 0 && (agg.vector / MIB / axisMax) * PW > 96 && (
                    <text
                      x={PX0 + ((total - agg.vector) / MIB / axisMax) * PW + 8}
                      y={barY + BAR_H / 2} dominantBaseline="central" fontSize={10}
                      fontFamily={MONO} fill="var(--bg-raised)" fontWeight={600}>
                      {pct(agg.vector / total, 0)} embeddings
                    </text>
                  )}
                  <text x={PX0 + PW + 12} y={barY + BAR_H / 2} dominantBaseline="central"
                    fontSize={10.5} fontFamily={MONO} fill="var(--text-secondary)">
                    {bytes(total)}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        <table style={SR}>
          <caption>
            On-disk bytes per engine, split by storage kind. Heap is the rows themselves; B-tree,
            inverted and vector are the index structures over them. Bytes, not megabytes.
          </caption>
          <thead>
            <tr>
              <th scope="col">Engine</th>
              <th scope="col">Family</th>
              {KINDS.map((kd) => (
                <th key={kd} scope="col" className="n">{kd} (bytes)</th>
              ))}
              <th scope="col" className="n">Total (bytes)</th>
            </tr>
          </thead>
          <tbody>
            {live.map((e) => {
              const agg = sumByKind(e.storage.breakdown)
              return (
                <tr key={e.id}>
                  <th scope="row">{e.label}</th>
                  <td>{capture.families[e.family].label}</td>
                  {KINDS.map((kd) => (
                    <td key={kd} className="n">{num(agg[kd])}</td>
                  ))}
                  <td className="n">{num(e.storage.totalBytes)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="figure-foot">
        One zero-based axis across all {live.length} arms, so bar length is comparable between rows
        and not only within one. Sizes are what each engine reports on disk after load — byte-exact
        for the file arms, page-granular for SQLite and Postgres. Heap segments are not comparable
        across families, because a JSONL line is JSON text and a table row is typed columns; the
        index segments are what this figure is about. The result it exists for: on every arm that
        carries embeddings the vector segment is roughly four fifths of the store, so the cost of
        semantic recall is paid in storage before a single query runs.
      </div>
    </figure>
  )
}
