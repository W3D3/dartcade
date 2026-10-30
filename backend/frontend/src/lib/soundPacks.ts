// Sound packs (the `sound.*` perks): what a player's darts sound like on the match screen, played
// for the thrower's pack. Synthesized with Web Audio, one recipe table per pack; placeholder sounds
// until recorded ones replace them. Each is levelled to the same peak; the effects bus ducks them
// while the caller speaks, so the call stays clear.
import { audioContext, effectsBus, effectsGain, TARGET_DB } from './sounds.js'
import type { DartSound } from './dartEvents.js'
import { PERKS } from '$shared/progression.js'

type Filter = { type: BiquadFilterType; freq: number; q?: number }
/** Sound sources, scheduled `delay` seconds after the recipe starts. */
type Synth = {
  /** A tone sliding from `from` to `to` Hz (equal for a steady one), fading out over `dur`. */
  glide: (from: number, to: number, dur: number, type: OscillatorType, vol: number, delay?: number) => void
  /** Filtered white noise, swelling in over `attack` seconds, fading out by `dur`. */
  noise: (dur: number, filter: Filter, vol: number, delay?: number, attack?: number) => void
  /** A buzzy voice through two vowel formants: an "ooh" at 300 and 870 Hz. */
  vowel: (from: number, to: number, dur: number, vol: number, delay?: number) => void
}
type Recipe = (s: Synth) => void
/** A pack's sounds: a double or treble without its own plays the hit. */
type Pack = Record<'hit' | 'miss' | 'bust', Recipe> & Partial<Record<'double' | 'treble', Recipe>>

const tone = (s: Synth, f: number, dur: number, type: OscillatorType, vol: number, delay = 0) => s.glide(f, f, dur, type, vol, delay)
const notes = (s: Synth, fs: number[], step: number, dur: number, type: OscillatorType, vol: number) =>
  fs.forEach((f, i) => tone(s, f, dur, type, vol, i * step))
// A bell: the note and its inharmonic partial
const chime = (s: Synth, f: number, vol: number, delay = 0) => {
  tone(s, f, 1.2, 'sine', vol, delay)
  tone(s, f * 2.76, 0.5, 'sine', vol * 0.3, delay)
}

/** The pub's impact: `pitch` scales the body and crack, `vol` the whole, `delay` seconds in. */
const pubHit = (s: Synth, pitch = 1, vol = 1, delay = 0) => {
  s.glide(380 * pitch, 110 * pitch, 0.55, 'square', 0.9 * vol, delay)
  s.glide(170 * pitch, 50 * pitch, 0.5, 'sine', 0.5 * vol, delay)
  s.noise(0.3, { type: 'bandpass', freq: 1800 * pitch, q: 0.9 }, 0.35 * vol, delay)
  s.noise(0.04, { type: 'highpass', freq: 3000 }, 0.3 * vol, delay)
}

/** Every pack's recipes, by perk id; 'sound.none' has none. */
export const SOUND_PACKS: Record<string, Pack> = {
  // Hard impacts: a square-wave body and a noise crack hold far more energy than a thin spike at the
  // same peak, and the body sits where a laptop or tablet speaker can play it
  'sound.pub': {
    hit: s => pubHit(s),
    // Two impacts, the second higher, and a bell on top: not the hit again
    treble: s => {
      pubHit(s)
      pubHit(s, 1.4, 0.8, 0.1)
      chime(s, 1568, 0.25, 0.1)
    },
    miss: s => {
      s.glide(260, 80, 0.45, 'square', 0.8)
      s.noise(0.25, { type: 'lowpass', freq: 1200 }, 0.4)
      s.noise(0.06, { type: 'bandpass', freq: 900, q: 1 }, 0.3)
    },
    bust: s => {
      s.noise(0.25, { type: 'bandpass', freq: 1600 }, 0.35)
      s.glide(260, 80, 0.8, 'triangle', 0.3)
      s.glide(254, 76, 0.8, 'triangle', 0.22)
      s.glide(780, 240, 0.8, 'triangle', 0.4)
      s.glide(762, 228, 0.8, 'triangle', 0.28)
    },
  },
  'sound.arcade': {
    hit: s => notes(s, [880, 1320], 0.06, 0.07, 'square', 0.12),
    double: s => notes(s, [880, 1175, 1568], 0.05, 0.06, 'square', 0.12),
    treble: s => notes(s, [660, 880, 1320, 1760], 0.05, 0.07, 'square', 0.12),
    miss: s => s.glide(420, 140, 0.16, 'square', 0.12),
    bust: s => notes(s, [494, 392, 311, 233], 0.1, 0.11, 'square', 0.12),
  },
  'sound.stadium': {
    // A volley of claps: bursts one after another add energy at the same peak (loudness follows
    // energy, not peak), where a single click is quiet
    hit: s => {
      ;[0, 0.07, 0.15, 0.24].forEach(d => s.noise(0.25, { type: 'bandpass', freq: 1400, q: 0.6 }, 0.6, d))
      s.noise(0.3, { type: 'highpass', freq: 2500 }, 0.3, 0.03)
    },
    treble: s => {
      s.noise(1.6, { type: 'bandpass', freq: 850, q: 0.5 }, 0.7, 0, 0.25)
      s.noise(1.3, { type: 'highpass', freq: 2500 }, 0.2, 0.1, 0.2)
    },
    miss: s => s.vowel(170, 130, 0.7, 0.5),
    bust: s => {
      s.vowel(150, 95, 1, 0.5)
      s.noise(1, { type: 'lowpass', freq: 500 }, 0.35, 0, 0.2)
    },
  },
  'sound.legend': {
    hit: s => chime(s, 1047, 0.3),
    double: s => [1047, 1568].forEach((f, i) => chime(s, f, 0.25, i * 0.08)),
    treble: s => [1047, 1319, 1568, 2093].forEach((f, i) => chime(s, f, 0.22, i * 0.08)),
    miss: s => chime(s, 523, 0.18),
    bust: s => [659, 494].forEach((f, i) => chime(s, f, 0.25, i * 0.2)),
  },
}

/** Each recipe's peak at gain 1 (dBFS), rendered in Chrome; a pack without a double or treble plays
 *  its hit. A new or changed recipe needs its peak measured again. */
export const PEAK_DB: Record<string, Partial<Record<DartSound, number>>> = {
  'sound.pub': { hit: 3.5, treble: 3.7, miss: -1, bust: 1.3 },
  'sound.arcade': { hit: -18.5, double: -18.5, treble: -18.5, miss: -19, bust: -19 },
  'sound.stadium': { hit: -6.5, treble: -4.9, miss: -16.3, bust: -11.4 },
  'sound.legend': { hit: -8.3, double: -6.2, treble: -6.8, miss: -12.8, bust: -8.5 },
}

/** The gain that brings `sound` of pack `packId` to `TARGET_DB` at full volume. */
export function levelGain(packId: string, sound: DartSound): number {
  const peaks = PEAK_DB[packId] ?? {}
  const peak = peaks[sound in SOUND_PACKS[packId] ? sound : 'hit'] ?? TARGET_DB
  return 10 ** ((TARGET_DB - peak) / 20)
}

/** Settings' "Sound pack for every dart" value for no pick (stored as null). */
export const EACH_PACK = 'each'

/** That select's options: each thrower's own, the default beeps ('sound.none'), and the packs
 *  you may pick (unlocked, any with sounds.anyPack, or the one already picked). */
export function packOptions(unlocked: readonly string[], anyPack: boolean, current: string | null) {
  return [
    { value: EACH_PACK, label: "Each thrower's own" },
    ...PERKS.filter(p => p.kind === 'sound')
      .filter(p => p.id === 'sound.none' || anyPack || unlocked.includes(p.id) || p.id === current)
      .map(p => ({ value: p.id, label: p.id === 'sound.none' ? 'Dartcade default' : p.name })),
  ]
}

/** What a pack's preview plays, in order. */
const PREVIEW: DartSound[] = ['hit', 'treble', 'miss', 'bust']
const PREVIEW_GAP_S = 0.8
export function createSoundPacks(volume: () => number) {
  let noiseBuffer: AudioBuffer | null = null

  function synth(ctx: AudioContext, at: number, out: AudioNode): Synth {
    function envelope(start: number, dur: number, vol: number, attack = 0.005): GainNode {
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, start)
      g.gain.linearRampToValueAtTime(vol, start + attack)
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      g.connect(out)
      return g
    }
    function osc(from: number, to: number, start: number, dur: number, type: OscillatorType, into: AudioNode) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.setValueAtTime(from, start)
      if (to !== from) o.frequency.exponentialRampToValueAtTime(to, start + dur)
      o.connect(into)
      o.start(start)
      o.stop(start + dur)
    }
    return {
      glide(from, to, dur, type, vol, delay = 0) {
        osc(from, to, at + delay, dur, type, envelope(at + delay, dur, vol))
      },
      noise(dur, filter, vol, delay = 0, attack = 0.005) {
        if (!noiseBuffer) {
          noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
          const data = noiseBuffer.getChannelData(0)
          for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
        }
        const start = at + delay
        const src = ctx.createBufferSource()
        src.buffer = noiseBuffer
        src.loop = true
        const f = ctx.createBiquadFilter()
        f.type = filter.type
        f.frequency.value = filter.freq
        f.Q.value = filter.q ?? 1
        src.connect(f)
        f.connect(envelope(start, dur, vol, attack))
        src.start(start)
        src.stop(start + dur)
      },
      vowel(from, to, dur, vol, delay = 0) {
        const start = at + delay
        const env = envelope(start, dur, vol, 0.08)
        const formants = [300, 870].map(freq => {
          const f = ctx.createBiquadFilter()
          f.type = 'bandpass'
          f.frequency.value = freq
          f.Q.value = 6
          f.connect(env)
          return f
        })
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.setValueAtTime(from, start)
        o.frequency.exponentialRampToValueAtTime(to, start + dur)
        for (const f of formants) o.connect(f)
        o.start(start)
        o.stop(start + dur)
      },
    }
  }

  /** Plays `sound` in pack `packId` (nothing for 'sound.none' or an unknown pack), `delay` seconds from now. */
  function play(packId: string, sound: DartSound, delay = 0): void {
    const pack = packId in SOUND_PACKS ? SOUND_PACKS[packId] : null
    const vol = effectsGain(volume())
    if (!pack || vol <= 0) return
    const ctx = audioContext()
    if (!ctx) return
    const out = ctx.createGain()
    out.gain.value = vol * levelGain(packId, sound)
    out.connect(effectsBus(ctx))
    ;(pack[sound] ?? pack.hit)(synth(ctx, ctx.currentTime + delay, out))
    // Every recipe is over within 2 s
    setTimeout(() => out.disconnect(), (delay + 3) * 1000)
  }

  /** A pack's sample: a hit, a treble, a miss and a bust. */
  function preview(packId: string): void {
    PREVIEW.forEach((sound, i) => play(packId, sound, i * PREVIEW_GAP_S))
  }

  return { play, preview }
}
