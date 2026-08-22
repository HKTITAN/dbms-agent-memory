/* The entity-relationship model of Lore's vault, in Chen notation.
 *
 * This is not an illustration of the schema. Every rectangle is here because an
 * entity exists in `engines/schema.mjs`, every diamond because a relationship
 * does, and both arrive through `capture.schema` — the same declaration the
 * SQLite and PostgreSQL loaders execute. If a box is drawn, a table was created;
 * if an edge is drawn, a foreign key was enforced during measurement. The only
 * thing this file supplies is where each of them sits on the page, and anything
 * the declaration adds that this file has no place for is named in the footer
 * rather than silently dropped.
 *
 * WHY CHEN AND NOT CROW'S FOOT. Crow's foot draws tables. Chen draws the model
 * before it becomes tables, and the model is what this section argues about:
 * which relationships are many-to-many before a bridge exists, which entities
 * have no identity of their own, which specialisation is disjoint and total.
 * Every symbol below is doing that work rather than decorating:
 *
 *   rectangle                    an entity — one of Lore's five Notion databases
 *   double rectangle             a bridge relation: no identity apart from its
 *                                parent, so it is a weak entity
 *   rectangle around a diamond   the bridge that resolves an M:N relationship —
 *                                a relationship that is also a relation
 *   dashed, in the accent        exists ONLY in our reimplementation. There is
 *                                exactly one of these, ENTITY_ALIAS, and it is
 *                                the shape a normalised schema would have where
 *                                the vault has a `, `-joined string in one cell
 *   diamond                      a relationship
 *   double diamond               identifying: the weak side is keyed by it
 *   double line                  total participation on that end
 *   1 / N / M                    cardinality, read at the end nearest the entity
 *   ISA triangle, (d)            disjoint, total specialisation
 *
 * THREE THINGS THE DIAGRAM IS TRYING TO MAKE UNMISSABLE.
 *
 *  1. TEN SUBTYPES, ONE RELATION. MEMORY carries a ten-valued discriminator and
 *     a property set that is meaningful for one kind at a time — `Task State`
 *     for tasks, `Alternatives` for decisions. Drawing ten boxes would say the
 *     schema has ten relations. It has one, so the ISA hangs a compact list off
 *     the triangle instead and prints, beside each kind, how many properties
 *     exist for that kind alone. That column of small numbers is the cost of the
 *     single-table specialisation, stated in the notation rather than in prose.
 *
 *  2. FOUR EDGES WHERE A READER EXPECTS TWO. MEMORY reaches FACT twice —
 *     `evidences` is the provenance edge (Source) and `retracts` is the
 *     transaction-time edge (Invalidated By) — and ENTITY reaches FACT twice, as
 *     subject and as object. They are separate relationships with separate
 *     meanings, so they are separate diamonds. Collapsing them into one edge
 *     labelled "related" is how a diagram starts lying.
 *
 *  3. THE RECURSIVE EDGE. `supersedes` leaves MEMORY and returns to it, and
 *     Lore's own comment records that the relation is single_property, so the
 *     reverse edge is never maintained. It is drawn as two lines to one diamond,
 *     the shape Chen reserves for a self-relation, and labelled as such.
 *
 * LEGIBILITY. The drawing is 820 units wide and the smallest type on it is 11,
 * which is the floor at which the figure stays readable at its narrowest laid-out
 * width (740 CSS pixels, below which the container scrolls rather than shrinking
 * the type further) and prints at roughly 6.8pt on A4 — the same size as the
 * paper's own tables. Nothing is interactive, nothing is revealed by hover, and
 * nothing is carried by colour alone: the synthetic relation is dashed AND
 * labelled, the recursive relationship is looped AND labelled, and both the
 * entities and the relationships are repeated in visually hidden tables so the
 * whole model is available to a reader who cannot see the picture.
 */

import type { CSSProperties, ReactNode } from 'react'
import type { Attr, EntityDef, RelationshipDef } from '@/lib/types'
import { schema, n } from '@/lib/data'
import { Figure } from './charts'

/* Present in the accessibility tree, absent from layout — the same pattern the
 * chart primitives use for their fallback tables. */
/* --------------------------------------------------------------- geometry */

type Pt = { x: number; y: number }
type Rect = Pt & { w: number; h: number }   /* centre, not corner */
type Dia = Pt & { rx: number; ry: number }

const INK = 'var(--text)'

/** Where a ray from the centre of a rectangle leaves its border. */
function onRect(r: Rect, toward: Pt): Pt {
  const dx = toward.x - r.x
  const dy = toward.y - r.y
  if (dx === 0 && dy === 0) return { x: r.x, y: r.y }
  const s = Math.min(
    dx === 0 ? Infinity : r.w / 2 / Math.abs(dx),
    dy === 0 ? Infinity : r.h / 2 / Math.abs(dy),
  )
  return { x: r.x + dx * s, y: r.y + dy * s }
}

/** The same for a rhombus, whose boundary is |x|/rx + |y|/ry = 1. */
function onDia(d: Dia, toward: Pt): Pt {
  const dx = toward.x - d.x
  const dy = toward.y - d.y
  const k = Math.abs(dx) / d.rx + Math.abs(dy) / d.ry
  if (k === 0) return { x: d.x, y: d.y }
  return { x: d.x + dx / k, y: d.y + dy / k }
}

/**
 * Where a cardinality label sits: a fixed distance from the entity end of the
 * segment rather than a fraction of it. Several edges here are barely twice a
 * diamond's radius, and any fraction puts the label inside the shape it was
 * measured from; the midpoint is the fallback when the segment is too short to
 * hold the label anywhere else.
 */
function along(a: Pt, b: Pt, want: number): Pt {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const d = Math.min(want, len / 2)
  return { x: a.x + (dx / len) * d, y: a.y + (dy / len) * d }
}

const path = (pts: Pt[]) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

/* ----------------------------------------------------------------- layout */

/**
 * Placement, and only placement. The declaration says what exists; this says
 * where it goes, because no automatic layout gets an eight-way hub like MEMORY
 * readable at print size. Every entity in the declaration needs an entry here,
 * and `unplaced` below turns a missing one into visible text instead of a box
 * that quietly stopped being drawn.
 *
 * The arrangement follows the vault's own shape: the two scoping databases at
 * the top, MEMORY as the hub in the middle with its three bridges above it and
 * its three outgoing relationships below, and the knowledge graph — ENTITY and
 * FACT — along the bottom. PROJECT reaches FACT directly as well, and that edge
 * takes the right margin because it is the one relationship that skips the hub.
 */
const W = 820
const H = 872
const MIN_W = 740

const PLACE: Record<string, Rect> = {
  topic: { x: 120, y: 56, w: 138, h: 48 },
  project: { x: 524, y: 56, w: 138, h: 48 },
  memory_topic: { x: 150, y: 184, w: 184, h: 96 },
  memory_project: { x: 548, y: 184, w: 184, h: 96 },
  memory_tag: { x: 80, y: 312, w: 132, h: 56 },
  memory: { x: 430, y: 312, w: 182, h: 60 },
  entity: { x: 175, y: 574, w: 152, h: 56 },
  fact: { x: 560, y: 574, w: 152, h: 56 },
  entity_alias: { x: 132, y: 816, w: 186, h: 60 },
}

/** One per relationship that is not hosted inside a bridge rectangle. */
const DIA: Record<string, Dia> = {
  scopes: { x: 322, y: 56, rx: 54, ry: 27 },
  supersedes: { x: 350, y: 186, rx: 56, ry: 27 },
  tagged: { x: 252, y: 312, rx: 44, ry: 26 },
  aliased: { x: 132, y: 700, rx: 50, ry: 26 },
  introduces: { x: 175, y: 442, rx: 54, ry: 27 },
  evidences: { x: 392, y: 442, rx: 52, ry: 27 },
  retracts: { x: 556, y: 442, rx: 50, ry: 27 },
  fact_scope: { x: 748, y: 442, rx: 50, ry: 27 },
  subject_of: { x: 368, y: 574, rx: 56, ry: 27 },
  object_of: { x: 368, y: 704, rx: 54, ry: 27 },
}

/**
 * The one edge that cannot run straight. PROJECT scopes FACT directly, and the
 * two sit at opposite corners with the whole hub between them, so the edge is
 * taken out along the top and down the right margin — an elbow the eye can
 * follow, rather than a diagonal through five other relationships.
 */
const ELBOW: Record<string, Pt> = {
  fact_scope: { x: 748, y: 56 },
}

/* ------------------------------------------------------------- primitives */

/** Type sizes, kept in one place so the 11-unit floor is checkable. */
const FS = { name: 13, sub: 11, rel: 11.5, card: 12, note: 11 }

/* SVG text inherits the face but not the numeric feature, and every figure in
   this paper sets its numbers in tabular figures. */
const TNUM: CSSProperties = { fontVariantNumeric: 'tabular-nums' }

function Link({
  pts, total, dashed,
}: { pts: Pt[]; total?: boolean; dashed?: boolean }) {
  /* A dashed edge is a synthetic one, and it carries the accent for the same
     reason its box does: the reader has to be able to see, at a glance, which
     parts of this model the vault does not contain. */
  const tone = dashed ? 'var(--accent)' : INK
  const dash = dashed ? '5 3.5' : undefined
  /* The second rail of a total-participation edge is offset along the normal of
     the first segment. Every total edge in this model is a single straight run,
     so one normal is the whole answer. */
  const a = pts[0]
  const b = pts[1] ?? pts[0]
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const nx = (-(b.y - a.y) / len) * 2.6
  const ny = ((b.x - a.x) / len) * 2.6
  return (
    <g>
      <path d={path(pts)} fill="none" stroke={tone} strokeWidth={1.15} strokeDasharray={dash} />
      {total ? (
        <path
          d={path(pts.map((p) => ({ x: p.x + nx, y: p.y + ny })))}
          fill="none" stroke={tone} strokeWidth={1.15} strokeDasharray={dash}
        />
      ) : null}
    </g>
  )
}

/** Drawn in a final pass: a number hidden under a diamond is worse than one
 *  printed on top of it, and on short edges there is nowhere else to put it. */
function Card({ at, text }: { at: Pt; text: string }) {
  return (
    <g>
      <circle cx={at.x} cy={at.y} r={9.5} fill="var(--bg-raised)" />
      <text
        x={at.x} y={at.y} textAnchor="middle" dominantBaseline="central"
        fontSize={FS.card} fontWeight={600} fill="var(--accent-text)"
        fontFamily="var(--font-mono)" style={TNUM}
      >
        {text}
      </text>
    </g>
  )
}

/** How far the identifying ring sits outside the diamond it doubles. */
const RING = 6

function Rhombus({
  d, label, identifying, dashed,
}: { d: Dia; label: string; identifying?: boolean; dashed?: boolean }) {
  const pts = (g: number) =>
    `${d.x},${d.y - d.ry - g} ${d.x + d.rx + g * 1.9},${d.y} ${d.x},${d.y + d.ry + g} ${d.x - d.rx - g * 1.9},${d.y}`
  const stroke = dashed ? 'var(--accent)' : INK
  const dash = dashed ? '5 3.5' : undefined
  return (
    <g>
      {identifying ? (
        <polygon points={pts(RING)} fill="none" stroke={stroke} strokeWidth={1.2} strokeDasharray={dash} />
      ) : null}
      <polygon
        points={pts(0)} fill={dashed ? 'var(--accent-quiet)' : 'var(--bg-sunken)'}
        stroke={stroke} strokeWidth={1.3} strokeDasharray={dash}
      />
      <text
        x={d.x} y={d.y} textAnchor="middle" dominantBaseline="central"
        fontSize={FS.rel} fontStyle="italic" fill="var(--text-secondary)"
      >
        {label}
      </text>
    </g>
  )
}

/**
 * An entity box. The second line is the database it is, which for a bridge is
 * either the vault structure it was projected out of or — for the one relation
 * the vault does not have at all — the fact that it does not exist there.
 */
function Box({
  r, label, sub, weak, synthetic,
}: { r: Rect; label: string; sub: string; weak?: boolean; synthetic?: boolean }) {
  const stroke = synthetic ? 'var(--accent)' : INK
  const dash = synthetic ? '5 3.5' : undefined
  const x = r.x - r.w / 2
  const y = r.y - r.h / 2
  return (
    <g>
      {weak ? (
        <rect
          x={x - 5} y={y - 5} width={r.w + 10} height={r.h + 10} rx={3}
          fill="none" stroke={stroke} strokeWidth={1.2} strokeDasharray={dash}
        />
      ) : null}
      <rect
        x={x} y={y} width={r.w} height={r.h} rx={3}
        fill={synthetic ? 'var(--accent-quiet)' : 'var(--bg-raised)'}
        stroke={stroke} strokeWidth={1.4} strokeDasharray={dash}
      />
      <text
        x={r.x} y={r.y - 9} textAnchor="middle" dominantBaseline="central"
        fontSize={FS.name} fontWeight={550} letterSpacing="0.04em"
        fill={INK} fontFamily="var(--font-mono)"
      >
        {label}
      </text>
      <text
        x={r.x} y={r.y + 11} textAnchor="middle" dominantBaseline="central"
        fontSize={FS.sub} fill={synthetic ? 'var(--accent-text)' : 'var(--text-tertiary)'}
        fontFamily="var(--font-mono)"
      >
        {sub}
      </text>
    </g>
  )
}

/**
 * A bridge that resolves an M:N: the relationship diamond drawn inside the
 * rectangle it becomes. Chen has no symbol for "this relationship is also a
 * relation", and in this schema that distinction is the whole difference
 * between what Notion stores — an array of page ids in a relation property —
 * and what the reimplementation stores.
 */
function Associative({
  r, label, name, sub,
}: { r: Rect; label: string; name: string; sub: string }) {
  const x = r.x - r.w / 2
  const y = r.y - r.h / 2
  return (
    <g>
      <rect
        x={x - 5} y={y - 5} width={r.w + 10} height={r.h + 10} rx={3}
        fill="none" stroke={INK} strokeWidth={1.2}
      />
      <rect
        x={x} y={y} width={r.w} height={r.h} rx={3}
        fill="var(--bg-raised)" stroke={INK} strokeWidth={1.4}
      />
      <text
        x={r.x} y={y + 18} textAnchor="middle" dominantBaseline="central"
        fontSize={FS.name} fontWeight={550} letterSpacing="0.04em"
        fill={INK} fontFamily="var(--font-mono)"
      >
        {name}
      </text>
      <text
        x={r.x} y={y + 34} textAnchor="middle" dominantBaseline="central"
        fontSize={FS.sub} fill="var(--text-tertiary)" fontFamily="var(--font-mono)"
      >
        {sub}
      </text>
      <Rhombus d={{ x: r.x, y: r.y + 20, rx: 80, ry: 24 }} label={label} />
    </g>
  )
}

/**
 * The specialisation. Ten subtypes are listed rather than drawn, because ten
 * boxes would say the schema has ten relations and it has one — the count beside
 * a kind is how many of MEMORY's properties are meaningful for that kind alone,
 * which is the price of the single-table specialisation, printed.
 */
type Spec = NonNullable<EntityDef['specialization']>

function Isa({ box, spec }: { box: Rect; spec: Spec }) {
  const apex = { x: box.x + box.w / 2 + 20, y: box.y }
  const baseX = apex.x + 58
  const panelX = baseX + 18
  const panelW = 110
  const rowH = 14
  const panelH = 22 + spec.subtypes.length * rowH + 8
  /* Hung slightly below the axis of the triangle rather than centred on it: ten
     kinds make a panel taller than the entity it belongs to, and centred it
     collides with the bridge above. The stem still enters at the triangle's own
     height, so the connection stays unambiguous. */
  const panelY = box.y - panelH / 2 + 20

  return (
    <g>
      {/* Total specialisation is a double line, the same symbol total
          participation uses elsewhere on the drawing. */}
      <Link pts={[onRect(box, apex), apex]} total={spec.total} />
      <polygon
        points={`${apex.x},${apex.y} ${baseX},${apex.y - 30} ${baseX},${apex.y + 30}`}
        fill="var(--bg-sunken)" stroke={INK} strokeWidth={1.2}
      />
      <text
        x={apex.x + 36} y={apex.y} textAnchor="middle" dominantBaseline="central"
        fontSize={FS.rel} fontWeight={600} fill={INK} fontFamily="var(--font-mono)"
      >
        ISA
      </text>
      {spec.disjoint ? (
        <g>
          <circle
            cx={apex.x + 32} cy={apex.y - 32} r={11.5}
            fill="var(--bg-raised)" stroke={INK} strokeWidth={1.1}
          />
          <text
            x={apex.x + 32} y={apex.y - 32} textAnchor="middle" dominantBaseline="central"
            fontSize={FS.rel} fontWeight={600} fill={INK} fontFamily="var(--font-mono)"
          >
            d
          </text>
        </g>
      ) : null}
      {/* The discriminating attribute belongs beside the triangle: without it
          the reader knows the specialisation is disjoint but not on what. */}
      <text
        x={apex.x + 30} y={apex.y + 48} textAnchor="middle"
        fontSize={FS.note} fill="var(--text-tertiary)" fontFamily="var(--font-mono)"
      >
        {spec.discriminator}
      </text>

      <line x1={baseX} y1={apex.y} x2={panelX} y2={apex.y} stroke={INK} strokeWidth={1.15} />
      <rect
        x={panelX} y={panelY} width={panelW} height={panelH} rx={3}
        fill="var(--bg-sunken)" stroke="var(--border-strong)" strokeWidth={1}
      />
      <text
        x={panelX + 10} y={panelY + 14} dominantBaseline="central"
        fontSize={FS.note} fill="var(--text-tertiary)" fontFamily="var(--font-mono)" style={TNUM}
      >
        {spec.subtypes.length} kinds
      </text>
      {spec.subtypes.map((sub, i) => {
        const y = panelY + 22 + i * rowH + 9
        return (
          <g key={sub.name}>
            <text
              x={panelX + 10} y={y} dominantBaseline="central"
              fontSize={FS.rel} fill={INK} fontFamily="var(--font-mono)"
            >
              {sub.name}
            </text>
            {sub.own.length > 0 ? (
              <text
                x={panelX + panelW - 9} y={y} textAnchor="end" dominantBaseline="central"
                fontSize={FS.rel} fontWeight={600} fill="var(--accent-text)"
                fontFamily="var(--font-mono)" style={TNUM}
              >
                {sub.own.length}
              </text>
            ) : null}
          </g>
        )
      })}
    </g>
  )
}

/* ------------------------------------------------------------ the drawing */

function Chen({
  entities, relationships,
}: { entities: EntityDef[]; relationships: RelationshipDef[] }) {
  const byName = new Map(entities.map((e) => [e.name, e]))

  /* A bridge that hosts a relationship is drawn as the associative glyph; a
     bridge that is the far end of one is drawn as a weak entity. Both facts come
     out of the relationship list, not out of this file. */
  const hostedBy = new Map<string, RelationshipDef>()
  for (const r of relationships) if (r.via) hostedBy.set(r.via, r)

  const spec = entities.find((e) => e.specialization)
  const specialization = spec?.specialization
  const specBox = spec ? PLACE[spec.name] : undefined

  const unplaced = [
    ...entities.filter((e) => !PLACE[e.name]).map((e) => e.label),
    ...relationships
      .filter((r) => !r.via && !DIA[r.name])
      .map((r) => `${r.label} (${r.from}→${r.to})`),
  ]

  /* Each relationship becomes two half-edges: entity to shape, shape to entity.
     The shape is the relationship's own diamond, or the rectangle of the bridge
     that hosts it. Both ends are computed from the placed geometry, so moving a
     box moves its edges with it. */
  type Half = { key: string; pts: Pt[]; card: string; total: boolean; dashed: boolean }
  const halves: Half[] = []

  for (const r of relationships) {
    if (r.recursive) continue
    const from = PLACE[r.from]
    const to = PLACE[r.to]
    if (!from || !to) continue
    const host = r.via ? PLACE[r.via] : undefined
    const plain = r.via ? undefined : DIA[r.name]
    if (!host && !plain) continue
    /* An identifying relationship is drawn as a second rhombus outside the
       first, so the edge has to stop on the outer one or it appears to pierce
       the symbol. RING keeps the ring parallel to the shape it surrounds, which
       needs more offset across than down. */
    const d = plain && r.weakSide
      ? { ...plain, rx: plain.rx + RING * 1.9, ry: plain.ry + RING }
      : plain
    const hub: Pt = host ?? (d as Dia)
    const edge = (side: Pt): Pt =>
      host ? onRect(host, side) : onDia(d as Dia, side)
    const dashed = r.synthetic === true

    const bend = ELBOW[r.name]
    if (bend) {
      /* The elbow leaves the entity towards the bend, turns once, and enters the
         shape from there — so both ends still sit on real borders. */
      halves.push({
        key: `${r.name}-from`,
        pts: [onRect(from, bend), bend, edge(bend)],
        card: r.fromCard,
        total: false,
        dashed,
      })
    } else {
      halves.push({
        key: `${r.name}-from`,
        pts: [onRect(from, hub), edge(from)],
        card: r.fromCard,
        total: false,
        dashed,
      })
    }
    halves.push({
      key: `${r.name}-to`,
      pts: [onRect(to, hub), edge(to)],
      card: r.toCard,
      /* A weak side cannot exist without its parent, which is exactly what a
         double line says. Nothing else in the declaration claims totality. */
      total: r.weakSide === true,
      dashed,
    })
  }

  const recursive = relationships.filter((r) => r.recursive && PLACE[r.from] && DIA[r.name])

  return (
    <>
      <div style={{ overflowX: 'auto', overscrollBehaviorX: 'contain' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', minWidth: MIN_W, height: 'auto', display: 'block' }}
          role="img"
          aria-label={
            `Entity-relationship diagram of Lore's vault in Chen notation: ${entities.length} relations ` +
            `and ${relationships.length} relationships` +
            (spec && specialization
              ? `, with a ${specialization.disjoint ? 'disjoint' : 'overlapping'}` +
                `${specialization.total ? ', total' : ''} specialisation of ${spec.label} into ` +
                `${specialization.subtypes.length} subtypes on ${specialization.discriminator}`
              : '') +
            '. Both are listed in the tables that follow.'
          }
        >
          <title>Lore&apos;s vault — entity-relationship model</title>

          {/* Edges first, so every shape sits on top of the lines that reach it. */}
          {halves.map((h) => (
            <Link key={h.key} pts={h.pts} total={h.total} dashed={h.dashed} />
          ))}

          {/* The recursive relationship: two lines from one entity to one
              diamond. The first leaves straight, the second bows outward, which
              is what stops the pair reading as a single doubled line. */}
          {recursive.map((r) => {
            const b = PLACE[r.from]
            const d = DIA[r.name]
            const top = b.y - b.h / 2
            const a0: Pt = { x: b.x - b.w * 0.21, y: top }
            const b0: Pt = { x: b.x - b.w * 0.05, y: top }
            const end = { x: d.x + d.rx, y: d.y }
            const ctrl = { x: b.x + 35, y: (top + d.y) / 2 - 10 }
            const curve = `M${b0.x},${b0.y} Q${ctrl.x},${ctrl.y} ${end.x},${end.y}`
            /* t = 0.3 along the quadratic — clear of both the entity and the
               diamond, which is where the second cardinality has to live. */
            const at: Pt = {
              x: 0.49 * b0.x + 0.42 * ctrl.x + 0.09 * end.x,
              y: 0.49 * b0.y + 0.42 * ctrl.y + 0.09 * end.y,
            }
            return (
              <g key={r.name}>
                <Link pts={[a0, onDia(d, a0)]} />
                <path d={curve} fill="none" stroke={INK} strokeWidth={1.15} />
                <text
                  x={d.x} y={d.y - d.ry - 12} textAnchor="middle"
                  fontSize={FS.note} fill="var(--accent-text)" fontFamily="var(--font-mono)"
                >
                  recursive
                </text>
                <Card at={along(a0, onDia(d, a0), 26)} text={r.fromCard} />
                <Card at={at} text={r.toCard} />
              </g>
            )
          })}

          {specialization && specBox ? <Isa box={specBox} spec={specialization} /> : null}

          {/* Relationship diamonds. */}
          {relationships.map((r) => {
            const d = DIA[r.name]
            if (!d || r.via) return null
            return (
              <Rhombus
                key={r.name}
                d={d}
                label={r.label}
                identifying={r.weakSide === true}
                dashed={r.synthetic === true}
              />
            )
          })}

          {/* Entities last, so the lines tuck underneath them. */}
          {entities.map((e) => {
            const r = PLACE[e.name]
            if (!r) return null
            const host = hostedBy.get(e.name)
            const synthetic = e.derivedFrom?.synthetic === true
            const sub = synthetic ? 'not in the vault' : e.db
            if (host) {
              return (
                <Associative key={e.name} r={r} name={e.label} sub={sub} label={host.label} />
              )
            }
            return (
              <Box
                key={e.name}
                r={r}
                label={e.label}
                sub={sub}
                weak={e.kind === 'bridge'}
                synthetic={synthetic}
              />
            )
          })}

          {/* Cardinalities in a final pass. */}
          {halves.map((h) => (
            <Card key={`c-${h.key}`} at={along(h.pts[0], h.pts[1], 24)} text={h.card} />
          ))}
        </svg>
      </div>

      {unplaced.length > 0 ? (
        <p className="meta" style={{ marginTop: '0.5rem', color: 'var(--bad)' }}>
          Declared but not drawn: {unplaced.join(', ')}. The declaration has grown past this
          layout; the tables below are still complete.
        </p>
      ) : null}

      <table className="sr-only">
        <caption>The relations drawn above, with their primary keys.</caption>
        <thead>
          <tr>
            <th scope="col">Relation</th>
            <th scope="col">Where it lives</th>
            <th scope="col">Kind</th>
            <th scope="col">Primary key</th>
            <th scope="col" className="n">Properties</th>
          </tr>
        </thead>
        <tbody>
          {entities.map((e) => (
            <tr key={e.name}>
              <th scope="row">{e.label}</th>
              <td>{e.db}</td>
              <td>
                {e.kind === 'strong' ? 'entity' : 'bridge'}
                {e.derivedFrom?.synthetic ? ', reimplementation only' : ''}
                {e.specialization
                  ? `, specialised on ${e.specialization.discriminator} into ${e.specialization.subtypes.length} subtypes`
                  : ''}
              </td>
              <td>{e.pk.join(', ')}</td>
              <td className="n">{e.attrs.length}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="sr-only">
        <caption>The relationships drawn above, with cardinality read at each end.</caption>
        <thead>
          <tr>
            <th scope="col">Relationship</th>
            <th scope="col">From</th>
            <th scope="col">To</th>
            <th scope="col">Cardinality</th>
            <th scope="col">Notes</th>
          </tr>
        </thead>
        <tbody>
          {relationships.map((r) => (
            <tr key={r.name}>
              <th scope="row">{r.label}</th>
              <td>{byName.get(r.from)?.label ?? r.from}</td>
              <td>{byName.get(r.to)?.label ?? r.to}</td>
              <td>
                {r.fromCard}:{r.toCard}
              </td>
              <td>
                {[
                  r.recursive ? 'recursive' : null,
                  r.via ? `bridged by ${r.via}` : null,
                  r.weakSide ? 'identifying; total participation on the weak side' : null,
                  r.synthetic ? 'exists only in the reimplementation' : null,
                  r.participation ? `${r.participation} participation` : null,
                  r.note ?? null,
                ]
                  .filter(Boolean)
                  .join('. ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

/* ------------------------------------------------------------------ shell */

/**
 * Defaults come from the capture, so a caller that just wants the figure writes
 * `<ErDiagram />` and cannot hand it a schema other than the one measured.
 *
 * The frame is optional because the paper already numbers its own exhibits: §4
 * wraps this in a `Figure` of its own, and a figure inside a figure is two
 * borders and two headers around one drawing. Unframed, the notation key follows
 * the picture as a note; framed, it goes where a key belongs, in the footer.
 */
export function ErDiagram({
  entities = schema.entities,
  relationships = schema.relationships,
  framed,
  caption,
  full,
}: {
  entities?: EntityDef[]
  relationships?: RelationshipDef[]
  framed?: boolean
  caption?: ReactNode
  full?: boolean
}) {
  const strong = entities.filter((e) => e.kind === 'strong').length
  const bridges = entities.filter((e) => e.kind === 'bridge')
  const synthetic = bridges.filter((e) => e.derivedFrom?.synthetic)
  const spec = entities.find((e) => e.specialization)?.specialization

  const key = (
    <>
      Rectangle = entity, one Notion database · double rectangle = bridge relation, with no
      identity apart from its parent · a rectangle around a diamond = the bridge that resolves an
      M:N · dashed and in the accent = exists only in the reimplementation
      {synthetic.length === 1 ? ` (${synthetic[0].label}, ` : ' ('}
      the shape a normalised schema would give the <span className="mono">Aliases</span> cell) ·
      diamond = relationship · double diamond = identifying · double line = total participation ·
      M / N / 1 are read at the end nearest each entity
      {spec
        ? ` · ISA with (d) = disjoint and total specialisation on ${spec.discriminator}; the number beside a kind is how many properties exist for that kind alone`
        : ''}
      .
    </>
  )

  const drawing = <Chen entities={entities} relationships={relationships} />

  if (!framed) {
    return (
      <>
        {drawing}
        <p className="meta" style={{ marginTop: '0.75rem' }}>{key}</p>
      </>
    )
  }

  return (
    <Figure
      title="Lore's vault as an entity-relationship model"
      meta={`${n(strong)} databases · ${n(bridges.length)} bridges · ${n(relationships.length)} relationships`}
      caption={caption}
      full={full}
      foot={key}
    >
      {drawing}
    </Figure>
  )
}

/* ------------------------------------------------- property-level catalogue */

/**
 * What the diagram cannot show: the forty-one-property surface of a single
 * Notion database, property by property, under the names Lore gives them.
 *
 * This exists so a reader with their own vault open can check our reconstruction
 * against it — which is why the Lore name and the Notion type are columns rather
 * than footnotes, and why a property we declare but never populate is marked
 * `not modelled` instead of being left out. Leaving it out would make the
 * catalogue agree with the harness by hiding the disagreement.
 *
 * The flags are the paper's argument at property granularity: `derived` marks an
 * expression index materialised as a column, `repeating group` marks a 1NF
 * violation living inside a cell, `valid time` / `transaction time` mark the two
 * bitemporal axes, and a `<kind> only` flag marks a property that is meaningful
 * for one subtype of MEMORY and null for the other nine.
 */
function flagsOf(a: Attr): { text: string; accent: boolean }[] {
  const out: { text: string; accent: boolean }[] = []
  /* The title is flagged because it is the constraint the BCNF violation grows
     out of: every Notion database has exactly one, and it cannot be a relation. */
  if (a.title) out.push({ text: 'title', accent: false })
  if (a.derived) out.push({ text: 'derived', accent: true })
  if (a.repeatingGroup) out.push({ text: 'repeating group', accent: true })
  if (a.system) out.push({ text: 'system-managed', accent: false })
  if (a.temporal) out.push({ text: `${a.temporal} time`, accent: false })
  if (a.discriminator) out.push({ text: 'discriminator', accent: false })
  if (a.subtypeOnly) out.push({ text: `${a.subtypeOnly} only`, accent: false })
  if (a.recursive) out.push({ text: 'self-relation', accent: false })
  if (a.modelled === false) out.push({ text: 'not modelled', accent: false })
  return out
}

export function SchemaTable({
  entity, notes = true,
}: {
  /** A relation name, a database name or a label. Omitted, every database. */
  entity?: string
  notes?: boolean
}) {
  /* No entity named: the whole catalogue, one table per real database, in the
     order `lore init` creates them. The bridges are left out of this mode
     deliberately — they hold nothing but the two keys already drawn in §4, and
     a reader checking their own vault has no bridge to check them against. */
  if (!entity) {
    return (
      <>
        {schema.entities
          .filter((e) => e.kind === 'strong')
          .map((e, i) => (
            <div key={e.name} style={i === 0 ? undefined : { marginTop: '2rem' }}>
              <Catalogue e={e} notes={notes} />
            </div>
          ))}
        <CatalogueKey />
      </>
    )
  }

  const key = entity.toLowerCase()
  const e =
    schema.entities.find((x) => x.name.toLowerCase() === key) ??
    schema.entities.find((x) => x.db.toLowerCase() === key) ??
    schema.entities.find((x) => x.label.toLowerCase() === key)

  if (!e) {
    return (
      <p className="meta" style={{ color: 'var(--bad)' }}>
        No relation named <span className="mono">{entity}</span> in the declaration.
      </p>
    )
  }

  return (
    <>
      <Catalogue e={e} notes={notes} />
      <CatalogueKey />
    </>
  )
}

function Catalogue({ e, notes }: { e: EntityDef; notes: boolean }) {
  const counts = {
    total: e.attrs.length,
    relations: e.attrs.filter((a) => a.notion === 'relation').length,
    derived: e.attrs.filter((a) => a.derived).length,
    system: e.attrs.filter((a) => a.system).length,
    unmodelled: e.attrs.filter((a) => a.modelled === false).length,
  }

  const provenance = e.derivedFrom
    ? e.derivedFrom.synthetic
      ? `Not a database in the vault: projected out of the ${e.derivedFrom.attr} ${e.derivedFrom.notion} cell on ${e.derivedFrom.entity}, and only the reimplementation has it.`
      : `Projected out of the ${e.derivedFrom.attr} ${e.derivedFrom.notion} property on ${e.derivedFrom.entity}.`
    : null

  return (
    <>
      <div className="table-wrap">
        <table>
          {/* The blurb quotes Lore's own property count; the numbers after it
              are ours, and the two are labelled separately because they differ:
              a page body and three timestamps are columns here and are not
              properties there. */}
          <caption>
            <span className="mono">{e.label}</span> · {e.db} · {e.blurb} {n(counts.total)} columns
            in the reimplementation: {n(counts.relations)} relation
            {counts.relations === 1 ? '' : 's'}, {n(counts.derived)} derived,{' '}
            {n(counts.system)} system-managed, {n(counts.unmodelled)} declared but left null by the
            vault generator. {provenance}
          </caption>
          <thead>
            <tr>
              <th scope="col">Property</th>
              <th scope="col">Lore name</th>
              <th scope="col">Notion type</th>
              <th scope="col" className="wrap">Flags</th>
              {notes ? <th scope="col" className="wrap">Note</th> : null}
            </tr>
          </thead>
          <tbody>
            {e.attrs.map((a) => {
              const isPk = e.pk.includes(a.name)
              const t = a.notion ? schema.notionTypes[a.notion] : undefined
              const flags = flagsOf(a)
              return (
                <tr key={a.name}>
                  <th scope="row">
                    <span
                      className="mono"
                      style={{
                        textDecoration: isPk ? 'underline' : undefined,
                        textUnderlineOffset: '0.18em',
                        fontWeight: isPk ? 600 : 460,
                      }}
                    >
                      {a.name}
                    </span>
                    {a.fk ? (
                      <span className="meta" style={{ display: 'block', color: 'var(--accent-text)' }}>
                        → {a.fk}
                      </span>
                    ) : null}
                  </th>
                  <td className="mono">{a.lore ?? '—'}</td>
                  <td>
                    <span className="mono">{a.notion ?? '—'}</span>
                    {t?.limit ? (
                      <span className="meta" style={{ display: 'block' }}>
                        cap {n(t.limit)}
                      </span>
                    ) : null}
                    {a.domain ? (
                      <span className="meta" style={{ display: 'block' }}>
                        {n(a.domain.length)} options
                      </span>
                    ) : null}
                  </td>
                  <td className="wrap">
                    {flags.length === 0 ? (
                      <span style={{ color: 'var(--text-faint)' }}>—</span>
                    ) : (
                      <span
                        style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.25rem' }}
                      >
                        {flags.map((f) => (
                          <span key={f.text} className={f.accent ? 'pill pill-accent' : 'pill'}>
                            {f.text}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  {notes ? (
                    <td className="wrap" style={{ color: 'var(--text-tertiary)' }}>
                      {a.note ?? ''}
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

/**
 * The key to the catalogue.
 *
 * It used to render inside `Catalogue`, which meant it repeated under all five
 * databases — five identical paragraphs in one figure, and on paper five
 * identical paragraphs across four pages. A legend is a property of the table
 * it explains, and there is one table here with five parts.
 */
function CatalogueKey() {
  return (
    <p className="meta" style={{ marginTop: '0.6rem' }}>
      Underlined = primary key · → = foreign key in the reimplementation, a relation property in
      the vault · cap = the limit the Notion API enforces on that type · every name in the two
      middle columns was read from <span className="mono">src/notion/schema.ts</span> at commit{' '}
      {schema.source.commit}.
    </p>
  )
}
