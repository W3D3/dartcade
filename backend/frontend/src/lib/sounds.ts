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
  function tone(freq: number, dur: number, type: OscillatorType, vol: number) {
    const gainValue = vol * volume()
    if (gainValue <= 0) return
    const ctx = audioContext()
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(gainValue, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    osc.start()
    osc.stop(ctx.currentTime + dur)
  }

  return {
    hit: () => tone(880, 0.12, 'sine', 0.3),
    miss: () => tone(200, 0.18, 'sawtooth', 0.18),
    switchPlayer: () => tone(440, 0.08, 'sine', 0.2),
    bust: () => tone(150, 0.35, 'square', 0.16),
  }
}
