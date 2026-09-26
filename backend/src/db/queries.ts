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
  s: { id: string; board_db_id: string | null; game_id: string; config: unknown; players: unknown },
): Promise<void> {
  await db.insertInto('game_sessions')
    .values({
      id: s.id,
      board_db_id: s.board_db_id,
      game_id: s.game_id,
      config: JSON.stringify(s.config) as any,
      players: JSON.stringify(s.players) as any,
      status: 'active',
    })
    .execute()
}

export async function getActiveGameSessions(db: Kysely<Database>) {
  return db.selectFrom('game_sessions')
    .selectAll()
    .where('status', '=', 'active')
    .where('board_db_id', 'is not', null)
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
      data: JSON.stringify(ev.data) as unknown,
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
