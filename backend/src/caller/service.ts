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
  constructor(readonly used: number, readonly limit: number, readonly needed = 0) {
    super(limit === 0 ? 'Voice imports are turned off' : limitMessage(used, limit, needed))
  }
}

/** The user already has an import running, or the server has as many running as it takes. */
export class VoiceBusyError extends Error {
  constructor(readonly server = false) {
    super(server ? 'The server is busy importing voices, try again in a minute' : 'An import is already running')
  }
}

const MB = 1024 * 1024
/** "…: 10.0 of 50 MB used, this pack needs 45.2 MB"; in KB when the limit is under a megabyte. */
function limitMessage(used: number, limit: number, needed: number): string {
  const [unit, label] = limit >= MB ? [MB, 'MB'] : [1024, 'KB']
  const fixed = (n: number) => (n / unit).toFixed(1)
  const short = (n: number) => String(Number(fixed(n)))
  return `Voice storage limit reached: ${fixed(used)} of ${short(limit)} ${label} used, this pack needs ${fixed(needed)} ${label}`
}

/** The same memory as a Buffer (no copy), which is what pg writes to a BYTEA. */
const asBuffer = (b: Uint8Array) => Buffer.from(b.buffer, b.byteOffset, b.byteLength)

const summary = (r: VoicePackRow): VoicePackSummary => ({
  id: r.id, name: r.name, lang: r.lang, clips: r.clips, bytes: r.bytes, createdAt: r.created_at.toISOString(),
})

/** Imports running at once across all users: each holds a pack of up to 128 MB in memory. */
const MAX_RUNNING = 2
const running = new Set<string>()

/** A user's place among the imports running; release it once (more calls do nothing). */
export interface ImportSlot { release(): void }

/**
 * Takes the user's import slot: one import at a time per user, and at most two across all users.
 * Throws a VoiceBusyError when the user's import (or as many as the server takes) runs.
 */
export function reserveImport(userId: string): ImportSlot {
  if (running.has(userId)) throw new VoiceBusyError()
  if (running.size >= MAX_RUNNING) throw new VoiceBusyError(true)
  running.add(userId)
  let held = true
  return { release() { if (held) { held = false; running.delete(userId) } } }
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
      if (!files.has(sha256)) files.set(sha256, { sha256, mime: clip.mime, bytes: asBuffer(clip.bytes) })
      mappings.push({ key, variant, sha256 })
    })
  }

  const used = limitBytes === 0 ? 0 : await usage(db, userId)
  const size = [...files.values()].reduce((sum, f) => sum + f.bytes.length, 0)
  if (limitBytes === 0 || used + size > limitBytes) throw new VoiceLimitError(used, limitBytes, size)

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
