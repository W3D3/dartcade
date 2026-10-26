// darts-caller voice packs: read the zip a player imports and keep only the caller's clips.
// Two shapes: the download (clips zip + template CSV; the i-th clip in sorted name order is the
// i-th CSV row) and an installed pack (clips named by key: 180.mp3, gameshot+1.mp3).
// A third shape, behind a flag: an Autodarts voice (one MP3 and its timing table; see autodarts.ts).

import { listEntries, readEntry, ZipError, type ZipEntry } from './zip.js'
import { cutAutodarts } from './autodarts.js'

export interface Clip {
  bytes: Uint8Array
  mime: string
}
export interface ParsedPack {
  name: string
  lang: string | null
  total: number
  clips: Record<string, Clip[]>
}

const SHOTS = new Set(['busted', 'gameshot', 'matchshot', 'gameon', 'bulling_start', 'and', 'you_require'])
const SOUND = /\.(mp3|wav|ogg)$/i
const MIME: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' }

// What a pack may unpack to, against zip bombs: the clips zip inside a download, one clip or the
// template, and all the clips kept together
const MiB = 1024 * 1024
const INNER_ZIP_MAX = 128 * MiB
const ENTRY_MAX = 16 * MiB
const CLIPS_MAX = 64 * MiB

/** The keys the caller plays; everything else in a pack is dropped on import. */
export function isCallerKey(key: string): boolean {
  if (/^(0|[1-9]\d?|1[0-7]\d|180)$/.test(key)) return true
  if (/^require_([1-9]\d?|1[0-7]\d|180)$/.test(key)) return true
  return /^(leg|set)_\d+$/.test(key) || SHOTS.has(key)
}

/** Keys per template row (row n = clip n). Text only: the lowercased text is the key. */
export function parseTemplate(csv: string): string[][] {
  const rows = csv.replace(/^﻿/, '').split(/\r?\n/)
  if (rows.at(-1) === '') rows.pop()
  return rows.map(row => {
    const cells = row
      .split(';')
      .map(c => c.trim())
      .filter(c => c !== '')
    if (cells.length === 0) return []
    return cells.length === 1 ? [cells[0].toLowerCase()] : cells.slice(1)
  })
}

/** "en-GB-Arthur-Male-v4.zip" → "en-GB Arthur (Male)". */
export function packName(fileName: string): { name: string; lang: string | null } {
  const stem = fileName.replace(/\.zip$/i, '').replace(/-v\d+$/i, '')
  const m = /^([a-z]{2}-[A-Z]{2})-(.+?)-(male|female)$/i.exec(stem)
  if (!m) return { name: stem, lang: /^[a-z]{2}-[A-Z]{2}/.exec(stem)?.[0] ?? null }
  const gender = m[3][0].toUpperCase() + m[3].slice(1).toLowerCase()
  return { name: `${m[1]} ${m[2].replace(/-/g, ' ')} (${gender})`, lang: m[1] }
}

const base = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const isJunk = (path: string) => path.startsWith('__MACOSX/') || base(path).startsWith('.')

// Spelled-out shots ("game_shot", "match shot") and the keys they play for
const SPELLED = /^(game|match)[_ ](shot|on)$/

/** The key a clip named by key plays for: basename without extension, lowercased, hyphens as
 * underscores, a trailing "+N" variant marker dropped, spelled-out shots folded ("game shot",
 * "game_on", "match_shot" → "gameshot", "gameon", "matchshot"), "you require" → "you_require". */
export function keyFromName(fileName: string): string {
  const key = base(fileName)
    .replace(SOUND, '')
    .toLowerCase()
    .replace(/\+\d+$/, '')
    .replace(/-/g, '_')
  if (key === 'you require') return 'you_require'
  return SPELLED.test(key) ? key.replace(/[_ ]/, '') : key
}

export async function readPack(bytes: Uint8Array, fileName: string, opts: { autodarts?: boolean } = {}): Promise<ParsedPack> {
  let zip = bytes
  let entries = listEntries(zip).filter(e => !isJunk(e.name))
  if (opts.autodarts) {
    const voice = await autodartsVoice(zip, entries)
    if (voice) return voice
  }
  let csv = await template(zip, entries)
  let sounds = entries.filter(e => SOUND.test(e.name))
  if (sounds.length === 0) {
    const inner = entries.find(e => /\.zip$/i.test(e.name))
    if (!inner) throw new ZipError('No sound files found')
    zip = await readEntry(zip, inner, INNER_ZIP_MAX)
    entries = listEntries(zip).filter(e => !isJunk(e.name))
    csv ??= await template(zip, entries)
    sounds = entries.filter(e => SOUND.test(e.name))
    if (sounds.length === 0) throw new ZipError('No sound files found')
  }

  // Which entry plays for which kept keys
  const plan: [ZipEntry, string[]][] = []
  if (csv !== null) {
    const rows = parseTemplate(csv)
    const sorted = [...sounds].sort((a, b) => (base(a.name) < base(b.name) ? -1 : base(a.name) > base(b.name) ? 1 : 0))
    sorted.slice(0, rows.length).forEach((e, i) => {
      const keys = rows[i].filter(isCallerKey)
      if (keys.length > 0) plan.push([e, keys])
    })
  } else {
    for (const e of sounds) {
      const key = keyFromName(e.name)
      if (isCallerKey(key)) plan.push([e, [key]])
    }
  }
  if (plan.length === 0) throw new ZipError('No caller clips in this pack')

  const clips: Record<string, Clip[]> = {}
  let left = CLIPS_MAX
  for (const [e, keys] of plan) {
    const ext = SOUND.exec(e.name)?.[1].toLowerCase() ?? 'mp3'
    const clip: Clip = { bytes: await readEntry(zip, e, Math.min(ENTRY_MAX, left)), mime: MIME[ext] }
    left -= clip.bytes.length
    for (const k of keys) (clips[k] ??= []).push(clip)
  }
  return { ...packName(fileName), total: sounds.length, clips }
}

async function template(zip: Uint8Array, entries: ZipEntry[]): Promise<string | null> {
  const csv = entries.find(e => /\.csv$/i.test(e.name))
  return csv ? new TextDecoder().decode(await readEntry(zip, csv, ENTRY_MAX)) : null
}

/** An Autodarts voice zip (the bookmarklet's: one .mp3 and its .json table) cut into the caller's
 *  clips; null for any other zip. */
async function autodartsVoice(zip: Uint8Array, entries: ZipEntry[]): Promise<ParsedPack | null> {
  const sounds = entries.filter(e => SOUND.test(e.name))
  const table = entries.find(e => /\.json$/i.test(e.name))
  if (!table || sounds.length !== 1 || !/\.mp3$/i.test(sounds[0].name)) return null
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(await readEntry(zip, table, ENTRY_MAX)))
  } catch (err) {
    if (err instanceof ZipError) throw err
    return null
  }
  // Any other JSON (a pack's notes) leaves the zip to the ordinary reader
  const isTable = typeof json === 'object' && json !== null && 'sprite' in json && typeof json.sprite === 'object' && json.sprite !== null
  if (!isTable) return null
  const voice = cutAutodarts(await readEntry(zip, sounds[0], ENTRY_MAX), json)
  const kept = Object.entries(voice.clips).filter(([key]) => isCallerKey(key))
  if (kept.length === 0) throw new ZipError('No caller clips in this pack')
  // Clips may overlap in the MP3, so together they can be far bigger than it
  if (kept.reduce((n, [, bytes]) => n + bytes.length, 0) > CLIPS_MAX) throw new ZipError('That pack unpacks too big')
  const clips: Record<string, Clip[]> = {}
  for (const [key, bytes] of kept) clips[key] = [{ bytes, mime: MIME.mp3 }]
  return { name: voice.name, lang: voice.lang, total: voice.total, clips }
}
