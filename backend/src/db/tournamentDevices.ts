import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'

/** Codes and session tokens are stored only as this hash (like a board's token). */
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** A pairing code is good for this long. */
export const PAIR_MS = 15 * 60_000
/** A paired device's session ends this long after pairing at the latest, or when it is idle for IDLE_MS. */
export const SESSION_MS = 7 * 24 * 3_600_000
export const IDLE_MS = 24 * 3_600_000
/** Last seen is written at most this often. */
const TOUCH_MS = 60_000

/** No 0/O/1/I: a code read off a screen and typed. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function newPairCode(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('')
}

/** What the organizer and the device itself may know of a device; never a hash. */
export interface DeviceRow {
  id: string
  tournamentId: string
  name: string | null
  paired: boolean
  createdAt: Date
  lastSeenAt: Date | null
  expiresAt: Date
}

export interface DeviceSession {
  id: string
  tournamentId: string
  createdBy: string
  name: string | null
}

/** A new device waiting for its code to be opened; the code is shown once. */
export async function addDevice(
  db: Kysely<Database>,
  tournamentId: string,
  createdBy: string,
  now: Date,
): Promise<{ id: string; code: string; expiresAt: Date }> {
  const id = randomUUID()
  const code = newPairCode()
  const expiresAt = new Date(now.getTime() + PAIR_MS)
  await db
    .insertInto('tournament_devices')
    .values({ id, tournament_id: tournamentId, created_by: createdBy, pair_code_hash: hashToken(code), pair_expires_at: expiresAt })
    .execute()
  return { id, code, expiresAt }
}

/**
 * Exchanges a pairing code for a session token: once, before it expires, on a tournament that is
 * still going. The one UPDATE makes a second use of the same code find nothing.
 */
export async function pairDevice(
  db: Kysely<Database>,
  code: string,
  now: Date,
): Promise<{ token: string; session: DeviceSession; expiresAt: Date } | null> {
  const token = randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(now.getTime() + SESSION_MS)
  const row = await db
    .updateTable('tournament_devices')
    .set({ pair_code_hash: null, token_hash: tokenHash, paired_at: now, last_seen_at: now, expires_at: expiresAt })
    .where('pair_code_hash', '=', hashToken(code))
    .where('pair_expires_at', '>', now)
    .where('revoked_at', 'is', null)
    .where(eb =>
      eb.exists(
        eb
          .selectFrom('tournaments')
          .select('id')
          .whereRef('tournaments.id', '=', 'tournament_devices.tournament_id')
          .where('tournaments.status', 'not in', ['finished', 'cancelled']),
      ),
    )
    .returning(['id', 'tournament_id', 'created_by', 'name'])
    .executeTakeFirst()
  if (!row) return null
  return { token, expiresAt, session: { id: row.id, tournamentId: row.tournament_id, createdBy: row.created_by, name: row.name } }
}

/** The live session for a token: paired, not revoked, not past its age or idle limit, tournament not over. */
export async function deviceByToken(db: Kysely<Database>, token: string, now: Date): Promise<DeviceSession | null> {
  const row = await db
    .selectFrom('tournament_devices as d')
    .innerJoin('tournaments as t', 't.id', 'd.tournament_id')
    .select(['d.id', 'd.tournament_id', 'd.created_by', 'd.name', 'd.last_seen_at'])
    .where('d.token_hash', '=', hashToken(token))
    .where('d.revoked_at', 'is', null)
    .where('d.expires_at', '>', now)
    .where('d.last_seen_at', '>', new Date(now.getTime() - IDLE_MS))
    .where('t.status', 'not in', ['finished', 'cancelled'])
    .executeTakeFirst()
  if (!row) return null
  if (row.last_seen_at && now.getTime() - row.last_seen_at.getTime() > TOUCH_MS) {
    await db.updateTable('tournament_devices').set({ last_seen_at: now }).where('id', '=', row.id).execute()
  }
  return { id: row.id, tournamentId: row.tournament_id, createdBy: row.created_by, name: row.name }
}

/** The tournament's devices still in use (waiting for pairing or paired), oldest first. */
export async function listDevices(db: Kysely<Database>, tournamentId: string, now: Date): Promise<DeviceRow[]> {
  const rows = await db
    .selectFrom('tournament_devices')
    .select(['id', 'tournament_id', 'name', 'pair_code_hash', 'pair_expires_at', 'created_at', 'last_seen_at', 'expires_at'])
    .where('tournament_id', '=', tournamentId)
    .where('revoked_at', 'is', null)
    .where(eb => eb.or([eb('token_hash', 'is not', null), eb('pair_expires_at', '>', now)]))
    .orderBy('created_at')
    .execute()
  return rows.map(r => ({
    id: r.id,
    tournamentId: r.tournament_id,
    name: r.name,
    paired: r.pair_code_hash === null,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    expiresAt: r.expires_at ?? r.pair_expires_at,
  }))
}

/** Revokes one device, or every device of the tournament; the ids that were live, to cut their sockets. */
export async function revokeDevices(db: Kysely<Database>, tournamentId: string, deviceId: string | null, now: Date): Promise<string[]> {
  let q = db
    .updateTable('tournament_devices')
    .set({ revoked_at: now, pair_code_hash: null, token_hash: null })
    .where('tournament_id', '=', tournamentId)
    .where('revoked_at', 'is', null)
  if (deviceId !== null) q = q.where('id', '=', deviceId)
  return (await q.returning('id').execute()).map(r => r.id)
}

export async function renameDevice(db: Kysely<Database>, deviceId: string, name: string): Promise<void> {
  await db.updateTable('tournament_devices').set({ name }).where('id', '=', deviceId).execute()
}
