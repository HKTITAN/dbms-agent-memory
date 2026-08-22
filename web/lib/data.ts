/**
 * The single read of the dataset.
 *
 * `capture.json` is imported at build time and inlined into the render, so the
 * published page has no runtime dependency and the PDF, the ePub and the web
 * edition are all typeset from the same bytes. Every number in the paper comes
 * through this module. If a figure wants a number that is not here, the number
 * does not exist yet and the harness has to be changed — not the prose.
 */

import raw from '../data/capture.json'
import type { Capture, Agg, QuestionClass, EntityDef, Attr } from './types'

export const capture = raw as unknown as Capture

/* ------------------------------------------------------------- formatting */

/** Thin space between groups of three, which reads better than a comma in a table. */
export function n(x: number | null | undefined, digits = 0): string {
  if (x == null || Number.isNaN(x)) return '—'
  const s = x.toFixed(digits)
  const [int, frac] = s.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return frac ? `${grouped}.${frac}` : grouped
}

export function pct(x: number | null | undefined, digits = 1): string {
  if (x == null || Number.isNaN(x)) return '—'
  return `${(x * 100).toFixed(digits)}%`
}

/** A multiplier, rendered so 1 213.9 does not read as noise. */
export function times(x: number): string {
  if (x >= 1000) return `${n(Math.round(x))}×`
  if (x >= 100) return `${x.toFixed(0)}×`
  if (x >= 10) return `${x.toFixed(1)}×`
  return `${x.toFixed(1)}×`
}

export function bytes(x: number): string {
  if (x < 1024) return `${n(x)} B`
  if (x < 1024 ** 2) return `${(x / 1024).toFixed(1)} kB`
  if (x < 1024 ** 3) return `${(x / 1024 ** 2).toFixed(2)} MB`
  return `${(x / 1024 ** 3).toFixed(2)} GB`
}

/** Seconds into something a reader can feel. */
export function duration(seconds: number): string {
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)} ms`
  if (seconds < 90) return `${seconds.toFixed(1)} s`
  if (seconds < 5400) return `${(seconds / 60).toFixed(1)} min`
  return `${(seconds / 3600).toFixed(1)} h`
}

/* ------------------------------------------------------------- selectors */

export const arms = capture.arms
export const primaryArms = capture.arms.filter((a) => !a.id.endsWith('-noindex'))
export const classes: QuestionClass[] = capture.workload.classes
export const schema = capture.schema
export const exp = capture.experiments
export const limits = capture.apiLimits
export const vault = capture.vault

export const notion = () => capture.byArm.notion
export const sqlite = () => capture.byArm.sqlite
export const postgres = () => capture.byArm.postgres

export function armClass(arm: string, cls: string): Agg | null {
  return capture.byArmClass[arm]?.[cls] ?? null
}

export function amp(cls: string) {
  return capture.amplification[cls]
}

/** Classes ordered by how much extra work the substrate has to do. */
export const classesByAmplification = [...classes].sort(
  (a, b) => (capture.amplification[b.id]?.roundTrips ?? 0) - (capture.amplification[a.id]?.roundTrips ?? 0),
)

/** The single largest amplification, used in the abstract. */
export const worstClass = classesByAmplification[0]

/** Total round trips the Notion arm issued across the whole workload. */
export const totalNotionRoundTrips = capture.rows
  .filter((r) => r.arm === 'notion')
  .reduce((s, r) => s + r.roundTrips, 0)

export const totalSqlStatements = capture.rows
  .filter((r) => r.arm === 'sqlite')
  .reduce((s, r) => s + r.roundTrips, 0)

/** How long the whole workload would take against one token at 3 req/s. */
export const workloadFloorSeconds = totalNotionRoundTrips / limits.requestsPerSecond

/* --------------------------------------------------------------- schema */

export const strongEntities = schema.entities.filter((e) => e.kind === 'strong')
export const bridgeEntities = schema.entities.filter((e) => e.kind === 'bridge')

export function attrsOf(name: string): Attr[] {
  return schema.entities.find((e) => e.name === name)?.attrs ?? []
}

export function entityOf(name: string): EntityDef | undefined {
  return schema.entities.find((e) => e.name === name)
}

/** Properties across the five real databases — the size of the surface. */
export const totalProperties = Object.values(schema.propertyCounts).reduce((s, p) => s + p.total, 0)
export const totalRelationProperties = Object.values(schema.propertyCounts).reduce((s, p) => s + p.relations, 0)
export const totalDerivedProperties = Object.values(schema.propertyCounts).reduce((s, p) => s + p.derived, 0)

/** The normalisation violations that ship, as opposed to the ones we walk through. */
export const survivingViolations = schema.normalization.filter((s) => s.survives)

/** Invariants with no declarative enforcement anywhere in the substrate. */
export const unenforcedInvariants = schema.invariants.filter(
  (i) => i.enforcedBy.startsWith('nothing') || i.enforcedBy.startsWith('not verifiable'),
)

/* ------------------------------------------------------------ derived text */

export const capturedOn = new Date(capture.capturedAt).toLocaleDateString('en-GB', {
  year: 'numeric', month: 'long', day: 'numeric',
})

export const commit = capture.toolchain.commit ?? 'working tree'
