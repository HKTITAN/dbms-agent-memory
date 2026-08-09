'use client'

/* The reading rail.

   A sticky left column carrying the table of contents, the two downloads and the
   sound switch — the shape Anthropic uses on the Constitution page: a narrow
   aside beside a wide article, contents on top, download CTAs beneath.

   Scroll position drives which entry is marked current, via IntersectionObserver
   rather than a scroll handler, so reading never contends with layout work. */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Icon } from '@/components/icons'
import { play, soundEnabled, setSoundEnabled, subscribeSound } from '@/lib/sound'

export type TocEntry = { id: string; label: string }

/* ------------------------------------------------------------- downloads */

type Download = {
  href: string
  label: string
  meta: string
  preview: string
  previewAlt: string
}

function DownloadLink({ item }: { item: Download }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLAnchorElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // A short delay stops the preview flashing as the pointer crosses the rail on
  // its way somewhere else; leaving closes immediately, because a lingering
  // panel over the text is worse than a late one.
  const show = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(true), 180)
  }, [])
  const hide = useCallback(() => {
    clearTimeout(timer.current)
    setOpen(false)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <span
      style={{ position: 'relative', display: 'block' }}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <a
        ref={ref}
        className="btn"
        href={item.href}
        download
        onFocus={show}
        onBlur={hide}
        onClick={() => play('done')}
        style={{ width: '100%', justifyContent: 'flex-start', minHeight: 36, fontSize: '0.8125rem' }}
      >
        <Icon name="download" size={15} />
        {item.label}
        <span className="meta" style={{ marginLeft: 'auto', fontSize: '0.6875rem' }}>{item.meta}</span>
      </a>

      {/* Preview. Scales out of the link it belongs to rather than from its own
          centre, so the panel reads as coming from the control the reader is on.
          Pointer-events off: it is a preview, not a target.

          `rail-preview` is what removes it below 1080px. The flyout is placed at
          left: 100% + 10px, which is inside the viewport only while the rail is a
          208px column; once the rail goes full-width that lands past the right
          edge, and opacity: 0 does not spare the page — a transparent box still
          contributes scrollable overflow, so the body gained ~180px of sideways
          scroll. There is no hover on that layout anyway. */}
      <span
        aria-hidden="true"
        className="rail-preview"
        style={{
          position: 'absolute',
          left: 'calc(100% + 10px)',
          top: -8,
          zIndex: 40,
          pointerEvents: 'none',
          opacity: open ? 1 : 0,
          transform: open ? 'none' : 'translateX(-6px) scale(0.97)',
          transformOrigin: 'left center',
          transition: open
            ? 'opacity var(--dur-enter) var(--ease-out), transform var(--dur-enter) var(--ease-out)'
            : 'opacity var(--dur-exit) var(--ease-soft), transform var(--dur-exit) var(--ease-soft)',
          /* `display` is deliberately NOT set here. It belongs to .rail-preview,
             because an inline display would outrank the stylesheet and the
             narrow-screen rule could never take the flyout out of the layout. */
        }}
      >
        <span
          style={{
            display: 'block',
            width: 168,
            padding: 6,
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-lifted)',
          }}
        >
          {/* Reserve the box before the image decodes so nothing jumps. */}
          <span
            style={{
              display: 'block', width: '100%', aspectRatio: '3 / 4',
              background: 'var(--bg-sunken)', borderRadius: 3, overflow: 'hidden',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.preview}
              alt={item.previewAlt}
              width={156}
              height={208}
              loading="lazy"
              decoding="async"
              style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
            />
          </span>
          <span className="meta" style={{ display: 'block', marginTop: 6, fontSize: '0.6875rem' }}>
            {item.previewAlt}
          </span>
        </span>
      </span>
    </span>
  )
}

/* ----------------------------------------------------------- sound switch */

function SoundSwitch() {
  /* localStorage is not readable during the static render, so the server
     snapshot is `false` and the real value arrives on hydration. Subscribing
     rather than copying into state keeps this switch in step with any other
     reader of the preference, including one in another tab. */
  const on = useSyncExternalStore(subscribeSound, soundEnabled, () => false)

  return (
    <button
      type="button"
      className="btn"
      aria-pressed={on}
      onClick={() => {
        const next = !on
        // Writing notifies subscribers, which is what re-renders this button.
        setSoundEnabled(next)
        // Confirm the new state in the medium being switched.
        if (next) play('toggle')
      }}
      style={{ width: '100%', justifyContent: 'flex-start', minHeight: 36, fontSize: '0.8125rem' }}
    >
      <Icon name={on ? 'soundOn' : 'soundOff'} size={15} />
      Sound
      <span className="meta" style={{ marginLeft: 'auto', fontSize: '0.6875rem' }}>
        {on ? 'on' : 'off'}
      </span>
    </button>
  )
}

/* ------------------------------------------------------------- the rail */

export function Sidebar({
  entries, downloads, children,
}: {
  entries: TocEntry[]
  downloads: Download[]
  children?: React.ReactNode
}) {
  const [active, setActive] = useState<string>(entries[0]?.id ?? '')

  /* Below the rail breakpoint the contents cannot sit beside the article, and
     stacking nineteen links above it means scrolling past a table of contents
     to reach the paper. On those widths the rail becomes a bar with a menu
     button, and this holds whether that menu is open.

     It is deliberately NOT a modal: the panel pushes nothing, traps nothing and
     dims nothing. It is a disclosure, so the page behind it stays readable and
     Escape or a second press closes it. */
  const [menuOpen, setMenuOpen] = useState(false)

  // Escape closes, which is what any transient panel over content should do.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  useEffect(() => {
    const targets = entries
      .map((e) => document.getElementById(e.id))
      .filter((el): el is HTMLElement => el !== null)
    if (targets.length === 0) return

    // The band sits near the top of the viewport: the current section is the one
    // whose heading the reader has most recently passed, not whatever happens to
    // occupy the most pixels.
    const io = new IntersectionObserver(
      (records) => {
        const visible = records
          .filter((r) => r.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-72px 0px -72% 0px', threshold: 0 },
    )
    targets.forEach((t) => io.observe(t))
    return () => io.disconnect()
  }, [entries])

  return (
    <aside
      className="reading-rail no-print"
      data-menu-open={menuOpen ? 'true' : 'false'}
      aria-label="Paper contents and downloads"
    >
      {/* The compact control. CSS shows it only below the rail breakpoint, so a
          desktop reader never sees a menu button for a menu that is already
          open beside them. */}
      <button
        type="button"
        className="btn rail-toggle"
        aria-expanded={menuOpen}
        aria-controls="rail-contents"
        onClick={() => { setMenuOpen((v) => !v); play('toggle') }}
      >
        <Icon name={menuOpen ? 'cross' : 'menu'} size={16} />
        Contents
        <span className="meta" style={{ marginLeft: 'auto', fontSize: '0.6875rem' }}>
          {entries.length} sections
        </span>
      </button>

      <nav aria-label="Contents" id="rail-contents">
        <p className="label rail-heading" style={{ margin: '0 0 0.5rem', fontSize: '0.6875rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Contents
        </p>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {entries.map((e) => {
            const current = e.id === active
            return (
              <li key={e.id}>
                <a
                  href={`#${e.id}`}
                  aria-current={current ? 'true' : undefined}
                  onClick={() => { play('select'); setMenuOpen(false) }}
                  className="rail-link"
                  data-current={current ? 'true' : undefined}
                >
                  {e.label}
                </a>
              </li>
            )
          })}
        </ol>
      </nav>

      <div style={{ display: 'grid', gap: 8 }}>
        {downloads.map((d) => <DownloadLink key={d.href} item={d} />)}
        <SoundSwitch />
      </div>

      {children}
    </aside>
  )
}
