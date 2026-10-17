import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { audibleRange } from '../caller/player.js'

// A voice pack's clips, as GET /api/voice-packs/{id} answers (packClips)
const apiGet = vi.hoisted(() => vi.fn())
vi.mock('$lib/api', () => ({ api: { GET: apiGet } }))

// A stand-in AudioContext: decoding returns the "audio" the response carried (1 s of sound,
// unless it brings its own samples), and every started and stopped source is recorded
const started: string[] = []
type FakeBuffer = {
  tag?: string
  duration: number
  numberOfChannels: number
  length: number
  sampleRate: number
  getChannelData: (i: number) => Float32Array
  copyToChannel?: (c: Float32Array, i: number) => void
}
const starts: { tag?: string; at: number; length: number }[] = []
const stopped: string[] = []
class FakeContext {
  state = 'running'
  currentTime = 0
  destination = {}
  createGain() {
    return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }
  }
  createBufferSource() {
    const src = {
      buffer: null as FakeBuffer | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      stop: () => {
        if (src.buffer?.tag) stopped.push(src.buffer.tag)
      },
      start: (at = 0) => {
        if (!src.buffer) return
        if (src.buffer.tag) started.push(src.buffer.tag)
        starts.push({ tag: src.buffer.tag, at, length: src.buffer.length })
      },
    }
    return src
  }
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): FakeBuffer {
    const data = new Float32Array(length)
    return {
      numberOfChannels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: () => data,
      copyToChannel: c => {
        data.set(c)
      },
    }
  }
  decodeAudioData(data: { tag: string; samples?: Float32Array }): Promise<FakeBuffer> {
    const samples = data.samples ?? new Float32Array(22050).fill(0.5)
    return Promise.resolve({
      tag: data.tag,
      duration: samples.length / 22050,
      numberOfChannels: 1,
      length: samples.length,
      sampleRate: 22050,
      getChannelData: () => samples,
    })
  }
  resume() {
    return Promise.resolve()
  }
}

const ok = (tag: string, samples?: Float32Array) => ({
  ok: true,
  status: 200,
  arrayBuffer: () => Promise.resolve({ tag, samples }),
})
const flush = () => new Promise(r => setTimeout(r, 0))

describe('audibleRange', () => {
  const clip = (...runs: [number, number][]) => Float32Array.from(runs.flatMap(([v, n]) => Array<number>(n).fill(v)))

  it('trims quiet edges only, keeping a pause inside and a margin either side', () => {
    const mono = clip([0, 1000], [0.5, 100], [0, 300], [0.5, 100], [0.001, 500])
    expect(audibleRange([mono], 0.01, 20)).toEqual([980, 1520])
  })

  it('counts a sample loud on any channel, and keeps a clip that is all quiet', () => {
    expect(audibleRange([clip([0, 50]), clip([0, 10], [0.2, 5], [0, 35])], 0.01, 0)).toEqual([10, 15])
    expect(audibleRange([clip([0, 50])], 0.01, 5)).toEqual([0, 50])
  })
})

describe('createCaller', () => {
  beforeEach(() => {
    started.length = 0
    starts.length = 0
    stopped.length = 0
    vi.stubGlobal('AudioContext', FakeContext)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('tries a clip again after the server failed to send it', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 }).mockResolvedValueOnce(ok('180'))
    vi.stubGlobal('fetch', fetchMock)
    const { createCaller } = await import('../caller/player.js')
    const caller = createCaller(() => 1)
    await caller.say([['180']], { '180': ['/c/180'] })
    expect(started).toEqual([])
    await caller.say([['180']], { '180': ['/c/180'] })
    expect(started).toEqual(['180'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('drops a call still loading when the next one comes', async () => {
    let release: (v: unknown) => void = () => undefined
    const slow = new Promise(r => {
      release = r
    })
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => (url === '/c/slow' ? slow : Promise.resolve(ok('fast')))),
    )
    const { createCaller } = await import('../caller/player.js')
    const caller = createCaller(() => 1)
    const first = caller.say([['a']], { a: ['/c/slow'] })
    const second = caller.say([['b']], { b: ['/c/fast'] })
    await second
    release(ok('slow'))
    await first
    await flush()
    expect(started).toEqual(['fast'])
  })

  it('plays a clip without its quiet edges', async () => {
    // 0.5 s quiet, 0.5 s sound, 0.5 s quiet at 22050 Hz: kept is the sound plus 20 ms either side
    const samples = new Float32Array(33075)
    samples.fill(0.5, 11025, 22050)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok('padded', samples)))
    const { createCaller } = await import('../caller/player.js')
    await createCaller(() => 1).say([['p']], { p: ['/c/padded'] })
    expect(starts.map(s => s.length)).toEqual([11025 + 2 * 441])
  })

  it('queues a call after the one playing without stopping it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => Promise.resolve(ok(url))),
    )
    const { createCaller } = await import('../caller/player.js')
    const caller = createCaller(() => 1)
    await caller.say([['a']], { a: ['/q/a'] })
    await caller.say([['b']], { b: ['/q/b'] }, { queue: true })
    expect(starts.map(s => [s.tag, s.at])).toEqual([
      ['/q/a', 0],
      ['/q/b', 1],
    ])
    expect(stopped).toEqual([])
  })

  it('plays a queued call after the one still loading', async () => {
    let release: (v: unknown) => void = () => undefined
    const slow = new Promise(r => {
      release = r
    })
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => (url === '/w/slow' ? slow : Promise.resolve(ok(url)))),
    )
    const { createCaller } = await import('../caller/player.js')
    const caller = createCaller(() => 1)
    const first = caller.say([['a']], { a: ['/w/slow'] })
    const second = caller.say([['b']], { b: ['/w/fast'] }, { queue: true })
    await flush()
    expect(started).toEqual([])
    release(ok('slow'))
    await Promise.all([first, second])
    expect(starts.map(s => [s.tag, s.at])).toEqual([
      ['slow', 0],
      ['/w/fast', 1],
    ])
  })

  it('cuts off the playing and the queued call with a normal one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => Promise.resolve(ok(url))),
    )
    const { createCaller } = await import('../caller/player.js')
    const caller = createCaller(() => 1)
    await caller.say([['a']], { a: ['/n/a'] })
    await caller.say([['b']], { b: ['/n/b'] }, { queue: true })
    await caller.say([['c']], { c: ['/n/c'] })
    expect(stopped).toEqual(['/n/a', '/n/b'])
    expect(starts.at(-1)).toEqual({ tag: '/n/c', at: 0, length: 22050 })
  })

  it('drops a queued call still loading when a normal one comes', async () => {
    let release: (v: unknown) => void = () => undefined
    const slow = new Promise(r => {
      release = r
    })
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => (url === '/d/slow' ? slow : Promise.resolve(ok(url)))),
    )
    const { createCaller } = await import('../caller/player.js')
    const caller = createCaller(() => 1)
    const queued = caller.say([['a']], { a: ['/d/slow'] }, { queue: true })
    await caller.say([['b']], { b: ['/d/fast'] })
    release(ok('slow'))
    await queued
    expect(started).toEqual(['/d/fast'])
  })

  it('waits for the voice to load, and drops the call when stopped before it has', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => Promise.resolve(ok(url))),
    )
    const { createCaller } = await import('../caller/player.js')
    const caller = createCaller(() => 1)
    let loaded: (c: Record<string, string[]>) => void = () => undefined
    const voice = new Promise<Record<string, string[]>>(r => {
      loaded = r
    })
    // Leaving the match screen while the voice loads
    const gameOn = caller.say([['gameon']], voice)
    caller.stop()
    loaded({ gameon: ['/v/gameon'], '180': ['/v/180'] })
    await gameOn
    expect(started).toEqual([])
    await caller.say([['180']], voice)
    expect(started).toEqual(['/v/180'])
  })

  it("drops a pack's sample when stopped while the pack still loads (leaving Settings)", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => Promise.resolve(ok(url))),
    )
    let answer: (res: unknown) => void = () => undefined
    apiGet.mockReturnValueOnce(
      new Promise(r => {
        answer = r
      }),
    )
    const { createCaller } = await import('../caller/player.js')
    const { saySample } = await import('../caller/voices.js')
    const caller = createCaller(() => 1)
    const sample = saySample(caller, 'p1')
    caller.stop()
    answer({ data: { clips: { '180': ['a'.repeat(64)] } } })
    await sample
    expect(started).toEqual([])
    apiGet.mockResolvedValueOnce({ data: { clips: { '60': ['b'.repeat(64)] } } })
    await saySample(caller, 'p2')
    expect(started).toEqual([`/api/voice-clips/${'b'.repeat(64)}`])
  })
})
