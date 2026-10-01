import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { sql } from 'kysely'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function runMigrations(db: Kysely<Database>): Promise<void> {
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
    if (already.rows.length > 0) continue

    const migrationSql = readFileSync(join(migrationsDir, file), 'utf8')
    const statements = migrationSql
      .split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n')
      .split(';').map(s => s.trim()).filter(s => s.length > 0)
    for (const stmt of statements) {
      await sql.raw(stmt).execute(db)
    }
    await sql`INSERT INTO schema_migrations (name) VALUES (${file})`.execute(db)
  }
}

// ---------------------------------------------------------------------------
// Game sessions
// ---------------------------------------------------------------------------

export async function insertGameSession(
  db: Kysely<Database>,
  s: { id: string; owner_user_id: string; board_db_id: string | null; game_id: string; config: unknown; players: unknown },
): Promise<void> {
  await db.insertInto('game_sessions')
    .values({
      id: s.id,
      owner_user_id: s.owner_user_id,
      board_db_id: s.board_db_id,
      game_id: s.game_id,
      config: JSON.stringify(s.config),
      players: JSON.stringify(s.players),
      status: 'active',
    })
    .execute()
}

export async function getActiveGameSessions(db: Kysely<Database>) {
  return db.selectFrom('game_sessions')
    .selectAll()
    .where('status', '=', 'active')
    .execute()
}

export async function getGameSessionById(db: Kysely<Database>, id: string) {
  return db.selectFrom('game_sessions').selectAll().where('id', '=', id).executeTakeFirst()
}

export async function setGameSessionFinished(db: Kysely<Database>, id: string): Promise<void> {
  await db.updateTable('game_sessions').set({ status: 'finished' }).where('id', '=', id).execute()
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
): Promise<{ inserted: boolean }> {
  const result = await db.insertInto('bridge_events')
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
    .executeTakeFirst()
  return { inserted: (result.numInsertedOrUpdatedRows ?? BigInt(0)) > BigInt(0) }
}

export async function getBridgeEventsForBoardDbId(
  db: Kysely<Database>,
  boardDbId: string,
  since: Date,
) {
  const board = await db.selectFrom('boards')
    .select('hardware_id')
    .where('id', '=', boardDbId)
    .executeTakeFirst()
  if (!board?.hardware_id) return []
  return db.selectFrom('bridge_events')
    .selectAll()
    .where('board_id', '=', board.hardware_id)
    .where('inserted_at', '>=', since)
    .orderBy('inserted_at', 'asc')
    .execute()
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
