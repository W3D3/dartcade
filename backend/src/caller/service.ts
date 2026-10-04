// Voice packs per user: import (each file stored once by SHA-256), list, manifest, clips, delete.
// A user reaches a clip only through one of their own packs.
// Design: docs/superpowers/specs/2026-10-04-caller-voice-packs-design.md

import { createHash } from 'crypto'
import { ulid } from 'ulid'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import {
  insertVoicePack, listVoicePacks, voiceUsage, getVoicePackClips, getVoiceClipOf, deleteVoicePack,
  type NewVoiceClip, type VoicePackRow,
} from '../db/voices.js'
import type { ParsedPack } from './pack.js'
import { voiceConfig } from './config.js'

export type VoicePackSummary = { id: string; name: string; lang: string | null; clips: number; bytes: number; createdAt: string }
export type VoicePackManifest = { id: string; name: string; clips: Record<string, string[]> }
export type PackSource = { kind: 'upload' | 'url'; url?: string }

/** An import that would take the user over their storage limit (or imports are off). */
export class VoiceLimitError extends Error {
  constructor(readonly used: number, readonly limit: number) {
    super(limit === 0 ? 'Voice imports are turned off' : `Voice storage limit reached: ${amounts(used, limit)} used`)
  }
}

/** The user already has an import running. */
export class VoiceBusyError extends Error {
  constructor() { super('An import is already running') }
}

const MB = 1024 * 1024
/** "48.2 of 50 MB"; in KB when the limit is under a megabyte. */
function amounts(used: number, limit: number): string {
  const [unit, label] = limit >= MB ? [MB, 'MB'] : [1024, 'KB']
  const fmt = (n: number) => String(Number((n / unit).toFixed(1)))
  return `${fmt(used)} of ${fmt(limit)} ${label}`
}

const summary = (r: VoicePackRow): VoicePackSummary => ({
  id: r.id, name: r.name, lang: r.lang, clips: r.clips, bytes: r.bytes, createdAt: r.created_at.toISOString(),
})

const running = new Set<string>()

/** Runs one import for the user at a time; a second one while it runs gets a VoiceBusyError. */
export async function withImportLock<T>(userId: string, run: () => Promise<T>): Promise<T> {
  if (running.has(userId)) throw new VoiceBusyError()
  running.add(userId)
  try { return await run() }
  finally { running.delete(userId) }
}

/** Stores a parsed pack for the user. Refused with a VoiceLimitError if it doesn't fit. */
export async function importPack(
  db: Kysely<Database>, userId: string, parsed: ParsedPack, source: PackSource,
  limitBytes: number = voiceConfig().limitBytes,
): Promise<VoicePackSummary> {
  const files = new Map<string, NewVoiceClip>()
  const mappings: { key: string; variant: number; sha256: string }[] = []
  for (const [key, variants] of Object.entries(parsed.clips)) {
    variants.forEach((clip, variant) => {
      const sha256 = createHash('sha256').update(clip.bytes).digest('hex')
      if (!files.has(sha256)) files.set(sha256, { sha256, mime: clip.mime, bytes: Buffer.from(clip.bytes) })
      mappings.push({ key, variant, sha256 })
    })
  }

  const used = limitBytes === 0 ? 0 : await usage(db, userId)
  const size = [...files.values()].reduce((sum, f) => sum + f.bytes.length, 0)
  if (limitBytes === 0 || used + size > limitBytes) throw new VoiceLimitError(used, limitBytes)

  const id = ulid()
  await insertVoicePack(db, {
    id, ownerId: userId, name: parsed.name, lang: parsed.lang,
    source: source.kind, sourceUrl: source.url ?? null,
    clips: [...files.values()], mappings,
  })
  const row = (await listVoicePacks(db, userId)).find(p => p.id === id)
  if (!row) throw new Error(`voice pack ${id} vanished after import`)
  return summary(row)
}

export async function listPacks(db: Kysely<Database>, userId: string): Promise<VoicePackSummary[]> {
  return (await listVoicePacks(db, userId)).map(summary)
}

/** The user's pack with its key → clip hashes; null if it isn't theirs. */
export async function packManifest(db: Kysely<Database>, userId: string, packId: string): Promise<VoicePackManifest | null> {
  const pack = await getVoicePackClips(db, userId, packId)
  if (!pack) return null
  const clips: Record<string, string[]> = {}
  for (const { key, sha256 } of pack.clips) (clips[key] ??= []).push(sha256)
  return { id: pack.id, name: pack.name, clips }
}

export function clipFor(db: Kysely<Database>, userId: string, sha256: string): Promise<{ bytes: Buffer; mime: string } | null> {
  return getVoiceClipOf(db, userId, sha256)
}

export function deletePack(db: Kysely<Database>, userId: string, packId: string): Promise<boolean> {
  return deleteVoicePack(db, userId, packId)
}

/** Bytes the user's packs hold, counted against their limit. */
export function usage(db: Kysely<Database>, userId: string): Promise<number> {
  return voiceUsage(db, userId)
}
