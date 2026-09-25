import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { sql } from 'kysely'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function runMigrations(db: Kysely<Database>): Promise<void> {
  const migrationSql = readFileSync(
    join(__dirname, 'migrations/001_init.sql'),
    'utf8',
  )
  await sql.raw(migrationSql).execute(db)
}

export async function insertSession(
  db: Kysely<Database>,
  s: { id: string; board_id: string; game_id: string; config: unknown; players: unknown },
): Promise<void> {
  await db.insertInto('sessions')
    .values({
      id: s.id,
      board_id: s.board_id,
      game_id: s.game_id,
      // Cast to any: Kysely expects typed JSONB but we pass a JSON string (pg driver accepts it)
      config: JSON.stringify(s.config) as any,
      players: JSON.stringify(s.players) as any,
      status: 'active',
    })
    .execute()
}

export async function getActiveSessions(db: Kysely<Database>) {
  return db.selectFrom('sessions')
    .selectAll()
    .where('status', '=', 'active')
    .execute()
}

export async function getSessionById(db: Kysely<Database>, id: string) {
  return db.selectFrom('sessions').selectAll().where('id', '=', id).executeTakeFirst()
}

export async function setSessionFinished(db: Kysely<Database>, id: string): Promise<void> {
  await db.updateTable('sessions').set({ status: 'finished' }).where('id', '=', id).execute()
}

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

export async function getBridgeEventsForBoard(
  db: Kysely<Database>,
  boardId: string,
  since: Date,
) {
  return db.selectFrom('bridge_events')
    .selectAll()
    .where('board_id', '=', boardId)
    .where('inserted_at', '>=', since)
    .orderBy('inserted_at', 'asc')
    .execute()
}
