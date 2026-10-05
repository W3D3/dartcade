import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createHash } from 'crypto'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import type { Clip, ParsedPack } from '../caller/pack.js'
import { sweepOrphanClips } from './voices.js'
import { importPack, listPacks, packManifest, clipFor, deletePack, usage, VoiceLimitError } from '../caller/service.js'

const clip = (s: string, mime = 'audio/mpeg'): Clip => ({ bytes: new TextEncoder().encode(s), mime })
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

// 180 and the second gameshot are the same file; one clip only A's pack has
const shared = { one80: clip('one-eighty'), gs1: clip('game shot 1'), gs2: clip('game shot 2') }
const pack = (extra: Record<string, Clip[]> = {}): ParsedPack => ({
  name: 'en-GB Arthur (Male)',
  lang: 'en-GB',
  total: 10,
  clips: { '180': [shared.one80], gameshot: [shared.gs1, shared.gs2, shared.one80], ...extra },
})
const UPLOAD = { kind: 'upload' } as const
const BIG = 1024 * 1024

describe.skipIf(!process.env.TEST_DATABASE_URL)('voice packs', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('voices_db_test'))
    await db
      .insertInto('user')
      .values([
        { id: 'a', name: 'Anna', email: 'a@example.com', emailVerified: false, image: null },
        { id: 'b', name: 'Ben', email: 'b@example.com', emailVerified: false, image: null },
      ])
      .execute()
  })
  afterAll(async () => {
    await close()
  })
  afterEach(async () => {
    await db.deleteFrom('voice_packs').execute()
    await db.deleteFrom('voice_clips').execute()
  })

  const clipCount = async () => (await db.selectFrom('voice_clips').select('sha256').execute()).length

  it('stores each file once across users', async () => {
    const pa = await importPack(db, 'a', pack(), UPLOAD, BIG)
    const pb = await importPack(db, 'b', pack(), { kind: 'url', url: 'https://autodarts.x10.mx/1_male_eng/' }, BIG)
    expect(pa.id).not.toBe(pb.id)
    expect(await db.selectFrom('voice_packs').select('id').execute()).toHaveLength(2)
    expect(await clipCount()).toBe(3)
    expect(pa).toMatchObject({ name: 'en-GB Arthur (Male)', lang: 'en-GB', clips: 3, bytes: 'one-eightygame shot 1game shot 2'.length })
    expect(await listPacks(db, 'b')).toEqual([pb])
  })

  it('lets a user reach a clip only through their own packs', async () => {
    const pa = await importPack(db, 'a', pack({ busted: [clip('busted')] }), UPLOAD, BIG)
    expect(await packManifest(db, 'a', pa.id)).toEqual({
      id: pa.id,
      name: 'en-GB Arthur (Male)',
      clips: { '180': [sha('one-eighty')], gameshot: [sha('game shot 1'), sha('game shot 2'), sha('one-eighty')], busted: [sha('busted')] },
    })
    expect(await packManifest(db, 'b', pa.id)).toBeNull()
    expect(await clipFor(db, 'b', sha('busted'))).toBeNull()
    expect(await clipFor(db, 'b', sha('one-eighty'))).toBeNull()

    await importPack(db, 'b', pack(), UPLOAD, BIG)
    const got = await clipFor(db, 'b', sha('one-eighty'))
    expect(got && { text: got.bytes.toString(), mime: got.mime }).toEqual({ text: 'one-eighty', mime: 'audio/mpeg' })
    expect(await clipFor(db, 'b', sha('busted'))).toBeNull()
  })

  it('delete keeps clips another pack uses', async () => {
    const pa = await importPack(db, 'a', pack({ busted: [clip('busted')] }), UPLOAD, BIG)
    const pb = await importPack(db, 'b', pack(), UPLOAD, BIG)
    expect(await deletePack(db, 'a', pa.id)).toBe(true)
    expect(await clipCount()).toBe(3)
    const manifest = await packManifest(db, 'b', pb.id)
    for (const hash of Object.values(manifest?.clips ?? {}).flat()) expect(await clipFor(db, 'b', hash)).not.toBeNull()
    expect(await deletePack(db, 'b', pb.id)).toBe(true)
    expect(await clipCount()).toBe(0)
  })

  it("counts every clip of a user's packs at full size", async () => {
    expect(await usage(db, 'a')).toBe(0)
    await importPack(db, 'a', pack(), UPLOAD, BIG)
    const one = 'one-eightygame shot 1game shot 2'.length // the 180 used twice counts once
    expect(await usage(db, 'a')).toBe(one)
    await importPack(db, 'b', pack(), UPLOAD, BIG)
    expect(await usage(db, 'b')).toBe(one) // shared with A, still counted in full
    await importPack(db, 'a', pack(), UPLOAD, BIG)
    expect(await usage(db, 'a')).toBe(2 * one) // each pack counts
  })

  it("does not delete another user's pack", async () => {
    const pa = await importPack(db, 'a', pack(), UPLOAD, BIG)
    expect(await deletePack(db, 'b', pa.id)).toBe(false)
    expect(await deletePack(db, 'b', 'nope')).toBe(false)
    expect(await listPacks(db, 'a')).toHaveLength(1)
    expect(await clipCount()).toBe(3)
  })

  it('sweeps the real orphans when an import maps one of the files again meanwhile', async () => {
    const pa = await importPack(db, 'a', pack({ busted: [clip('busted')] }), UPLOAD, BIG)
    const pb = await importPack(db, 'b', { name: 'B', lang: null, total: 1, clips: { '0': [clip('zero')] } }, UPLOAD, BIG)
    const hashes = (await db.selectFrom('voice_pack_clips').select('clip_sha256').where('pack_id', '=', pa.id).execute()).map(
      r => r.clip_sha256,
    )
    await db.deleteFrom('voice_packs').where('id', '=', pa.id).execute() // A's files are orphans now

    // B's import maps 180 again but hasn't committed: the sweep blocks on that file, then the
    // foreign key refuses its first try once B commits
    const importing = await db.startTransaction().execute()
    await importing
      .insertInto('voice_pack_clips')
      .values({ pack_id: pb.id, key: '180', variant: 0, clip_sha256: sha('one-eighty') })
      .execute()
    const sweeping = db.transaction().execute(trx => sweepOrphanClips(trx, hashes))
    await new Promise(resolve => setTimeout(resolve, 200))
    await importing.commit().execute()
    await sweeping

    const left = (await db.selectFrom('voice_clips').select('sha256').execute()).map(r => r.sha256).sort()
    expect(left).toEqual([sha('one-eighty'), sha('zero')].sort())
  })

  describe('storage limit', () => {
    const small = (s: string): ParsedPack => ({ name: s, lang: null, total: 1, clips: { '180': [clip(s.repeat(100))] } })

    it('refuses an import over the limit with the numbers', async () => {
      await importPack(db, 'a', small('x'), UPLOAD, 1024) // 100 bytes
      await importPack(db, 'a', small('yyyyyyy'), UPLOAD, 1024) // 800 bytes
      const err = await importPack(db, 'a', small('zzz'), UPLOAD, 1024).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(VoiceLimitError)
      expect(err).toMatchObject({
        used: 800,
        limit: 1024,
        needed: 300,
        message: 'Voice storage limit reached: 0.8 of 1 KB used, this pack needs 0.3 KB',
      })
      expect(await listPacks(db, 'a')).toHaveLength(2)
    })

    it('refuses every import when the limit is 0', async () => {
      const err = await importPack(db, 'a', small('x'), UPLOAD, 0).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(VoiceLimitError)
      expect(err).toMatchObject({ message: 'Voice imports are turned off' })
      expect(await clipCount()).toBe(0)
    })
  })
})
