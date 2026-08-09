/* A bespoke icon set for this paper.

   No icon dependency: a Lucide or Heroicons default is a visual tell, and every
   other mark on the page — the charts, the diagrams, the QR code — is drawn by
   hand. These are too.

   One system, enforced by construction:
   - 24x24 viewBox, 1.75 stroke, round caps and round joins. 1.75 on a 24-grid is
     the optical weight of a 500-weight Geist glyph, so an icon set beside a label
     reads as the same typeface rather than as clip art.
   - Coordinates are whole or half units only. No sub-pixel geometry.
   - Live area is ~2.5 to 21.5 after the stroke halo (0.875) is accounted for.
     Every icon's ink box is centred on 12,12 to within a unit, optically rather
     than mathematically — the play triangle and the tree lean where the eye wants
     them, not where the bounding box does.
   - Rounded rectangles use radius 2.5 at package size and 1 on the 5-unit die.
     Node dots are r 1.75; punctuation dots are r 1.
   - Colour is `currentColor` only, so an icon inherits from the text beside it and
     prints black under the print stylesheet.
   - Nothing depends on detail smaller than ~1 unit, so the whole set survives 16px.

   Shapes that belong to one object are unioned into one <path>; that keeps the
   round joins continuous instead of stacking two caps at a corner.

   The isometric icons (layers, bytes) share the same projection — a 17x10 rhombus
   on a 4-unit vertical pitch — so the IR stack and the artifact box read as two
   views of one geometry rather than two unrelated drawings. */

import type { ReactNode } from 'react'

const PATHS = {
  /* ---------------------------------------------------------------- phases */

  /* Lexical analysis. A scanner above a line of glyphs, the glyph runs uneven
     because a token stream is not a ruler. The lens takes the top two-thirds of
     the box: anything smaller and the handle stops reading as a handle at 16px. */
  scan: (
    <>
      <circle cx="11" cy="10" r="5.5" />
      <path d="M15 14L18 17" />
      <path d="M3.5 19.5H6.5M9 19.5H13M15.5 19.5H20.5" />
    </>
  ),

  /* Syntax analysis. Orthogonal connectors, not diagonals — a diagonal fan at
     16px collapses into the same silhouette as `graph`, and the whole point of
     the pair is that one closes a cycle and the other cannot. The trunk runs
     straight through the bus as a single stroke so the joint stays clean. */
  tree: (
    <>
      <path d="M12 7V17M5.5 11H18.5M5.5 11V17M18.5 11V17" />
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="5.5" cy="19" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
      <circle cx="18.5" cy="19" r="1.75" />
    </>
  ),

  /* The semantic graph. Same node dot as `tree`, but the edges close a cycle —
     which is the whole distinction: a tree cannot, a graph can. */
  graph: (
    <>
      <path d="M11 7.5L6.5 16.5M13 7.5L17.5 16.5M7.5 18H16.5" />
      <circle cx="12" cy="6" r="1.75" />
      <circle cx="5.5" cy="18" r="1.75" />
      <circle cx="18.5" cy="18" r="1.75" />
    </>
  ),

  /* IR and lowering. One plane drawn whole, two more implied beneath it by their
     leading edge only — the representation you can measure but never print. */
  layers: (
    <>
      <path d="M12 3L20.5 8L12 13L3.5 8Z" />
      <path d="M3.5 12L12 17L20.5 12" />
      <path d="M3.5 16L12 21L20.5 16" />
    </>
  ),

  /* Optimization. A 240-degree dial with the needle short of the arc. */
  gauge: (
    <>
      <path d="M5 18A8 8 0 1 1 19 18" />
      <path d="M12 14L14.5 9.5" />
    </>
  ),

  /* Target code generation. A die inside a package, legs on all four sides. */
  chip: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <path d="M9.5 6V3M14.5 6V3M9.5 18V21M14.5 18V21M6 9.5H3M6 14.5H3M18 9.5H21M18 14.5H21" />
    </>
  ),

  /* Linking. Two r5 rings on centres (9,9) and (15,15), each broken at the one
     crossing where the other passes in front — over at one intersection, under at
     the other. Breaking only one ring would read as a Venn diagram; alternating
     the breaks is what makes them interlock. */
  link: (
    <>
      <path d="M13.5 11A5 5 0 1 1 14 9" />
      <path d="M10.5 13A5 5 0 1 1 10 15" />
    </>
  ),

  /* ------------------------------------------------------- gate and verdicts */

  /* The admission gate. An arch on a threshold: a square portal with a crossbar
     read as a window or a table, and the arch is the only curve-topped silhouette
     in the set, so it stays unambiguous next to `chip` and `bytes`. */
  gate: (
    <>
      <path d="M2.5 19.5H21.5" />
      <path d="M6 19.5V11A6 6 0 0 1 18 11V19.5" />
    </>
  ),

  check: <path d="M4.5 12.5L9.5 17.5L19.5 6.5" />,
  cross: <path d="M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5" />,
  minus: <path d="M5.5 12H18.5" />,

  /* The contents menu. Three rules on the same 6.5-unit pitch as `layers`, with
     the middle one short — a plain three-bar mark reads as a generic hamburger,
     and the stepped edge says "a list" rather than "a menu of anything". */
  menu: <path d="M4.5 6.5H19.5M4.5 12H14.5M4.5 17.5H19.5" />,

  /* ------------------------------------------------------------- measurement */

  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12L15.5 13.5" />
    </>
  ),

  /* Artifact size. The same rhombus as `layers`, closed into a solid box. */
  bytes: (
    <>
      <path d="M12 3L20.5 8L12 13L3.5 8Z" />
      <path d="M3.5 8V16L12 21L20.5 16V8" />
      <path d="M12 13V21" />
    </>
  ),

  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.5" />
    </>
  ),

  /* ---------------------------------------------------------------- actions */

  /* The prompt, without a window chrome: at 16px a bezel would swallow the
     chevron, and the chevron is the part that means "terminal". */
  terminal: (
    <>
      <path d="M4.5 7L10.5 12L4.5 17" />
      <path d="M12.5 17H19.5" />
    </>
  ),

  /* Nudged half a unit right of the bounding-box centre: a right-pointing
     triangle carries its mass on the left and looks off-centre if you trust the
     arithmetic. */
  play: <path d="M6.5 5.5L18.5 12L6.5 18.5Z" />,

  download: (
    <>
      <path d="M12 3.5V15M7.5 10.5L12 15L16.5 10.5" />
      <path d="M4 17.5V20H20V17.5" />
    </>
  ),

  /* The narration toggle. One speaker body, drawn identically in both states; the
     state is carried by what sits to its right — two emission arcs, or the same X
     used by `cross`. Shape, not colour, so the control still reads in greyscale.
     Both arcs are struck from the cone mouth rather than from 12,12, so they look
     like they radiate from the speaker instead of from the middle of the box. */
  soundOn: (
    <>
      <path d="M4.5 9.5H8L13 5.5V18.5L8 14.5H4.5Z" />
      <path d="M15.5 9.5A4 4 0 0 1 15.5 14.5M17.5 7A7 7 0 0 1 17.5 17" />
    </>
  ),
  soundOff: (
    <>
      <path d="M4.5 9.5H8L13 5.5V18.5L8 14.5H4.5Z" />
      <path d="M16 10L20 14M20 10L16 14" />
    </>
  ),

  arrowRight: <path d="M4.5 12H19.5M14.5 7L19.5 12L14.5 17" />,
  arrowDown: <path d="M12 4.5V19.5M7 14.5L12 19.5L17 14.5" />,

  /* ----------------------------------------------------------------- actors */

  human: (
    <>
      <circle cx="12" cy="6.5" r="3.5" />
      <path d="M4.5 20A7.5 7.5 0 0 1 19.5 20" />
    </>
  ),

  /* The agent. Deliberately the same head-over-body composition as `human` so the
     two can sit side by side in the segmented control, but squared, antennaed and
     eyed rather than shouldered. */
  machine: (
    <>
      <path d="M12 4V7.5" />
      <rect x="4.5" y="7.5" width="15" height="12" rx="2.5" />
      <path d="M9.5 12V14.5M14.5 12V14.5" />
      <path d="M4.5 13.5H3M19.5 13.5H21" />
    </>
  ),

  /* ------------------------------------------------------------- documentary */

  book: (
    <>
      <path d="M12 7L4 4.5V17L12 19.5L20 17V4.5Z" />
      <path d="M12 7V19.5" />
    </>
  ),

  warning: (
    <>
      <path d="M12 4L20.5 20H3.5Z" />
      <path d="M12 9V13" />
      <circle cx="12" cy="16.5" r="1" />
    </>
  ),

  info: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="8" r="1" />
      <path d="M12 11.5V16.5" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof PATHS

export const ICON_NAMES = Object.keys(PATHS) as IconName[]

/* One icon per canonical phase, keyed by CLASSICAL_PHASES id, so a phase is
   never drawn one way in the diagram and another way in the table. */
export const PHASE_ICON: Record<string, IconName> = {
  lexical: 'scan',
  syntax: 'tree',
  semantic: 'graph',
  ir: 'layers',
  optimize: 'gauge',
  codegen: 'chip',
}

/* `label` decides the accessibility contract. Give it when the icon is the only
   carrier of meaning — an icon-only button, a verdict cell with no adjacent word.
   Omit it when text beside the icon already says the same thing, so a screen
   reader hears the label once rather than twice. */
export function Icon({
  name,
  size = 18,
  label,
}: {
  name: IconName
  size?: number
  label?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      /* inline-block keeps the icon on the text baseline in prose; as a flex item
         inside .btn or .pill the display is blockified and the shrink guard is
         what matters. Both cases are covered without a wrapper. */
      style={{ display: 'inline-block', verticalAlign: '-0.145em', flex: '0 0 auto' }}
    >
      {label ? <title>{label}</title> : null}
      {PATHS[name]}
    </svg>
  )
}
