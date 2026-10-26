// Autodarts' caller voices: one long MP3 (an audio sprite) and the table of where each clip sits in
// it, both saved by the player on play.autodarts.com (the SPA's bookmarklet zips them). The MP3 is
// cut on its own frame boundaries: no decoding, no re-encoding. Each clip gets its own Info frame
// whose LAME tag tells the decoder which samples to drop, so it plays exactly its table times.
// Design: docs/superpowers/specs/2026-10-16-autodarts-voices-and-checkout-calls-design.md

import { z } from 'zod'
import { ZipError } from './zip.js'

export interface AutodartsVoice {
  name: string
  lang: string | null
  /** Clips in the table. */
  total: number
  /** Key → the clip's MP3: an Info frame, then its frames; shots renamed to our keys, nothing dropped
   *  yet. */
  clips: Record<string, Uint8Array>
}

const TableSchema = z.object({
  voice: z.string().regex(/^[a-z]+(-[a-z]+)+$/),
  mp3: z.string().min(1),
  mp3Bytes: z.number().int().positive(),
  unit: z.literal('ms'),
  sprite: z
    .record(z.string(), z.tuple([z.number().nonnegative(), z.number().positive()]))
    .refine(s => Object.keys(s).length > 0 && Object.keys(s).length <= 400),
})

const NOT_MP3 = 'Not an Autodarts voice file'
// MPEG-1 Layer III bitrates (kbps) and sample rates by their header index
const BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
const RATES = [44100, 48000, 32000]
// Frames before the one a clip starts in: a frame's audio may begin in the up to 511 bytes before it
// (the bit reservoir, over a frame at 128 kbps), and its first samples overlap the frame before. The
// clip's LAME tag has the decoder drop them, with the previous clip's tail they hold (#362)
const LEAD_IN_FRAMES = 3
// The samples an MP3 decoder outputs before the audio (on top of the encoder's delay)
const DECODER_DELAY = 529
// How far the table's end may be from the audio's (seen: 36 ms, about the encoder's delay)
const END_SLACK_MS = 60
const RENAME: Record<string, string> = { game_on: 'gameon', game_shot: 'gameshot', game_shot_match: 'matchshot' }
const LANGS: Record<string, string> = { english: 'en', german: 'de' }

const frameBytes = (h: number) => Math.floor((144000 * BITRATES[(h >>> 12) & 15]) / RATES[(h >>> 10) & 3]) + ((h >>> 9) & 1)
const sideInfo = (h: number) => (((h >>> 6) & 3) === 3 ? 17 : 32) // mono, else stereo
const ENCODERS = ['LAME', 'Lavf', 'Lavc'] // the ones whose tags decoders read, as FFmpeg does

/** The audio frames of a CBR MPEG-1 Layer III file: after an ID3v2 tag, without the Info/Xing frame,
 *  up to the end or whatever isn't a frame (an ID3v1 tag). `skip`: the samples decoders drop at its
 *  start, from the Info frame's LAME tag (its encoder delay plus the decoder's); 0 without one. */
export function mp3Frames(b: Uint8Array): { sampleRate: number; skip: number; frames: { start: number; end: number }[] } {
  let i = 0
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f)
    i = 10 + size + (b[5] & 0x10 ? 10 : 0)
  }
  const frames: { start: number; end: number }[] = []
  let sampleRate = 0
  while (i + 4 <= b.length) {
    const h = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
    if (h >>> 21 !== 0x7ff) break
    const bitrate = BITRATES[(h >>> 12) & 15]
    const rate = RATES[(h >>> 10) & 3]
    if (((h >>> 19) & 3) !== 3 || ((h >>> 17) & 3) !== 1 || !bitrate || !rate) throw new ZipError(NOT_MP3)
    if (sampleRate !== 0 && rate !== sampleRate) throw new ZipError(NOT_MP3)
    sampleRate = rate
    const end = i + frameBytes(h)
    if (end > b.length) break
    frames.push({ start: i, end })
    i = end
  }
  if (frames.length === 0) throw new ZipError(NOT_MP3)
  // The first frame may be an Info/Xing header: it sits after the side info and holds no audio
  const f = frames[0].start
  const at = f + 4 + (b[f + 1] & 1 ? 0 : 2) + sideInfo(b[f + 3])
  const text = (from: number, n: number) => String.fromCharCode(...b.subarray(from, from + n))
  let skip = 0
  if (text(at, 4) === 'Info' || text(at, 4) === 'Xing') {
    frames.shift()
    // The LAME tag follows the Xing fields its flags announce: frames, bytes, TOC, quality
    const fl = b[at + 7]
    const lame = at + 8 + (fl & 1 ? 4 : 0) + (fl & 2 ? 4 : 0) + (fl & 4 ? 100 : 0) + (fl & 8 ? 4 : 0)
    if (ENCODERS.includes(text(lame, 4)) && lame + 24 <= (frames[0]?.start ?? 0)) {
      skip = ((b[lame + 21] << 4) | (b[lame + 22] >>> 4)) + DECODER_DELAY
    }
  }
  if (frames.length === 0) throw new ZipError(NOT_MP3)
  return { sampleRate, skip, frames }
}

/** CRC-16 (ARC), which the LAME tag uses. */
function crc16(b: Uint8Array): number {
  let crc = 0
  for (const x of b) {
    crc ^= x
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1
  }
  return crc
}

/** An Info frame (a CBR Xing header with a LAME tag) for `frames` audio frames like `header`: decoders
 *  drop `delay` samples (after their own 529) at the start and `padding` at the end. */
function infoFrame(header: Uint8Array, frames: number, audioBytes: number, delay: number, padding: number): Uint8Array {
  // The same header, without padding or CRC
  const h = ((((header[0] << 24) | (header[1] << 16) | (header[2] << 8) | header[3]) >>> 0) | (1 << 16)) & ~(1 << 9)
  const f = new Uint8Array(frameBytes(h))
  const v = new DataView(f.buffer)
  v.setUint32(0, h)
  const at = 4 + sideInfo(h)
  const ascii = (s: string, to: number) => f.set(new TextEncoder().encode(s), to)
  ascii('Info', at)
  v.setUint32(at + 4, 0xf) // frames, bytes, TOC and quality follow
  v.setUint32(at + 8, frames)
  v.setUint32(at + 12, f.length + audioBytes)
  for (let i = 0; i < 100; i++) f[at + 16 + i] = Math.floor((i * 256) / 100) // CBR: a straight line
  ascii('LAME3.100', at + 120)
  f.set([delay >>> 4, ((delay & 15) << 4) | (padding >>> 8), padding & 255], at + 141)
  v.setUint32(at + 148, f.length + audioBytes) // music length
  v.setUint16(at + 154, crc16(f.subarray(0, at + 154)))
  return f
}

/** Cuts an Autodarts voice MP3 into its clips by its table. */
export function cutAutodarts(mp3: Uint8Array, table: unknown): AutodartsVoice {
  const parsed = TableSchema.safeParse(table)
  if (!parsed.success) throw new ZipError('Not an Autodarts voice table')
  const t = parsed.data
  if (mp3.length !== t.mp3Bytes) throw new ZipError('This table belongs to a different MP3')
  const { sampleRate, skip, frames } = mp3Frames(mp3)
  const frameMs = (1152 * 1000) / sampleRate
  const header = mp3.subarray(frames[0].start, frames[0].start + 4)
  const lastEnd = Math.max(...Object.values(t.sprite).map(([offset, duration]) => offset + duration))
  if (Math.abs(frames.length * frameMs - lastEnd) > END_SLACK_MS) throw new ZipError("The timings don't fit this MP3")

  const clips: Record<string, Uint8Array> = {}
  for (const [key, [offset, duration]] of Object.entries(t.sprite)) {
    // The table counts the samples a decoder keeps; the frames hold them `skip` samples later
    const from = Math.round((offset * sampleRate) / 1000) + skip
    const to = Math.round(((offset + duration) * sampleRate) / 1000) + skip
    const last = Math.min(frames.length, Math.max(1, Math.ceil(to / 1152)))
    const first = Math.min(last - 1, Math.max(0, Math.floor(from / 1152) - LEAD_IN_FRAMES))
    const audio = mp3.subarray(frames[first].start, frames[last - 1].end)
    // Clamped to the 12 bits the tag has: the delay is under 4 frames (4608), minus the decoder's 529
    const delay = Math.min(4095, Math.max(0, from - first * 1152 - DECODER_DELAY))
    const padding = Math.min(4095, Math.max(0, (last - first) * 1152 - delay - (to - from)))
    const info = infoFrame(header, last - first, audio.length, delay, padding)
    const out = new Uint8Array(info.length + audio.length)
    out.set(info)
    out.set(audio, info.length)
    clips[RENAME[key] ?? key] = out
  }
  const parts = t.voice.split('-')
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
  const language = parts[parts.length - 1]
  return {
    name: `Autodarts ${cap(parts[0])} (${cap(language)})`,
    lang: LANGS[language] ?? null,
    total: Object.keys(t.sprite).length,
    clips,
  }
}
