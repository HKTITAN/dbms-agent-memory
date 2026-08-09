'use client'

/* Human / machine reading modes.

   This paper is about what an agent stores and retrieves, so the reader is
   offered the same two views the argument distinguishes. Switch to MACHINE and a
   section stops explaining and starts showing the records themselves, with the
   byte and token cost of reading them printed on the block — the cost §6.10
   measures, paid by the reader.

   Four decisions worth stating:

   1. The thumb is one element positioned by transform, measured from the real
      buttons rather than assumed to be 50% wide. HUMAN and MACHINE are different
      lengths, so a half-width thumb would be wrong on both ends, and animating
      `left` would move the element off the compositor.

   2. Motion is suppressed for keyboard-initiated switches. Arrow keys repeat when
      held; a 260ms slide per repeat is noise, and the animations skill excludes
      keyboard changes for exactly that reason. `event.detail` distinguishes a real
      pointer click (>0) from Enter/Space activation (0), so the distinction costs
      nothing.

   3. Nothing animates on the first paint, including the restore of a stored
      preference. An element arriving in its resting position is not a transition.

   4. Preference order is URL, then localStorage, then 'human'. A pasted
      ?view=machine link is a deliberate statement about how this copy of the paper
      should read, so it outranks whatever the browser happens to remember. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Icon, type IconName } from '@/components/icons'
import { estimateLlmTokens } from '@/lib/tokens'
import { play } from '@/lib/sound'

export type AudienceMode = 'human' | 'machine'

const STORAGE_KEY = 'dbms-memory-audience'
const URL_PARAM = 'view'

/* useLayoutEffect is the right hook — the thumb must be measured before the
   browser paints it — but React logs on the server, where layout effects do not
   run at all. This is the standard alias, not a workaround for a bug. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/* --------------------------------------------------------------- context */

type SetOptions = {
  /* False when the change came from the keyboard or from restoring a stored
     preference. Defaults to true. */
  animate?: boolean
}

type AudienceContextValue = {
  audience: AudienceMode
  setAudience: (next: AudienceMode, options?: SetOptions) => void
  /* Count of switches since mount. 0 on the first paint, which is how `Audience`
     knows the content it is rendering was never swapped in. */
  switches: number
  animate: boolean
}

const AudienceContext = createContext<AudienceContextValue>({
  audience: 'human',
  setAudience: () => {},
  switches: 0,
  animate: false,
})

function isMode(v: unknown): v is AudienceMode {
  return v === 'human' || v === 'machine'
}

/* URL first, storage second. Returns null when the reader has expressed no
   preference at all, so the default is left untouched and no URL is rewritten. */
function readPreference(): AudienceMode | null {
  if (typeof window === 'undefined') return null
  const fromUrl = new URLSearchParams(window.location.search).get(URL_PARAM)
  if (isMode(fromUrl)) return fromUrl
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isMode(stored)) return stored
  } catch {
    /* Storage blocked (private mode, third-party context). The default stands. */
  }
  return null
}

/* Written from the event that caused the change rather than from an effect, so
   the order of writes is the order of the reader's actions.

   `replaceState` rather than `pushState`: a view switch is a display preference,
   not a destination, and stacking history entries would make Back mean two
   different things on the same page. 'human' is the default, so it is expressed
   by the absence of the parameter — a clean link is the common case. */
function persist(mode: AudienceMode) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* Storage blocked. The URL below still carries the state. */
  }
  const url = new URL(window.location.href)
  if (mode === 'machine') url.searchParams.set(URL_PARAM, mode)
  else url.searchParams.delete(URL_PARAM)
  window.history.replaceState(window.history.state, '', url.toString())
}

export function AudienceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    audience: AudienceMode
    switches: number
    animate: boolean
  }>({ audience: 'human', switches: 0, animate: false })

  const setAudience = useCallback((next: AudienceMode, options?: SetOptions) => {
    persist(next)
    setState((s) =>
      s.audience === next
        ? s
        : { audience: next, switches: s.switches + 1, animate: options?.animate !== false },
    )
  }, [])

  /* Restore before paint. The static HTML always ships the human view, so a
     stored 'machine' preference does cost one frame of prose — the alternative is
     a render-blocking inline script, which is not a trade this page should make
     for a display preference. `switches` stays at 0 so nothing animates. */
  useIsomorphicLayoutEffect(() => {
    const stored = readPreference()
    if (!stored) return
    persist(stored)
    setState((s) => (s.audience === stored ? s : { audience: stored, switches: 0, animate: false }))
  }, [])

  /* Publish the mode on the document element so the whole page can be themed
     from one attribute rather than by threading a prop through every component.
     The two audiences get two canvases: the human edition is the light reading
     surface the paper was designed for; the machine edition is dark, because it
     shows what a program consumes — records and streams, the register of a
     terminal rather than a page.

     `color-scheme` is set alongside it so form controls, scrollbars and the
     browser's own UI follow, instead of a dark page keeping light scrollbars. */
  useIsomorphicLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.audience = state.audience
    root.style.colorScheme = state.audience === 'machine' ? 'dark' : 'light'
  }, [state.audience])

  /* Play the settle over the re-typeset. It runs on the article only — not the
     rail or the masthead, which do not change register — and the class is
     removed as soon as the animation ends so a second switch can restart it.
     `switches === 0` is the restore-from-storage path, which must not animate. */
  useIsomorphicLayoutEffect(() => {
    if (state.switches === 0 || !state.animate) return
    const main = document.getElementById('main')
    if (!main) return
    main.classList.remove('audience-settle')
    // Reading offsetWidth forces the removal to commit, so re-adding the class
    // starts a new animation instead of continuing the old one.
    void main.offsetWidth
    main.classList.add('audience-settle')
    const done = () => main.classList.remove('audience-settle')
    main.addEventListener('animationend', done, { once: true })
    return () => main.removeEventListener('animationend', done)
  }, [state.switches, state.animate])

  const value = useMemo<AudienceContextValue>(
    () => ({
      audience: state.audience,
      setAudience,
      switches: state.switches,
      animate: state.animate,
    }),
    [state, setAudience],
  )

  return <AudienceContext.Provider value={value}>{children}</AudienceContext.Provider>
}

export function useAudience(): {
  audience: AudienceMode
  setAudience: (next: AudienceMode, options?: SetOptions) => void
} {
  const { audience, setAudience } = useContext(AudienceContext)
  return { audience, setAudience }
}

/* ---------------------------------------------------------------- toggle */

const OPTIONS: { id: AudienceMode; label: string; icon: IconName }[] = [
  { id: 'human', label: 'Human', icon: 'human' },
  { id: 'machine', label: 'Machine', icon: 'machine' },
]

export function AudienceToggle() {
  const { audience, setAudience, animate } = useContext(AudienceContext)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttons = useRef<Partial<Record<AudienceMode, HTMLButtonElement | null>>>({})
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null)
  const [ready, setReady] = useState(false)

  /* offsetLeft is measured from the padding edge of the positioned ancestor, and
     the thumb's own `left` is the container's padding — so the transform is the
     difference. The padding is read rather than hardcoded, so the control cannot
     drift out of alignment if globals.css retunes it. */
  const measure = useCallback(() => {
    const wrap = wrapRef.current
    const btn = buttons.current[audience]
    if (!wrap || !btn) return
    const pad = Number.parseFloat(getComputedStyle(wrap).paddingLeft) || 0
    const next = { x: Math.round(btn.offsetLeft - pad), w: btn.offsetWidth }
    setThumb((t) => (t && t.x === next.x && t.w === next.w ? t : next))
  }, [audience])

  useIsomorphicLayoutEffect(() => {
    measure()
  }, [measure])

  /* ResizeObserver on the buttons rather than a window listener alone: the labels
     also change width when the webfont swaps in, which no resize event reports. */
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(wrap)
    for (const el of Object.values(buttons.current)) if (el) ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  /* The transition is withheld until one measured position has been painted,
     otherwise the thumb would animate its width from 0 on page load — motion on
     an element that is only arriving at rest. */
  useIsomorphicLayoutEffect(() => {
    if (!thumb || ready) return
    const id = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(id)
  }, [thumb, ready])

  const choose = useCallback(
    (next: AudienceMode, withMotion: boolean) => {
      if (next === audience) return
      setAudience(next, { animate: withMotion })
      play('toggle')
    },
    [audience, setAudience],
  )

  /* Arrow keys move between the options and take the selection with them, the way
     a segmented control behaves on every platform that has one. Focus follows, so
     the reader can keep pressing without re-Tabbing. */
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      const i = OPTIONS.findIndex((o) => o.id === audience)
      let target = i
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          target = (i + OPTIONS.length - 1) % OPTIONS.length
          break
        case 'ArrowRight':
        case 'ArrowDown':
          target = (i + 1) % OPTIONS.length
          break
        case 'Home':
          target = 0
          break
        case 'End':
          target = OPTIONS.length - 1
          break
        default:
          return
      }
      e.preventDefault()
      const id = OPTIONS[target].id
      buttons.current[id]?.focus()
      choose(id, false)
    },
    [audience, choose],
  )

  return (
    <div
      ref={wrapRef}
      className="segmented no-print"
      role="group"
      aria-label="Reading audience"
    >
      <span
        className="segmented-thumb"
        aria-hidden="true"
        style={{
          width: thumb?.w ?? 0,
          transform: `translateX(${thumb?.x ?? 0}px)`,
          transition: ready && animate ? undefined : 'none',
        }}
      />
      {OPTIONS.map((o) => {
        const selected = o.id === audience
        return (
          <button
            key={o.id}
            type="button"
            ref={(el) => {
              buttons.current[o.id] = el
            }}
            aria-pressed={selected}
            onClick={(e) => choose(o.id, e.detail > 0)}
            onKeyDown={onKeyDown}
          >
            <Icon name={o.icon} size={15} />
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* --------------------------------------------------------------- switcher */

export function Audience({ human, machine }: { human: ReactNode; machine: ReactNode }) {
  const { audience, switches, animate } = useContext(AudienceContext)
  /* Keyed so the incoming block is a new element: re-applying a class that is
     already there would not restart the animation on a second switch back. */
  return (
    <div key={audience} className={switches > 0 && animate ? 'swap-enter' : undefined}>
      {audience === 'human' ? human : machine}
    </div>
  )
}

/* ------------------------------------------------------------ machine block */

/* JSON is machine-generated and therefore well-formed, so one pass over strings,
   literals and numbers is enough — everything between matches is structure. */
const JSON_TOKEN = /"(?:[^"\\]|\\.)*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g

function highlight(json: string): { cls: string; text: string }[] {
  const out: { cls: string; text: string }[] = []
  let last = 0
  for (const m of json.matchAll(JSON_TOKEN)) {
    const at = m.index ?? 0
    if (at > last) out.push({ cls: 'tok-punc', text: json.slice(last, at) })
    const text = m[0]
    last = at + text.length
    const cls = !text.startsWith('"')
      ? /^[a-z]/.test(text)
        ? 'tok-kw'
        : 'tok-num'
      : /^\s*:/.test(json.slice(last))
        ? 'tok-fn'
        : 'tok-str'
    out.push({ cls, text })
  }
  if (last < json.length) out.push({ cls: 'tok-punc', text: json.slice(last) })
  return out
}

/* Grouped by hand rather than with toLocaleString, which would format one way in
   the Node process that renders the static HTML and another in a browser set to a
   different locale — a hydration mismatch on a number nobody would think to check. */
function group(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function MachineBlock({ data, caption }: { data: unknown; caption?: string }) {
  const json = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2) ?? 'null'
    } catch {
      /* Circular or otherwise unserialisable: say so rather than crash the page. */
      return '/* value is not serialisable to JSON */'
    }
  }, [data])

  const pieces = useMemo(() => highlight(json), [json])
  const bytes = useMemo(() => new TextEncoder().encode(json).length, [json])
  const tokens = estimateLlmTokens(json)

  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback(() => {
    navigator.clipboard
      ?.writeText(json)
      .then(() => {
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 1600)
      })
      .catch(() => {
        /* Clipboard denied. The block below is selectable text either way. */
      })
  }, [json])

  return (
    <div className="code-block">
      <div className="code-head" style={{ flexWrap: 'wrap', rowGap: '0.375rem' }}>
        <span style={{ overflowWrap: 'anywhere' }}>{caption ?? 'record'}</span>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.875rem',
            marginLeft: 'auto',
          }}
        >
          <span className="num" title="UTF-8 bytes, and an estimate at four characters per token">
            {group(bytes)} B · ~{group(tokens)} tokens
          </span>
          <button
            type="button"
            className="btn no-print"
            onClick={copy}
            /* Width reserved for the longer label so the head cannot reflow when
               the state changes, and the state is carried by word plus glyph
               rather than by colour. */
            style={{ minWidth: 104, fontSize: '0.75rem' }}
          >
            <Icon name={copied ? 'check' : 'download'} size={14} />
            {copied ? 'Copied' : 'Copy JSON'}
          </button>
        </span>
      </div>
      <pre style={{ maxHeight: 460, overflowY: 'auto', overscrollBehavior: 'contain' }}>
        <code>
          {pieces.map((p, i) => (
            <span key={i} className={p.cls}>
              {p.text}
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}
