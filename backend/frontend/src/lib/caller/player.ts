// Plays what the caller says: one clip per part of a call, back to back, through the page's
// AudioContext. Each URL is fetched and decoded once; a new call cuts off the one playing.

import { audioContext } from '../sounds.js'
import { pickClips, type Call } from './calls.js'

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
      try { return await ctx.decodeAudioData(data) } catch { return null }
    })()
    buffers.set(url, p)
    return p
  }

  // One gain node for every call, made on the first
  let gain: GainNode | null = null

  function silence() {
    for (const src of playing) {
      try { src.stop() } catch { /* already ended */ }
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
      src.onended = () => { src.disconnect() }
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
