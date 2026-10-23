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

export function createSounds(volume: () => number) {
  function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
    glide(freq, freq, dur, type, vol, delay)
  }
  /** A tone sliding from `from` to `to` Hz; `delay` seconds from now. */
  function glide(from: number, to: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
    const gainValue = vol * volume()
    if (gainValue <= 0) return
    const ctx = audioContext()
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
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
    hit: () => tone(880, 0.12, 'sine', 0.3),
    /** A treble: the hit's ping, then a higher one. */
    treble: () => [880, 1320].forEach((f, i) => tone(f, 0.1, 'sine', 0.28, i * 0.07)),
    miss: () => tone(200, 0.18, 'sawtooth', 0.18),
    switchPlayer: () => tone(440, 0.08, 'sine', 0.2),
    bust: () => tone(150, 0.35, 'square', 0.16),
    /** The ball knocking into a rail, bumper or ball. */
    knock: () => tone(1400, 0.035, 'triangle', 0.25),
    /** The ball dropping into the cup: a falling plop. */
    cup: () => glide(700, 180, 0.22, 'sine', 0.35),
    /** A short rising fanfare. */
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i === 3 ? 0.45 : 0.16, 'triangle', 0.25, i * 0.13)),
  }
}
