import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DartSound } from '../dartEvents.js'

// A stand-in AudioContext that records every gain node and what was set on it
type Call = [string, ...number[]]
type FakeGain = { gain: { value: number; calls: Call[] }; to: unknown; connect: (to: unknown) => void }
let gains: FakeGain[] = []
const param = (value = 1) => {
  const p = {
    value,
    calls: [] as Call[],
    setValueAtTime: (v: number, t: number) => p.calls.push(['set', v, t]),
    linearRampToValueAtTime: (v: number, t: number) => p.calls.push(['linear', v, t]),
    exponentialRampToValueAtTime: (v: number, t: number) => p.calls.push(['exp', v, t]),
    setTargetAtTime: (v: number, t: number, tau: number) => p.calls.push(['target', v, t, tau]),
    cancelScheduledValues: (t: number) => p.calls.push(['cancel', t]),
  }
  return p
}
const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() })
class FakeContext {
  static last: FakeContext
  state = 'running'
  currentTime = 0
  sampleRate = 22050
  destination = { name: 'destination' }
  constructor() {
    FakeContext.last = this
  }
  createGain() {
    const g: FakeGain = { ...node(), gain: param(), to: null }
    g.connect = vi.fn((to: unknown) => (g.to = to))
    gains.push(g)
    return g
  }
  createOscillator() {
    return { ...node(), type: 'sine', frequency: param() }
  }
  createBiquadFilter() {
    return { ...node(), type: 'lowpass', frequency: param(), Q: param() }
  }
  createBufferSource() {
    return { ...node(), buffer: null, loop: false }
  }
  createBuffer(_c: number, length: number) {
    const data = new Float32Array(length)
    return { duration: length / this.sampleRate, length, numberOfChannels: 1, sampleRate: this.sampleRate, getChannelData: () => data }
  }
  decodeAudioData() {
    return Promise.resolve(this.createBuffer(1, this.sampleRate))
  }
  resume() {
    return Promise.resolve()
  }
}

const SOUNDS: DartSound[] = ['hit', 'double', 'treble', 'miss', 'bust']
const db = (x: number) => 20 * Math.log10(x)

beforeEach(() => {
  gains = []
  vi.resetModules()
  vi.stubGlobal('AudioContext', FakeContext)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, arrayBuffer: () => Promise.resolve({}) }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

async function load() {
  const sounds = await import('../sounds.js')
  const packs = await import('../soundPacks.js')
  const player = await import('../caller/player.js')
  return { ...sounds, ...packs, ...player }
}

/** The gain a pack sound plays at: its own output node, the first one made per play. */
function playGain(play: () => void): number {
  const before = gains.length
  play()
  return gains[before].gain.value
}

describe('sound pack volume', () => {
  it('follows the slider on a curve, the same for every dart, with and without the caller', async () => {
    const { createSoundPacks, createCaller, levelGain } = await load()
    for (const v of [0.25, 0.5, 1]) {
      const caller = createCaller(() => 1)
      const packs = createSoundPacks(() => v)
      const expected = v ** 2 * levelGain('sound.arcade', 'hit')
      // The 3rd dart: GameDisplay asks the caller first, then plays the dart in the same tick
      const said = caller.say([['60']], { '60': ['/c/60'] })
      expect(playGain(() => packs.play('sound.arcade', 'hit'))).toBeCloseTo(expected)
      await said
      // Darts while the call plays
      expect(playGain(() => packs.play('sound.arcade', 'hit'))).toBeCloseTo(expected)
      FakeContext.last.currentTime = 0.5
      expect(playGain(() => packs.play('sound.arcade', 'hit'))).toBeCloseTo(expected)
      caller.stop()
      expect(playGain(() => packs.play('sound.arcade', 'hit'))).toBeCloseTo(expected)
    }
  })

  it('plays nothing at zero', async () => {
    const { createSoundPacks } = await load()
    createSoundPacks(() => 0).play('sound.arcade', 'hit')
    expect(gains).toEqual([])
  })

  it('plays every pack sound into the shared effects bus', async () => {
    const { createSoundPacks, effectsBus } = await load()
    const packs = createSoundPacks(() => 1)
    const before = gains.length
    packs.play('sound.legend', 'bust')
    expect(gains[before].to).toBe(effectsBus(FakeContext.last as unknown as AudioContext))
  })
})

describe('ducking under the caller', () => {
  it('ducks the bus smoothly for exactly the call, and lets it up when the call is cut off', async () => {
    const { createCaller, createSoundPacks, effectsBus, DUCKED } = await load()
    createSoundPacks(() => 1).play('sound.arcade', 'hit')
    const ctx = FakeContext.last
    const bus = effectsBus(ctx as unknown as AudioContext) as unknown as FakeGain
    const caller = createCaller(() => 1)
    await caller.say([['60']], { '60': ['/c/60'] })
    const targets = bus.gain.calls.filter(c => c[0] === 'target')
    // Down at the clip's start, up at its end (1 s), each settling in well under 100 ms
    expect(targets.map(c => c.slice(1, 3))).toEqual([
      [DUCKED, 0],
      [1, 1],
    ])
    for (const c of targets) expect(c[3] * 3).toBeLessThan(0.1)
    ctx.currentTime = 0.4
    bus.gain.calls = []
    caller.stop()
    expect(bus.gain.calls).toEqual([
      ['cancel', 0.4],
      ['target', 1, 0.4, targets[1][3]],
    ])
  })
})

describe('level matching', () => {
  it('brings every recipe of every pack to the target peak, and none above full scale', async () => {
    const { SOUND_PACKS, PEAK_DB, TARGET_DB, levelGain } = await load()
    for (const [id, pack] of Object.entries(SOUND_PACKS)) {
      for (const sound of SOUNDS) {
        if (!(sound in pack)) continue
        expect(PEAK_DB[id][sound], `${id}/${sound} has a measured peak`).toBeTypeOf('number')
      }
      for (const sound of SOUNDS) {
        const peak = PEAK_DB[id][sound in pack ? sound : 'hit'] ?? NaN
        expect(peak + db(levelGain(id, sound))).toBeCloseTo(TARGET_DB)
      }
    }
    expect(TARGET_DB).toBeLessThanOrEqual(-12)
  })

  it('brings every beep to the target peak at full volume', async () => {
    const { createSounds, TARGET_DB } = await load()
    const sounds = createSounds(() => 1)
    for (const name of ['hit', 'treble', 'miss', 'switchPlayer', 'bust', 'knock', 'cup'] as const) {
      const before = gains.length
      sounds[name]()
      // A beep's tones are full-scale waves: the peak is the gain each one starts at
      const peaks = gains.slice(before).flatMap(g => g.gain.calls.filter(c => c[0] === 'set').map(c => c[1]))
      expect(peaks.length, name).toBeGreaterThan(0)
      for (const p of peaks) expect(db(p), name).toBeCloseTo(TARGET_DB, 0)
    }
  })

  it('plays beeps on the slider curve', async () => {
    const { createSounds, TARGET_DB } = await load()
    const before = gains.length
    createSounds(() => 0.5).hit()
    const set = gains
      .slice(before)
      .flatMap(g => g.gain.calls)
      .find(c => c[0] === 'set')
    expect(db(set?.[1] ?? 0)).toBeCloseTo(TARGET_DB + db(0.25), 0)
  })
})
