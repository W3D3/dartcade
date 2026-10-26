// Short Web Audio tones; silent where there is no AudioContext.

let shared: AudioContext | null = null

/** The page's one AudioContext (tones and the caller), made on first use; null where there is none. */
export function audioContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  shared ??= new AudioContext()
  // Browsers start it suspended until the page has been interacted with
  if (shared.state === 'suspended') void shared.resume().catch(() => undefined)
  return shared
}

/** Every effect peaks here at full volume (dBFS): the packs and beeps are matched to it, with
 *  headroom so a few overlapping effects can't clip. */
export const TARGET_DB = -12
const TARGET = 10 ** (TARGET_DB / 20)
/** The effects' share of their volume while the caller speaks. */
export const DUCKED = 0.3
// The duck's time constant: it settles in about 3τ, 75 ms
const DUCK_TAU_S = 0.025

/** The gain for the effects volume setting (0–1): a curve, so the slider's range is heard evenly. */
export const effectsGain = (v: number) => v * v

let bus: GainNode | null = null
/** Where every sound effect plays into: one node, ducked while the caller speaks. */
export function effectsBus(ctx: AudioContext): GainNode {
  if (!bus) {
    bus = ctx.createGain()
    bus.connect(ctx.destination)
  }
  return bus
}

/** Ducks the effects from `from` until `until` (the context's time), ramping down and back up. */
export function duckEffects(from: number, until: number): void {
  if (!shared) return
  const g = effectsBus(shared).gain
  const start = Math.max(from, shared.currentTime)
  g.cancelScheduledValues(start)
  g.setTargetAtTime(DUCKED, start, DUCK_TAU_S)
  g.setTargetAtTime(1, Math.max(until, start), DUCK_TAU_S)
}

/** Brings the effects back up now (a call cut off). */
export function unduckEffects(): void {
  if (!shared || !bus) return
  const now = shared.currentTime
  bus.gain.cancelScheduledValues(now)
  bus.gain.setTargetAtTime(1, now, DUCK_TAU_S)
}

/** The beeps, each at `TARGET_DB`: a beep's tones are full-scale waves, so its gain is its peak. */
export function createSounds(volume: () => number) {
  function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
    glide(freq, freq, dur, type, vol, delay)
  }
  /** A tone sliding from `from` to `to` Hz; `delay` seconds from now. */
  function glide(from: number, to: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
    const gainValue = vol * effectsGain(volume())
    if (gainValue <= 0) return
    const ctx = audioContext()
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(effectsBus(ctx))
    osc.type = type
    const start = ctx.currentTime + delay
    osc.frequency.setValueAtTime(from, start)
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, start + dur)
    gain.gain.setValueAtTime(gainValue, start)
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur)
    osc.start(start)
    osc.stop(start + dur)
  }

  return {
    hit: () => tone(880, 0.12, 'sine', TARGET),
    /** A treble: the hit's ping, then a higher one. */
    treble: () => [880, 1320].forEach((f, i) => tone(f, 0.1, 'sine', TARGET, i * 0.07)),
    miss: () => tone(200, 0.18, 'sawtooth', TARGET),
    switchPlayer: () => tone(440, 0.08, 'sine', TARGET),
    bust: () => tone(150, 0.35, 'square', TARGET),
    /** The ball knocking into a rail, bumper or ball. */
    knock: () => tone(1400, 0.035, 'triangle', TARGET),
    /** The ball dropping into the cup: a falling plop. */
    cup: () => glide(700, 180, 0.22, 'sine', TARGET),
    /** A short rising fanfare. */
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i === 3 ? 0.45 : 0.16, 'triangle', TARGET, i * 0.13)),
  }
}
