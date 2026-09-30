// Short Web Audio tones; silent where there is no AudioContext.
export function createSounds(volume: () => number) {
  let ctx: AudioContext | null = null

  function tone(freq: number, dur: number, type: OscillatorType, vol: number) {
    if (typeof AudioContext === 'undefined') return
    const gainValue = vol * volume()
    if (gainValue <= 0) return
    ctx ??= new AudioContext()
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
