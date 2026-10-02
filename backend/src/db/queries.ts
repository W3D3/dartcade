import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { sql } from 'kysely'
import type { Kysely, Selectable } from 'kysely'
import type { Database, GamePlayersTable } from './schema.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function runMigrations(db: Kysely<Database>, opts: { until?: string } = {}): Promise<void> {
  await sql.raw(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name    TEXT PRIMARY KEY,
      run_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).execute(db)

  const migrationsDir = join(__dirname, 'migrations')
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()

  for (const file of files) {
    const already = await sql<{ name: string }>`
      SELECT name FROM schema_migrations WHERE name = ${file}
    `.execute(db)
    if (already.rows.length > 0) {
      if (file === opts.until) break
      continue
    }

    const migrationSql = readFileSync(join(migrationsDir, file), 'utf8')
    const statements = migrationSql
      .split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n')
      .split(';').map(s => s.trim()).filter(s => s.length > 0)
    // All of a file's statements plus its schema_migrations row commit together, so a
    // failure partway through (e.g. 006's FK rewrite) leaves nothing half-applied to
    // make the next run fail on.
    await db.transaction().execute(async (trx) => {
      for (const stmt of statements) {
        await sql.raw(stmt).execute(trx)
      }
      await sql`INSERT INTO schema_migrations (name) VALUES (${file})`.execute(trx)
    })
    if (file === opts.until) break
  }
}

// ---------------------------------------------------------------------------
// Game sessions and their history
// ---------------------------------------------------------------------------

export type SeatRow = { name: string; user_id: string | null; controller_user_id: string; board_db_id: string | null }
export type NewGameSession = {
  id: string; owner_user_id: string; board_db_id: string | null; game_id: string
  game_version: number; rng_seed: number; config: unknown; players: SeatRow[]
}
/** A seat as read back: the controller can be gone (account deleted), the board's name comes along. */
export type StoredSeatRow = { name: string; user_id: string | null; controller_user_id: string | null; board_db_id: string | null; board_name: string | null }
export type StoredGameSession = {
  id: string; owner_user_id: string | null; board_db_id: string | null; game_id: string
  game_version: number; rng_seed: number; config: unknown; created_at: Date; players: StoredSeatRow[]
}
export type GamePlayerRow = Selectable<GamePlayersTable>
export type NewSessionEvent = {
  session_id: string; seq: number; source: 'board' | 'user'; kind: string; data: unknown
  bridge_event_id: string | null; board_db_id: string | null; created_at: Date
}
export type StoredSessionEvent = { seq: number; source: string; kind: string; data: unknown; created_at: Date }
export type NewGameDart = {
  session_id: string; visit: number; dart_index: number; seat: number; leg: number
  phase: 'game' | 'bulloff'; segment: unknown; coords: { x: number; y: number } | null
  source: 'camera' | 'manual'; corrected: boolean; thrown_at: Date
}

/** A new running game and its seats (seat = index in `players`). */
export async function insertGameSession(db: Kysely<Database>, s: NewGameSession): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.insertInto('game_sessions')
      .values({
        id: s.id, owner_user_id: s.owner_user_id, board_db_id: s.board_db_id, game_id: s.game_id,
        game_version: s.game_version, rng_seed: s.rng_seed, config: JSON.stringify(s.config), status: 'active',
      })
      .execute()
    await trx.insertInto('game_players')
      .values(s.players.map((p, seat) => ({
        session_id: s.id, seat, name: p.name, user_id: p.user_id,
        controller_user_id: p.controller_user_id, board_db_id: p.board_db_id,
      })))
      .execute()
  })
}

/** Seats of these games in seat order, by game id. */
export async function getSeats(db: Kysely<Database>, sessionIds: string[]): Promise<Map<string, GamePlayerRow[]>> {
  const bySession = new Map<string, GamePlayerRow[]>()
  if (sessionIds.length === 0) return bySession
  const rows = await db.selectFrom('game_players').selectAll()
    .where('session_id', 'in', sessionIds)
    .orderBy('session_id').orderBy('seat')
    .execute()
  for (const r of rows) bySession.set(r.session_id, [...(bySession.get(r.session_id) ?? []), r])
  return bySession
}

export async function getActiveGameSessions(db: Kysely<Database>): Promise<StoredGameSession[]> {
  const rows = await db.selectFrom('game_sessions')
    .select(['id', 'owner_user_id', 'board_db_id', 'game_id', 'game_version', 'rng_seed', 'config', 'created_at'])
    .where('status', '=', 'active')
    .execute()
  if (rows.length === 0) return []
  const seats = await db.selectFrom('game_players as gp')
    .leftJoin('boards as b', 'b.id', 'gp.board_db_id')
    .select(['gp.session_id', 'gp.name', 'gp.user_id', 'gp.controller_user_id', 'gp.board_db_id', 'b.name as board_name'])
    .where('gp.session_id', 'in', rows.map(r => r.id))
    .orderBy('gp.session_id').orderBy('gp.seat')
    .execute()
  return rows.map(r => ({
    ...r,
    players: seats.filter(s => s.session_id === r.id).map(s => ({
      name: s.name, user_id: s.user_id, controller_user_id: s.controller_user_id,
      board_db_id: s.board_db_id, board_name: s.board_name,
    })),
  }))
}

export async function getGameSessionById(db: Kysely<Database>, id: string) {
  return db.selectFrom('game_sessions').selectAll().where('id', '=', id).executeTakeFirst()
}

export async function appendSessionEvent(db: Kysely<Database>, e: NewSessionEvent): Promise<void> {
  await db.insertInto('game_session_events').values({ ...e, data: JSON.stringify(e.data) }).execute()
}

/** A game's input log in order. */
export async function getSessionEvents(db: Kysely<Database>, sessionId: string): Promise<StoredSessionEvent[]> {
  return db.selectFrom('game_session_events')
    .select(['seq', 'source', 'kind', 'data', 'created_at'])
    .where('session_id', '=', sessionId)
    .orderBy('seq')
    .execute()
}

// Keeps one insert well under Postgres' 65535 bind-parameter limit regardless of how
// many columns game_darts has (a very long game can commit thousands of darts at once,
// e.g. rebuild() re-inserting a whole session's history).
const DART_INSERT_CHUNK_SIZE = 1000

/** Darts of committed visits; ones already stored are skipped (a rebuild re-inserts them all). */
export async function insertGameDarts(db: Kysely<Database>, rows: NewGameDart[]): Promise<void> {
  if (rows.length === 0) return
  const values = rows.map(r => ({ ...r, segment: JSON.stringify(r.segment), coords: r.coords === null ? null : JSON.stringify(r.coords) }))
  for (let i = 0; i < values.length; i += DART_INSERT_CHUNK_SIZE) {
    await db.insertInto('game_darts')
      .values(values.slice(i, i + DART_INSERT_CHUNK_SIZE))
      .onConflict(oc => oc.columns(['session_id', 'visit', 'dart_index']).doNothing())
      .execute()
  }
}

/** The game was won: placements, stats and forfeited status per seat (in seat order). */
export async function finishGameSession(db: Kysely<Database>, id: string, finishedAt: Date, results: { placement: number; stats: Record<string, number>; throwPosition: number; forfeited: boolean }[]): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.updateTable('game_sessions').set({ status: 'finished', finished_at: finishedAt }).where('id', '=', id).execute()
    for (const [seat, r] of results.entries()) {
      await trx.updateTable('game_players')
        .set({ placement: r.placement, stats: JSON.stringify(r.stats), throw_position: r.throwPosition, forfeited: r.forfeited })
        .where('session_id', '=', id).where('seat', '=', seat)
        .execute()
    }
  })
}

/** The game was ended without a result; its log and darts stay. */
export async function abortGameSession(db: Kysely<Database>, id: string, finishedAt: Date): Promise<void> {
  await db.updateTable('game_sessions').set({ status: 'aborted', finished_at: finishedAt }).where('id', '=', id).execute()
}

/** A board is busy if an active game uses it as its own board or as any seat's board. */
export async function hasActiveSessionOnBoard(db: Kysely<Database>, boardDbId: string): Promise<boolean> {
  const row = await db.selectFrom('game_sessions as gs')
    .leftJoin('game_players as gp', 'gp.session_id', 'gs.id')
    .select('gs.id')
    .where('gs.status', '=', 'active')
    .where(eb => eb.or([eb('gs.board_db_id', '=', boardDbId), eb('gp.board_db_id', '=', boardDbId)]))
    .executeTakeFirst()
  return row !== undefined
}

// ---------------------------------------------------------------------------
// Bridge events
// ---------------------------------------------------------------------------

export type InsertBridgeEventParams = {
  bridge_id: string
  boot_id: string
  seq: bigint
  board_id: string
  recv_wall: Date
  kind: string
  data: unknown
}

export async function insertBridgeEvent(
  db: Kysely<Database>,
  ev: InsertBridgeEventParams,
): Promise<{ inserted: boolean; id: string | null }> {
  const row = await db.insertInto('bridge_events')
    .values({
      bridge_id: ev.bridge_id,
      boot_id: ev.boot_id,
      seq: ev.seq,
      board_id: ev.board_id,
      recv_wall: ev.recv_wall,
      kind: ev.kind,
      data: JSON.stringify(ev.data),
    })
    .onConflict(oc => oc.columns(['bridge_id', 'boot_id', 'seq']).doNothing())
    .returning('id')
    .executeTakeFirst()
  return { inserted: row !== undefined, id: row === undefined ? null : String(row.id) }
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

export async function getBoardsByOwner(db: Kysely<Database>, userId: string) {
  return db.selectFrom('boards').selectAll().where('owner_user_id', '=', userId).execute()
}

export async function insertBoard(
  db: Kysely<Database>,
  b: { id: string; owner_user_id: string; name: string; token_hash: string },
): Promise<void> {
  await db.insertInto('boards').values(b).execute()
}

export async function getBoardById(db: Kysely<Database>, id: string) {
  return db.selectFrom('boards').selectAll().where('id', '=', id).executeTakeFirst()
}

export async function deleteBoard(db: Kysely<Database>, id: string): Promise<void> {
  await db.deleteFrom('boards').where('id', '=', id).execute()
}

export async function renameBoard(db: Kysely<Database>, id: string, name: string): Promise<void> {
  await db.updateTable('boards').set({ name }).where('id', '=', id).execute()
}

export async function getBoardByTokenHash(db: Kysely<Database>, tokenHash: string) {
  return db.selectFrom('boards').selectAll().where('token_hash', '=', tokenHash).executeTakeFirst()
}

export async function updateBoardHardwareId(
  db: Kysely<Database>,
  boardDbId: string,
  hardwareId: string,
): Promise<void> {
  await db.updateTable('boards')
    .set({ hardware_id: hardwareId })
    .where('id', '=', boardDbId)
    .where('hardware_id', 'is', null)
    .execute()
}

// ---------------------------------------------------------------------------
// Pairing codes
// ---------------------------------------------------------------------------

export async function insertPairingCode(
  db: Kysely<Database>,
  p: { code: string; expiresAt: Date },
): Promise<void> {
  await db.insertInto('pairing_codes')
    .values({ code: p.code, expires_at: p.expiresAt })
    .execute()
}

export async function getPairingCode(db: Kysely<Database>, code: string) {
  return db.selectFrom('pairing_codes')
    .selectAll()
    .where('code', '=', code)
    .executeTakeFirst()
}

export async function claimPairingCode(
  db: Kysely<Database>,
  p: { code: string; rawToken: string; boardId: string },
): Promise<void> {
  const result = await db.updateTable('pairing_codes')
    .set({ claimed_at: new Date(), raw_token: p.rawToken, board_id: p.boardId })
    .where('code', '=', p.code)
    .where('claimed_at', 'is', null)
    .executeTakeFirst()
  if (result.numUpdatedRows === 0n) {
    throw new Error('pairing code already claimed')
  }
}

// consumePairingToken atomically reads and clears the one-time token: it locks
// the row, returns the token if still present (nulling it), or null if it was
// already delivered. The row lock serializes concurrent polls so the token is
// handed out at most once.
export async function consumePairingToken(db: Kysely<Database>, code: string): Promise<string | null> {
  return db.transaction().execute(async (trx) => {
    const row = await trx.selectFrom('pairing_codes')
      .select('raw_token')
      .where('code', '=', code)
      .forUpdate()
      .executeTakeFirst()
    if (!row?.raw_token) return null
    await trx.updateTable('pairing_codes')
      .set({ raw_token: null })
      .where('code', '=', code)
      .execute()
    return row.raw_token
  })
}

// ---------------------------------------------------------------------------
// Accounts to play with
// ---------------------------------------------------------------------------

export type UserSummary = { id: string; name: string }

// % and _ are wildcards in LIKE; a search treats them as plain characters
const likePrefix = (q: string) => `${q.replace(/[\\%_]/g, c => `\\${c}`)}%`

/** Other accounts whose name or email starts with `q` (case-insensitive), at most 8. */
export async function searchUsers(db: Kysely<Database>, q: string, excludeUserId: string): Promise<UserSummary[]> {
  const pattern = likePrefix(q.trim())
  return db.selectFrom('user').select(['id', 'name'])
    .where('id', '!=', excludeUserId)
    .where(eb => eb.or([eb('name', 'ilike', pattern), eb('email', 'ilike', pattern)]))
    .orderBy('name')
    .limit(8)
    .execute()
}

/** The accounts among `ids` that exist. */
export async function getUsersByIds(db: Kysely<Database>, ids: string[]): Promise<UserSummary[]> {
  if (ids.length === 0) return []
  return db.selectFrom('user').select(['id', 'name']).where('id', 'in', ids).execute()
}
