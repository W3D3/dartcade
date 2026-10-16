// Autodarts' caller voices: one long MP3 (an audio sprite) and the table of where each clip sits in
// it, both saved by the player on play.autodarts.com (the SPA's bookmarklet zips them). The MP3 is
// cut on its own frame boundaries: no decoding, no re-encoding.
// Design: docs/superpowers/specs/2026-10-16-autodarts-voices-and-checkout-calls-design.md

import { z } from 'zod'
import { ZipError } from './zip.js'

export interface AutodartsVoice {
  name: string
  lang: string | null
  /** Clips in the table. */
  total: number
  /** Key → the clip's MP3 frames, views into the MP3 (copy what you keep); shots renamed to our keys,
   *  nothing dropped yet. */
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
// Frames before a clip's start: a frame's audio may begin in the up to 511 bytes before it (the bit
// reservoir), under two frames at 128 kbps. They decode inside the previous clip's padding
const LEAD_IN_FRAMES = 2
// How far the table's end may be from the audio's (seen: 36 ms, about the encoder's delay)
const END_SLACK_MS = 60
const RENAME: Record<string, string> = { game_on: 'gameon', game_shot: 'gameshot', game_shot_match: 'matchshot' }
const LANGS: Record<string, string> = { english: 'en', german: 'de' }

/** The audio frames of a CBR MPEG-1 Layer III file: after an ID3v2 tag, without the Info/Xing frame,
 *  up to the end or whatever isn't a frame (an ID3v1 tag). */
export function mp3Frames(b: Uint8Array): { sampleRate: number; frames: { start: number; end: number }[] } {
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
    const end = i + Math.floor((144000 * bitrate) / rate) + ((h >>> 9) & 1)
    if (end > b.length) break
    frames.push({ start: i, end })
    i = end
  }
  if (frames.length === 0) throw new ZipError(NOT_MP3)
  // The first frame may be an Info/Xing header: it sits after the side info and holds no audio
  const f = frames[0].start
  const mono = ((b[f + 3] >>> 6) & 3) === 3
  const at = f + 4 + (b[f + 1] & 1 ? 0 : 2) + (mono ? 17 : 32)
  const tag = String.fromCharCode(...b.subarray(at, at + 4))
  if (tag === 'Info' || tag === 'Xing') frames.shift()
  if (frames.length === 0) throw new ZipError(NOT_MP3)
  return { sampleRate, frames }
}

/** Cuts an Autodarts voice MP3 into its clips by its table. */
export function cutAutodarts(mp3: Uint8Array, table: unknown): AutodartsVoice {
  const parsed = TableSchema.safeParse(table)
  if (!parsed.success) throw new ZipError('Not an Autodarts voice table')
  const t = parsed.data
  if (mp3.length !== t.mp3Bytes) throw new ZipError('This table belongs to a different MP3')
  const { sampleRate, frames } = mp3Frames(mp3)
  const frameMs = (1152 * 1000) / sampleRate
  const lastEnd = Math.max(...Object.values(t.sprite).map(([offset, duration]) => offset + duration))
  if (Math.abs(frames.length * frameMs - lastEnd) > END_SLACK_MS) throw new ZipError("The timings don't fit this MP3")

  const clips: Record<string, Uint8Array> = {}
  for (const [key, [offset, duration]] of Object.entries(t.sprite)) {
    const last = Math.min(frames.length, Math.max(1, Math.ceil((offset + duration) / frameMs)))
    const first = Math.min(last - 1, Math.max(0, Math.floor(offset / frameMs) - LEAD_IN_FRAMES))
    clips[RENAME[key] ?? key] = mp3.subarray(frames[first].start, frames[last - 1].end)
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
