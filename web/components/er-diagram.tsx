'use client'

import { useId, useState } from 'react'
import type { SchemaEntity, SchemaRelationship } from '@/lib/types'

/**
 * The entity-relationship model, drawn from `engines/schema.mjs`.
 *
 * The diagram is not an illustration of the schema — it is generated from the
 * same declaration the loaders execute. Every box is a table that was created,
 * every edge a foreign key that was enforced. If the measurement ran, the
 * diagram is accurate.
 *
 * Chen notation, and the notation is carrying real information here:
 *
 *   double rectangle   weak entity — no identity outside its parent
 *   double diamond     identifying relationship
 *   double line        total participation
 *   1 / N / M          cardinality, read at the end nearest the entity
 *   ISA + (d)          disjoint, total specialization
 *
 * MEMORY is the weak entity, and that is the whole point: a memory is not a
 * free-floating document, it is turn n of session s. Vector stores model it as
 * the former and inherit every consequence of doing so.
 */

/* --------------------------------------------------------------- geometry */

type Box = { x: number; y: number; w: number; h: number }
const cx = (b: Box) => b.x + b.w / 2
const cy = (b: Box) => b.y + b.h / 2

const ENT: Record<string, Box> = {
  agent: { x: 34, y: 24, w: 132, h: 50 },
  session: { x: 34, y: 186, w: 132, h: 50 },
  memory: { x: 330, y: 300, w: 156, h: 58 },
  embedding: { x: 646, y: 300, w: 140, h: 50 },
  fact: { x: 330, y: 500, w: 132, h: 50 },
  entity: { x: 34, y: 500, w: 132, h: 50 },
}

const REL: Record<string, { x: number; y: number; r: number }> = {
  runs: { x: 100, y: 130, r: 40 },
  records: { x: 240, y: 268, r: 46 },
  vectorises: { x: 566, y: 325, r: 44 },
  restates: { x: 396, y: 425, r: 42 },
  concerns: { x: 210, y: 402, r: 42 },
  about: { x: 248, y: 525, r: 38 },
  supersedes: { x: 408, y: 196, r: 44 },
}

/* ------------------------------------------------------------- primitives */

function Entity({
  box, label, weak, note,
}: { box: Box; label: string; weak?: boolean; note?: string }) {
  return (
    <g>
      {weak && (
        <rect
          x={box.x - 5} y={box.y - 5} width={box.w + 10} height={box.h + 10}
          rx={3} fill="none" stroke="var(--text)" strokeWidth={1.4}
        />
      )}
      <rect
        x={box.x} y={box.y} width={box.w} height={box.h} rx={3}
        fill="var(--bg-raised)" stroke="var(--text)" strokeWidth={1.4}
      />
      <text
        x={cx(box)} y={note ? cy(box) - 8 : cy(box)} textAnchor="middle" dominantBaseline="central"
        fontSize={13} fontWeight={550} letterSpacing="0.04em" fill="var(--text)"
        fontFamily="var(--font-mono)"
      >
        {label}
      </text>
      {/* The partial key belongs inside the entity, not floating under it: the
          space below MEMORY already carries two relationship edges and their
          cardinality labels, and a caption placed there collides with them. */}
      {note && (
        <text
          x={cx(box)} y={cy(box) + 12} textAnchor="middle" dominantBaseline="central"
          fontSize={9} fill="var(--text-tertiary)" fontFamily="var(--font-mono)"
        >
          {note}
        </text>
      )}
    </g>
  )
}

function Diamond({
  at, label, identifying,
}: { at: { x: number; y: number; r: number }; label: string; identifying?: boolean }) {
  const pts = (r: number) =>
    `${at.x},${at.y - r * 0.62} ${at.x + r},${at.y} ${at.x},${at.y + r * 0.62} ${at.x - r},${at.y}`
  return (
    <g>
      {identifying && (
        <polygon points={pts(at.r + 6)} fill="none" stroke="var(--text)" strokeWidth={1.3} />
      )}
      <polygon
        points={pts(at.r)} fill="var(--bg-sunken)" stroke="var(--text)" strokeWidth={1.3}
      />
      <text
        x={at.x} y={at.y} textAnchor="middle" dominantBaseline="central"
        fontSize={10.5} fill="var(--text-secondary)" fontStyle="italic"
      >
        {label}
      </text>
    </g>
  )
}

type Pt = { x: number; y: number }
type Edge = { a: Pt; b: Pt; total?: boolean; card?: string; pad?: number }

/**
 * Where a cardinality label sits on an edge.
 *
 * Not a fraction of the edge: a diamond has a radius of up to 46px and many
 * edges here are barely twice that, so any fixed fraction puts the label inside
 * the diamond it starts from. `pad` is how far the endpoint is buried — the
 * diamond's radius when the edge begins at one, zero when it begins at an
 * entity's border — and the label is placed just clear of it.
 */
function cardPoint({ a, b, pad = 0 }: Edge): Pt {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const d = Math.min(pad + 17, len - 12)
  return { x: a.x + (dx / len) * d, y: a.y + (dy / len) * d }
}

/** The connector itself, with a second rail when participation is total. */
function LinkLine({ a, b, total }: Edge) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * 2.6
  const ny = (dx / len) * 2.6
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--text)" strokeWidth={1.15} />
      {total && (
        <line
          x1={a.x + nx} y1={a.y + ny} x2={b.x + nx} y2={b.y + ny}
          stroke="var(--text)" strokeWidth={1.15}
        />
      )}
    </g>
  )
}

/**
 * Cardinality labels are drawn in a final pass, after the boxes and diamonds.
 * They are the one element that may legitimately sit over another — an edge
 * that runs short leaves nowhere else to put the number — and a label hidden
 * beneath a diamond is worse than one printed on top of it.
 */
function CardLabel({ at, card }: { at: Pt; card: string }) {
  return (
    <g>
      <circle cx={at.x} cy={at.y} r={9} fill="var(--bg)" />
      <text
        x={at.x} y={at.y} textAnchor="middle" dominantBaseline="central"
        fontSize={11} fontWeight={600} fill="var(--accent-text)"
        fontFamily="var(--font-mono)"
      >
        {card}
      </text>
    </g>
  )
}

/* ----------------------------------------------------------- the ER view */

/**
 * Every connector, declared once so the three render passes cannot disagree
 * about where an edge runs. `pad` is the radius of whichever diamond the edge
 * starts inside — see `cardPoint`.
 */
const M_ = ENT.memory
const EDGES: Edge[] = [
  /* AGENT ─ runs ─ SESSION */
  { a: { x: cx(ENT.agent), y: ENT.agent.y + ENT.agent.h }, b: REL.runs, card: '1' },
  { a: REL.runs, b: { x: cx(ENT.session), y: ENT.session.y }, card: 'N', total: true, pad: REL.runs.r * 0.62 },

  /* SESSION ═ records ═ MEMORY — identifying, total on both ends */
  { a: { x: cx(ENT.session), y: ENT.session.y + ENT.session.h }, b: REL.records, card: '1', total: true },
  { a: REL.records, b: { x: M_.x, y: cy(M_) }, card: 'N', total: true, pad: REL.records.r },

  /* MEMORY ─ vectorises ─ EMBEDDING */
  { a: { x: M_.x + M_.w, y: cy(M_) }, b: REL.vectorises, card: '1' },
  { a: REL.vectorises, b: { x: ENT.embedding.x, y: cy(ENT.embedding) }, card: '1', total: true, pad: REL.vectorises.r },

  /* MEMORY ─ restates ─ FACT */
  { a: { x: cx(M_) + 24, y: M_.y + M_.h }, b: REL.restates, card: 'N' },
  { a: REL.restates, b: { x: cx(ENT.fact) + 20, y: ENT.fact.y }, card: '1', pad: REL.restates.r * 0.62 },

  /* MEMORY ─ concerns ─ ENTITY — many-to-many, resolved by MEMORY_ENTITY */
  { a: { x: M_.x + 12, y: M_.y + M_.h }, b: REL.concerns, card: 'M' },
  { a: REL.concerns, b: { x: cx(ENT.entity), y: ENT.entity.y }, card: 'N', pad: REL.concerns.r * 0.62 },

  /* FACT ─ about ─ ENTITY */
  { a: { x: ENT.fact.x, y: cy(ENT.fact) }, b: REL.about, card: 'N' },
  { a: REL.about, b: { x: ENT.entity.x + ENT.entity.w, y: cy(ENT.entity) }, card: '1', total: true, pad: REL.about.r },
]

function ChenDiagram({ entities }: { entities: SchemaEntity[] }) {
  const spec = entities.find((e) => e.specialization)?.specialization
  const m = ENT.memory
  const triY = 396
  const subs = spec?.subtypes ?? []
  const subW = 104
  const subGap = 14
  const subTotal = subs.length * subW + (subs.length - 1) * subGap
  const subX0 = 830 - subTotal

  return (
    <svg viewBox="0 0 840 610" width="100%" role="img"
      aria-label="Entity-relationship diagram of the agent memory schema in Chen notation">
      <title>Agent memory — entity-relationship model</title>

      {EDGES.map((e, i) => <LinkLine key={`l${i}`} {...e} />)}

      {/* recursive supersedes: out of the top of MEMORY and back into it */}
      <path
        d={`M ${cx(m) - 34} ${m.y} C ${cx(m) - 60} ${m.y - 60}, ${REL.supersedes.x - 78} ${REL.supersedes.y - 14}, ${REL.supersedes.x - REL.supersedes.r} ${REL.supersedes.y}`}
        fill="none" stroke="var(--text)" strokeWidth={1.15}
      />
      <path
        d={`M ${REL.supersedes.x + REL.supersedes.r} ${REL.supersedes.y} C ${REL.supersedes.x + 86} ${REL.supersedes.y + 10}, ${cx(m) + 66} ${m.y - 54}, ${cx(m) + 34} ${m.y}`}
        fill="none" stroke="var(--text)" strokeWidth={1.15}
      />
      <text x={cx(m) - 62} y={m.y - 26} fontSize={11} fontWeight={600}
        fill="var(--accent-text)" fontFamily="var(--font-mono)">1</text>
      <text x={cx(m) + 54} y={m.y - 22} fontSize={11} fontWeight={600}
        fill="var(--accent-text)" fontFamily="var(--font-mono)">N</text>

      {/* ISA — disjoint, total specialization on `kind`. The triangle is sized
          to hold its own label; a smaller one forces the word outside it, where
          it reads as an annotation rather than as part of the symbol. */}
      <line x1={m.x + m.w} y1={m.y + m.h - 8} x2={700} y2={triY - 30}
        stroke="var(--text)" strokeWidth={1.15} />
      <polygon points={`700,${triY - 34} 672,${triY + 10} 728,${triY + 10}`}
        fill="var(--bg-sunken)" stroke="var(--text)" strokeWidth={1.2} />
      <text x={700} y={triY - 1} textAnchor="middle" dominantBaseline="central" fontSize={10}
        fontWeight={600} fill="var(--text)" fontFamily="var(--font-mono)">ISA</text>
      <circle cx={752} cy={triY - 12} r={9.5} fill="var(--bg)" stroke="var(--text)" strokeWidth={1.1} />
      <text x={752} y={triY - 12} textAnchor="middle" dominantBaseline="central"
        fontSize={10} fontWeight={600} fill="var(--text)" fontFamily="var(--font-mono)">d</text>

      <line x1={700} y1={triY + 10} x2={700} y2={triY + 26} stroke="var(--text)" strokeWidth={1.15} />
      <line x1={subX0 + subW / 2} y1={triY + 26} x2={subX0 + subTotal - subW / 2} y2={triY + 26}
        stroke="var(--text)" strokeWidth={1.15} />
      {subs.map((s, i) => {
        const x = subX0 + i * (subW + subGap)
        return (
          <g key={s.name}>
            <line x1={x + subW / 2} y1={triY + 26} x2={x + subW / 2} y2={triY + 44}
              stroke="var(--text)" strokeWidth={1.15} />
            <rect x={x} y={triY + 44} width={subW} height={34} rx={3}
              fill="var(--bg-raised)" stroke="var(--text)" strokeWidth={1.1} />
            <text x={x + subW / 2} y={triY + 61} textAnchor="middle" dominantBaseline="central"
              fontSize={10.5} fill="var(--text)" fontFamily="var(--font-mono)">{s.name}</text>
          </g>
        )
      })}

      {/* diamonds and boxes drawn last so links tuck underneath */}
      <Diamond at={REL.runs} label="runs" />
      <Diamond at={REL.records} label="records" identifying />
      <Diamond at={REL.vectorises} label="vectorises" />
      <Diamond at={REL.restates} label="restates" />
      <Diamond at={REL.concerns} label="concerns" />
      <Diamond at={REL.about} label="about" />
      <Diamond at={REL.supersedes} label="supersedes" />

      <Entity box={ENT.agent} label="AGENT" />
      <Entity box={ENT.session} label="SESSION" />
      <Entity box={ENT.memory} label="MEMORY" weak note="partial key: turn_no" />
      <Entity box={ENT.embedding} label="EMBEDDING" />
      <Entity box={ENT.fact} label="FACT" />
      <Entity box={ENT.entity} label="ENTITY" />

      {/* Last pass: the numbers stay legible whatever they land on. */}
      {EDGES.map((e, i) => (e.card ? <CardLabel key={`c${i}`} at={cardPoint(e)} card={e.card} /> : null))}

    </svg>
  )
}

/* ------------------------------------------------- relational schema view */

function RelationalDiagram({ entities }: { entities: SchemaEntity[] }) {
  const gid = useId()
  const COL = [24, 300, 576]
  const rowH = (e: SchemaEntity) => 30 + e.attrs.length * 17 + 10
  const place: Record<string, { x: number; y: number; w: number; h: number }> = {}
  const order = ['agent', 'session', 'memory', 'entity', 'fact', 'memory_entity', 'embedding']
  const colY = [12, 12, 12]
  for (let i = 0; i < order.length; i++) {
    const e = entities.find((x) => x.name === order[i])!
    const c = i % 3
    place[e.name] = { x: COL[c], y: colY[c], w: 246, h: rowH(e) }
    colY[c] += rowH(e) + 22
  }
  const height = Math.max(...colY) + 8

  const anchorOf = (t: string) => {
    const p = place[t]
    return { x: p.x + p.w / 2, y: p.y + 14 }
  }

  return (
    <svg viewBox={`0 0 846 ${height}`} width="100%" role="img"
      aria-label="Relational schema with primary and foreign keys">
      <title>Agent memory — relational schema</title>
      <defs>
        <marker id={`${gid}-fk`} viewBox="0 0 8 8" refX="7" refY="4"
          markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,1 L7,4 L0,7" fill="none" stroke="var(--accent)" strokeWidth={1.3} />
        </marker>
      </defs>

      {/* foreign keys first, so the tables sit on top of them */}
      {entities.flatMap((e) =>
        e.attrs.filter((a) => a.fk).map((a) => {
          const [rt] = a.fk!.split('.')
          if (!place[rt] || !place[e.name]) return null
          const from = place[e.name]
          const to = anchorOf(rt)
          const idx = e.attrs.indexOf(a)
          const y = from.y + 30 + idx * 17 + 8
          const startX = from.x + from.w
          const selfRef = rt === e.name
          const d = selfRef
            ? `M ${startX} ${y} C ${startX + 34} ${y}, ${startX + 34} ${from.y + 8}, ${from.x + from.w - 20} ${from.y + 4}`
            : `M ${startX} ${y} C ${startX + 30} ${y}, ${to.x - 40} ${to.y}, ${to.x} ${to.y}`
          return (
            <path key={`${e.name}.${a.name}`} d={d} fill="none"
              stroke="var(--accent-line)" strokeWidth={1.1} strokeDasharray="3 2.5"
              markerEnd={`url(#${gid}-fk)`} />
          )
        }),
      )}

      {entities.map((e) => {
        const p = place[e.name]
        if (!p) return null
        return (
          <g key={e.name}>
            <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={4}
              fill="var(--bg-raised)" stroke="var(--border-strong)" strokeWidth={1} />
            <rect x={p.x} y={p.y} width={p.w} height={24} rx={4}
              fill={e.kind === 'weak' ? 'var(--accent-quiet)' : 'var(--bg-sunken)'} />
            <line x1={p.x} y1={p.y + 24} x2={p.x + p.w} y2={p.y + 24}
              stroke="var(--border)" strokeWidth={1} />
            <text x={p.x + 10} y={p.y + 12} dominantBaseline="central" fontSize={11.5}
              fontWeight={600} fill="var(--text)" fontFamily="var(--font-mono)">
              {e.name}
            </text>
            <text x={p.x + p.w - 10} y={p.y + 12} dominantBaseline="central" textAnchor="end"
              fontSize={9} fill="var(--text-tertiary)" fontFamily="var(--font-mono)">
              {e.kind}
            </text>
            {e.attrs.map((a, i) => {
              const y = p.y + 30 + i * 17 + 8
              const isPk = e.pk.includes(a.name)
              return (
                <g key={a.name}>
                  <text x={p.x + 10} y={y} dominantBaseline="central" fontSize={10.5}
                    fill={isPk ? 'var(--text)' : 'var(--text-secondary)'}
                    fontWeight={isPk ? 600 : 400} fontFamily="var(--font-mono)"
                    textDecoration={isPk ? 'underline' : undefined}>
                    {a.name}
                  </text>
                  <text x={p.x + p.w - 10} y={y} dominantBaseline="central" textAnchor="end"
                    fontSize={9} fill={a.fk ? 'var(--accent-text)' : 'var(--text-faint)'}
                    fontFamily="var(--font-mono)">
                    {a.fk ? `FK → ${a.fk.split('.')[0]}` : a.type}
                  </text>
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

/* ------------------------------------------------------------------ shell */

export function ErDiagram({
  entities, relationships,
}: { entities: SchemaEntity[]; relationships: SchemaRelationship[] }) {
  const [view, setView] = useState<'chen' | 'relational'>('chen')
  const weak = entities.find((e) => e.kind === 'weak')

  return (
    <figure className="figure">
      <div className="figure-head">
        <span>{view === 'chen' ? 'Conceptual model — Chen notation' : 'Logical model — relational schema'}</span>
        <span className="seg no-print" role="tablist" aria-label="Diagram view">
          <button
            type="button" role="tab" aria-selected={view === 'chen'}
            className={view === 'chen' ? 'seg-on' : ''} onClick={() => setView('chen')}
          >
            ER
          </button>
          <button
            type="button" role="tab" aria-selected={view === 'relational'}
            className={view === 'relational' ? 'seg-on' : ''} onClick={() => setView('relational')}
          >
            Tables
          </button>
        </span>
      </div>
      <div className="figure-body" style={{ padding: '1.25rem 1rem' }}>
        {view === 'chen'
          ? <ChenDiagram entities={entities} />
          : <RelationalDiagram entities={entities} />}
      </div>
      <div className="figure-foot">
        {view === 'chen' ? (
          <span>
            Double rectangle = weak entity · double diamond = identifying relationship ·
            double line = total participation · (d) = disjoint specialization.
            {weak ? ` ${weak.label} is identified by (${weak.naturalKey?.join(', ')}).` : ''}
          </span>
        ) : (
          <span>
            Underlined = primary key · dashed arrow = foreign key.{' '}
            {relationships.filter((r) => r.card === 'M:N').length} many-to-many relationship
            {relationships.filter((r) => r.card === 'M:N').length === 1 ? ' is' : 's are'} resolved
            by a bridge table.
          </span>
        )}
      </div>
    </figure>
  )
}
