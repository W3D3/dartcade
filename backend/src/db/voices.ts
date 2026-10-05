import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from './schema.js'
import { pgErrorCode } from './errors.js'

export type NewVoiceClip = { sha256: string; mime: string; bytes: Buffer }
export type NewVoicePack = {
  id: string
  ownerId: string
  name: string
  lang: string | null
  source: 'upload' | 'url'
  sourceUrl: string | null
  clips: NewVoiceClip[]
  /** key → variant → clip; variants numbered from 0 */
  mappings: { key: string; variant: number; sha256: string }[]
}
export type VoicePackRow = { id: string; name: string; lang: string | null; clips: number; bytes: number; created_at: Date }

const FK_VIOLATION = '23503'

// Keeps each INSERT well under Postgres' 65535 parameters
const CHUNK = 1000
function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK))
  return out
}

/**
 * A pack with its clips (new files only are written) and key → clip rows, in one transaction.
 * Retried once if another user's delete removed one of its files between our insert of the files
 * and of the key rows (the foreign key refuses the key rows then).
 */
export async function insertVoicePack(db: Kysely<Database>, pack: NewVoicePack): Promise<void> {
  try {
    await insertVoicePackOnce(db, pack)
  } catch (err) {
    if (pgErrorCode(err) !== FK_VIOLATION) throw err
    await insertVoicePackOnce(db, pack)
  }
}

async function insertVoicePackOnce(db: Kysely<Database>, pack: NewVoicePack): Promise<void> {
  await db.transaction().execute(async trx => {
    for (const rows of chunks(pack.clips)) {
      await trx
        .insertInto('voice_clips')
        .values(rows.map(c => ({ sha256: c.sha256, mime: c.mime, size: c.bytes.length, bytes: c.bytes })))
        .onConflict(oc => oc.column('sha256').doNothing())
        .execute()
    }
    await trx
      .insertInto('voice_packs')
      .values({
        id: pack.id,
        owner_id: pack.ownerId,
        name: pack.name,
        lang: pack.lang,
        source: pack.source,
        source_url: pack.sourceUrl,
      })
      .execute()
    for (const rows of chunks(pack.mappings)) {
      await trx
        .insertInto('voice_pack_clips')
        .values(rows.map(m => ({ pack_id: pack.id, key: m.key, variant: m.variant, clip_sha256: m.sha256 })))
        .execute()
    }
  })
}

/** Each distinct file of a pack once, as (pack, clip) pairs. */
const packFiles = (db: Kysely<Database>) => db.selectFrom('voice_pack_clips').select(['pack_id', 'clip_sha256']).distinct()

/** A user's packs, oldest first, with how many files each holds and their size. */
export async function listVoicePacks(db: Kysely<Database>, ownerId: string): Promise<VoicePackRow[]> {
  return (
    db
      .selectFrom('voice_packs as p')
      .leftJoin(packFiles(db).as('f'), 'f.pack_id', 'p.id')
      .leftJoin('voice_clips as c', 'c.sha256', 'f.clip_sha256')
      .select(['p.id', 'p.name', 'p.lang', 'p.created_at'])
      .select(eb => [eb.fn.count<string>('c.sha256').as('clips'), sql<string>`coalesce(sum(c.size), 0)`.as('bytes')])
      .where('p.owner_id', '=', ownerId)
      .groupBy('p.id')
      .orderBy('p.created_at')
      .orderBy('p.id')
      .execute()
      // count and sum are bigint, which node-postgres returns as strings
      .then(rows => rows.map(r => ({ ...r, clips: Number(r.clips), bytes: Number(r.bytes) })))
  )
}

/** Bytes a user's packs hold: every file of every pack at full size, shared with others or not. */
export async function voiceUsage(db: Kysely<Database>, ownerId: string): Promise<number> {
  const row = await db
    .selectFrom(packFiles(db).as('f'))
    .innerJoin('voice_packs as p', 'p.id', 'f.pack_id')
    .innerJoin('voice_clips as c', 'c.sha256', 'f.clip_sha256')
    .select(sql<string>`coalesce(sum(c.size), 0)`.as('bytes'))
    .where('p.owner_id', '=', ownerId)
    .executeTakeFirstOrThrow()
  return Number(row.bytes)
}

/** A pack of the user's and its key → clip hashes (variants in order); null if not theirs. */
export async function getVoicePackClips(
  db: Kysely<Database>,
  ownerId: string,
  packId: string,
): Promise<{ id: string; name: string; clips: { key: string; sha256: string }[] } | null> {
  const pack = await db
    .selectFrom('voice_packs')
    .select(['id', 'name'])
    .where('id', '=', packId)
    .where('owner_id', '=', ownerId)
    .executeTakeFirst()
  if (!pack) return null
  const rows = await db
    .selectFrom('voice_pack_clips')
    .select(['key', 'clip_sha256 as sha256'])
    .where('pack_id', '=', packId)
    .orderBy('key')
    .orderBy('variant')
    .execute()
  return { ...pack, clips: rows }
}

/** A clip, if one of the user's packs uses it. */
export async function getVoiceClipOf(
  db: Kysely<Database>,
  userId: string,
  sha256: string,
): Promise<{ bytes: Buffer; mime: string } | null> {
  const row = await db
    .selectFrom('voice_clips as c')
    .select(['c.bytes', 'c.mime'])
    .where('c.sha256', '=', sha256)
    .where(eb =>
      eb.exists(
        eb
          .selectFrom('voice_pack_clips as m')
          .innerJoin('voice_packs as p', 'p.id', 'm.pack_id')
          .select(sql.lit(1).as('one'))
          .whereRef('m.clip_sha256', '=', 'c.sha256')
          .where('p.owner_id', '=', userId),
      ),
    )
    .executeTakeFirst()
  return row ?? null
}

/** Deletes a pack of the user's and the files no pack uses any more; false if it isn't theirs. */
export async function deleteVoicePack(db: Kysely<Database>, ownerId: string, packId: string): Promise<boolean> {
  return db.transaction().execute(async trx => {
    const hashes = (
      await trx
        .selectFrom('voice_pack_clips as m')
        .innerJoin('voice_packs as p', 'p.id', 'm.pack_id')
        .select('m.clip_sha256')
        .distinct()
        .where('p.id', '=', packId)
        .where('p.owner_id', '=', ownerId)
        .execute()
    ).map(r => r.clip_sha256)
    const deleted = await trx.deleteFrom('voice_packs').where('id', '=', packId).where('owner_id', '=', ownerId).executeTakeFirst()
    if (deleted.numDeletedRows === 0n) return false
    if (hashes.length > 0) await sweepOrphanClips(trx, hashes)
    return true
  })
}

/**
 * Deletes the files no pack uses (only among `hashes` when given). Call it inside a transaction.
 * An import running alongside may have just mapped one of them again: the foreign key then
 * refuses the whole statement, so it runs once more, which (READ COMMITTED, a new snapshot)
 * sees that mapping, keeps that file and deletes the real orphans. Should even that be refused,
 * the files stay until a later sweep.
 */
export async function sweepOrphanClips(trx: Transaction<Database>, hashes?: string[]): Promise<void> {
  const sweep = () => {
    let q = trx
      .deleteFrom('voice_clips as c')
      .where(eb =>
        eb.not(eb.exists(eb.selectFrom('voice_pack_clips as m').select(sql.lit(1).as('one')).whereRef('m.clip_sha256', '=', 'c.sha256'))),
      )
    if (hashes) q = q.where('c.sha256', 'in', hashes)
    return q.execute()
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    await sql`SAVEPOINT orphans`.execute(trx)
    try {
      await sweep()
      await sql`RELEASE SAVEPOINT orphans`.execute(trx)
      return
    } catch (err) {
      if (pgErrorCode(err) !== FK_VIOLATION) throw err
      await sql`ROLLBACK TO SAVEPOINT orphans`.execute(trx)
    }
  }
}
