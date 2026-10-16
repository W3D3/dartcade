import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { audibleRange } from '../caller/player.js'

// A stand-in AudioContext: decoding returns the "audio" the response carried, and every
// started source is recorded with it
const started: string[] = []
class FakeContext {
  state = 'running'
  currentTime = 0
  destination = {}
  createGain() {
    return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }
  }
  createBufferSource() {
    const src = {
      buffer: null as {
        tag: string
        duration: number
        numberOfChannels: number
        length: number
        sampleRate: number
        getChannelData: (i: number) => Float32Array
      } | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      stop: vi.fn(),
      start: () => {
        if (src.buffer) started.push(src.buffer.tag)
      },
    }
    return src
  }
  createBuffer(numberOfChannels: number, length: number, sampleRate: number) {
    return {
      numberOfChannels,
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length).fill(0.5),
    }
  }
  decodeAudioData(data: { tag: string }) {
    return Promise.resolve({
      tag: data.tag,
      duration: 1,
      numberOfChannels: 1,
      length: 22050,
      sampleRate: 22050,
      getChannelData: () => new Float32Array(22050).fill(0.5),
    })
  }
  resume() {
    return Promise.resolve()
  }
}

const ok = (tag: string) => ({ ok: true, status: 200, arrayBuffer: () => Promise.resolve({ tag }) })
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
})
