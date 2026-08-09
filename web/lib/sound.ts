/* Interface sound.

   Synthesised with Web Audio rather than shipped as audio files: every cue here
   is under 150ms and a handful of oscillator envelopes, so files would cost more
   bytes than the code and would need decoding before the first cue could fire.

   Three rules, from Apple's audio-haptic guidance:
     causality — a cue fires on the event that caused it, never ambiently;
     harmony   — it lands on the same frame as the visual change it accompanies;
     utility   — cues are reserved for meaningful moments. Over-feedback trains
                 people to ignore all of it, so most interactions stay silent.

   Sound is OFF until the reader turns it on. Audio that plays unasked is hostile,
   and browsers block it before a gesture anyway. */

export type Cue =
  | 'step'      // a compilation phase advanced
  | 'pass'      // a gate accepted the program
  | 'reject'    // a gate refused it
  | 'toggle'    // audience switched
  | 'key'       // a terminal command was submitted
  | 'done'      // a run finished
  | 'select'    // a program or phase was picked

const STORAGE_KEY = 'zero-paper-sound'

let ctx: AudioContext | null = null
let master: GainNode | null = null

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
    master = ctx.createGain()
    // Deliberately quiet. These sit under the reading experience, not on top of it.
    master.gain.value = 0.05
    master.connect(ctx.destination)
  }
  return ctx
}

/* On by default: the reader has to opt *out*, not in. Nothing plays before the
   first interaction anyway — browsers refuse to start an AudioContext without a
   gesture — so the default cannot produce unasked-for noise on load, and the
   switch in the rail turns it off in one click. */
export function soundEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(STORAGE_KEY) !== 'off'
}

/* The preference lives in localStorage, which makes it an external store rather
   than component state. Exposing a subscription lets a control read it with
   useSyncExternalStore instead of copying it into useState from an effect —
   which is both what React now asks for and what keeps two controls, or two
   tabs, from disagreeing about whether sound is on. */
const listeners = new Set<() => void>()

export function subscribeSound(onChange: () => void): () => void {
  listeners.add(onChange)
  // `storage` fires only in the *other* tabs, so this covers cross-tab changes
  // and the notify below covers this one.
  const relay = (e: StorageEvent) => { if (e.key === STORAGE_KEY) onChange() }
  window.addEventListener('storage', relay)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', relay)
  }
}

export function setSoundEnabled(on: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  // Creating the context inside the click that enabled sound satisfies the
  // browser's gesture requirement, so the first real cue is not swallowed.
  if (on) context()?.resume()
  for (const fn of listeners) fn()
}

/* One voice: a pitched blip with a fast attack and an exponential tail. Square
   and sawtooth are avoided — they read as alarms at these durations. */
function blip(
  freq: number,
  { at = 0, dur = 0.07, peak = 1, type = 'sine' as OscillatorType, glideTo = 0 } = {},
) {
  const c = context()
  if (!c || !master) return
  const t = c.currentTime + at
  const osc = c.createOscillator()
  const gain = c.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur)

  // 6ms attack avoids the click a hard start would produce.
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  osc.connect(gain)
  gain.connect(master)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

/* Pitches sit on a pentatonic set so any two cues that overlap stay consonant. */
const P = { c5: 523.25, d5: 587.33, e5: 659.25, g5: 783.99, a5: 880.0, c6: 1046.5, g4: 392.0, e4: 329.63 }

export function play(cue: Cue, index = 0) {
  if (typeof window === 'undefined' || !soundEnabled()) return
  // A reader who asked for reduced motion is telling us they want less, not more.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  switch (cue) {
    case 'step': {
      // Rises through the pipeline so eight steps read as one ascending gesture.
      const scale = [P.c5, P.d5, P.e5, P.g5, P.a5, P.c6, P.d5 * 2, P.e5 * 2]
      blip(scale[index % scale.length], { dur: 0.055, peak: 0.5, type: 'triangle' })
      break
    }
    case 'pass':
      blip(P.e5, { dur: 0.06, peak: 0.55, type: 'sine' })
      blip(P.a5, { at: 0.055, dur: 0.09, peak: 0.5, type: 'sine' })
      break
    case 'reject':
      // Falling minor third, quiet. A buzzer would be punitive for a study aid.
      blip(P.g4, { dur: 0.11, peak: 0.5, type: 'triangle', glideTo: P.e4 })
      break
    case 'toggle':
      blip(P.g5, { dur: 0.035, peak: 0.4, type: 'sine' })
      break
    case 'key':
      blip(P.c6, { dur: 0.022, peak: 0.28, type: 'sine' })
      break
    case 'select':
      blip(P.d5 * 2, { dur: 0.03, peak: 0.3, type: 'sine' })
      break
    case 'done':
      blip(P.c5, { dur: 0.07, peak: 0.5, type: 'sine' })
      blip(P.e5, { at: 0.06, dur: 0.07, peak: 0.5, type: 'sine' })
      blip(P.g5, { at: 0.12, dur: 0.14, peak: 0.45, type: 'sine' })
      break
  }
}
