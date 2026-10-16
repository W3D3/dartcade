// Plays what the caller says: one clip per part of a call, back to back, through the page's
// AudioContext. Each URL is fetched, decoded and trimmed of silent edges once; a new call cuts off the one playing.

import { audioContext } from '../sounds.js'
import { pickClips, type Call } from './calls.js'

// Quieter than this on every channel is padding: about −50 dBFS
const QUIET = 10 ** (-50 / 20)
// Kept either side of the sound, so a soft start or a breath isn't clipped
const MARGIN_S = 0.02

/** The samples [start, end) to keep: quiet edges trimmed (below `threshold` on every channel), with
 *  `margin` samples left either side. Pauses inside stay; a clip that is all quiet is kept whole. */
export function audibleRange(channels: Float32Array[], threshold: number, margin: number): [number, number] {
  const n = channels[0]?.length ?? 0
  const loud = (i: number) => channels.some(c => Math.abs(c[i]) >= threshold)
  let start = 0
  while (start < n && !loud(start)) start++
  if (start === n) return [0, n]
  let end = n
  while (end > start && !loud(end - 1)) end--
  return [Math.max(0, start - margin), Math.min(n, end + margin)]
}

/** A decoded clip without its silent padding (packs pad clips; Autodarts' up to 0.35 s). */
function trimmed(ctx: AudioContext, b: AudioBuffer): AudioBuffer {
  const channels = Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i))
  const [start, end] = audibleRange(channels, QUIET, Math.round(MARGIN_S * b.sampleRate))
  if (start === 0 && end === b.length) return b
  const out = ctx.createBuffer(b.numberOfChannels, end - start, b.sampleRate)
  channels.forEach((c, i) => {
    out.copyToChannel(c.subarray(start, end), i)
  })
  return out
}

export function createCaller(volume: () => number) {
  const buffers = new Map<string, Promise<AudioBuffer | null>>()
  let playing: AudioBufferSourceNode[] = []
  // Bumped by every say and stop: a call still loading when the next one comes is dropped
  let turn = 0

  function load(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
    const cached = buffers.get(url)
    if (cached) return cached
    const p = (async () => {
      let data: ArrayBuffer
      try {
        const res = await fetch(url, { credentials: 'same-origin' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        data = await res.arrayBuffer()
      } catch {
        // Not there right now (offline, a server error): a later call asks again
        buffers.delete(url)
        return null
      }
      // Not audio: kept as nothing for the session rather than downloaded on every call
      try {
        return trimmed(ctx, await ctx.decodeAudioData(data))
      } catch {
        return null
      }
    })()
    buffers.set(url, p)
    return p
  }

  // One gain node for every call, made on the first
  let gain: GainNode | null = null

  function silence() {
    for (const src of playing) {
      try {
        src.stop()
      } catch {
        /* already ended */
      }
    }
    playing = []
  }

  async function say(call: Call, clips: Record<string, string[]>): Promise<void> {
    const mine = ++turn
    silence()
    const vol = volume()
    const ctx = audioContext()
    if (!ctx || vol <= 0) return
    const loaded = await Promise.all(pickClips(call, clips).map(url => load(ctx, url)))
    if (mine !== turn) return
    if (!gain) {
      gain = ctx.createGain()
      gain.connect(ctx.destination)
    }
    gain.gain.value = vol
    let at = ctx.currentTime
    for (const buffer of loaded) {
      if (!buffer) continue
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.connect(gain)
      src.onended = () => {
        src.disconnect()
      }
      src.start(at)
      at += buffer.duration
      playing.push(src)
    }
  }

  function stop() {
    turn++
    silence()
  }

  return { say, stop }
}
