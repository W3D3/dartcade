// darts-caller voice packs: read the zip a player imports and keep only the caller's clips.
// Two shapes: the download (clips zip + template CSV; the i-th clip in sorted name order is the
// i-th CSV row) and an installed pack (clips named by key: 180.mp3, gameshot+1.mp3).

import { listEntries, readEntry, ZipError, type ZipEntry } from './zip.js'

export interface Clip { bytes: Uint8Array; mime: string }
export interface ParsedPack { name: string; lang: string | null; total: number; clips: Record<string, Clip[]> }

const SHOTS = new Set(['busted', 'gameshot', 'matchshot', 'gameon', 'bulling_start'])
const SOUND = /\.(mp3|wav|ogg)$/i
const MIME: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' }

/** The keys the caller plays; everything else in a pack is dropped on import. */
export function isCallerKey(key: string): boolean {
  if (/^(0|[1-9]\d?|1[0-7]\d|180)$/.test(key)) return true
  return /^(leg|set)_\d+$/.test(key) || SHOTS.has(key)
}

/** Keys per template row (row n = clip n). Text only: the lowercased text is the key. */
export function parseTemplate(csv: string): string[][] {
  const rows = csv.replace(/^﻿/, '').split(/\r?\n/)
  if (rows.at(-1) === '') rows.pop()
  return rows.map(row => {
    const cells = row.split(';').map(c => c.trim()).filter(c => c !== '')
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

/** The key a clip named by key plays for: basename without extension, lowercased, hyphens as
 * underscores, a trailing "+N" variant marker dropped, "game on" folded to "gameon". */
export function keyFromName(fileName: string): string {
  const key = base(fileName).replace(SOUND, '').toLowerCase().replace(/\+\d+$/, '').replace(/-/g, '_')
  return key === 'game on' ? 'gameon' : key
}

export async function readPack(bytes: Uint8Array, fileName: string): Promise<ParsedPack> {
  let zip = bytes
  let entries = listEntries(zip).filter(e => !isJunk(e.name))
  let csv = await template(zip, entries)
  let sounds = entries.filter(e => SOUND.test(e.name))
  if (sounds.length === 0) {
    const inner = entries.find(e => /\.zip$/i.test(e.name))
    if (!inner) throw new ZipError('No sound files found')
    zip = await readEntry(zip, inner)
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
  for (const [e, keys] of plan) {
    const ext = SOUND.exec(e.name)?.[1].toLowerCase() ?? 'mp3'
    const clip: Clip = { bytes: await readEntry(zip, e), mime: MIME[ext] }
    for (const k of keys) (clips[k] ??= []).push(clip)
  }
  return { ...packName(fileName), total: sounds.length, clips }
}

async function template(zip: Uint8Array, entries: ZipEntry[]): Promise<string | null> {
  const csv = entries.find(e => /\.csv$/i.test(e.name))
  return csv ? new TextDecoder().decode(await readEntry(zip, csv)) : null
}
