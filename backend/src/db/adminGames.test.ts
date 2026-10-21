import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, type Kysely } from 'kysely'
import { createDb } from './index.js'
import { runMigrations, insertGameSession, finishGameSession, abortGameSession } from './queries.js'
import { getInvalidation, invalidateGame, listAllGames, restoreGame, type AdminGameFilter } from './adminGames.js'
import { getFinishedGame, getStatRows, getViewableGame, listFinishedGames } from './history.js'
import { getRatings, onlineAverage, ratingChangeSince, recentRanked, recordRankedResult } from './ranked.js'
import type { Database } from './schema.js'

const url = process.env.TEST_DATABASE_URL ?? ''
const SCHEMA = 'admin_games_test'

describe.skipIf(!process.env.TEST_DATABASE_URL)('admin game queries', () => {
  let admin: Kysely<Database>
  let db: Kysely<Database>
  const t = (min: number) => new Date(Date.UTC(2026, 9, 1, 10, min))

  async function game(
    id: string,
    mode: string,
    names: [string, string | null][],
    state: 'finished' | 'aborted' | 'active',
    startMin: number,
  ) {
    await insertGameSession(db, {
      id,
      owner_user_id: 'u1',
      board_db_id: null,
      game_id: mode,
      game_version: 1,
      rng_seed: 0,
      config: {},
      players: names.map(([name, user_id]) => ({ name, user_id, controller_user_id: 'u1', board_db_id: null, bot_level: null })),
    })
    await sql`UPDATE game_sessions SET created_at = ${t(startMin)} WHERE id = ${id}`.execute(db)
    if (state === 'aborted') await abortGameSession(db, id, t(startMin + 1))
    if (state === 'finished') {
      await finishGameSession(
        db,
        id,
        t(startMin + 5),
        names.map((_, i) => ({ placement: i + 1, stats: {}, throwPosition: i, forfeited: false })),
      )
    }
  }
  const ids = (r: { games: { id: string }[] }) => r.games.map(g => g.id)

  beforeAll(async () => {
    admin = createDb(url)
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).execute(admin)
    await sql.raw(`CREATE SCHEMA ${SCHEMA}`).execute(admin)
    db = createDb(`${url}${url.includes('?') ? '&' : '?'}options=-c%20search_path%3D${SCHEMA}`)
    await runMigrations(db)
    await db
      .insertInto('user')
      .values([
        { id: 'u1', name: 'Ann', email: 'ann@example.com', emailVerified: true, image: null, role: null },
        { id: 'u2', name: 'Bob', email: 'bob@example.com', emailVerified: true, image: null, role: null },
      ])
      .execute()
    await game(
      'g1',
      'x01',
      [
        ['Ann', 'u1'],
        ['Bob', 'u2'],
      ],
      'finished',
      0,
    )
    await game('g2', 'atc', [['Bob', 'u2']], 'finished', 10)
    await game(
      'g3',
      'x01',
      [
        ['Ann', 'u1'],
        ['Guest 100%', null],
      ],
      'aborted',
      20,
    )
    await game('g4', 'x01', [['Ann', 'u1']], 'active', 30)
    await db
      .insertInto('ranked_results')
      .values({
        session_id: 'g1',
        user_id: 'u1',
        mode: '1v1',
        won: true,
        placement: false,
        rating_before: 1200,
        rating_after: 1220,
        average: 50,
      })
      .execute()
  })
  afterAll(async () => {
    await db.destroy()
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).execute(admin)
    await admin.destroy()
  })

  it('lists finished games of everyone by default, newest started first, with all seats', async () => {
    const r = await listAllGames(db, { status: 'finished' }, { limit: 25, after: null })
    expect(ids(r)).toEqual(['g2', 'g1'])
    expect(r.games[1]?.seats.map(s => [s.name, s.user_id, s.placement])).toEqual([
      ['Ann', 'u1', 1],
      ['Bob', 'u2', 2],
    ])
    expect(r.games[1]).toMatchObject({ status: 'finished', ranked: true })
    expect(r.games[0]).toMatchObject({ ranked: false })
  })

  it('shows aborted and active games on request, with no result on their seats', async () => {
    expect(ids(await listAllGames(db, { status: 'aborted' }, { limit: 25, after: null }))).toEqual(['g3'])
    const all = await listAllGames(db, { status: 'all' }, { limit: 25, after: null })
    expect(ids(all)).toEqual(['g4', 'g3', 'g2', 'g1'])
    expect(all.games[0]).toMatchObject({ status: 'active', finished_at: null })
    expect(all.games[1]?.seats.every(s => s.placement === null)).toBe(true)
  })

  it('filters by mode, player (name or account id, wildcards literal), ranked and start time', async () => {
    const q = (f: Partial<AdminGameFilter>) => listAllGames(db, { status: 'all', ...f }, { limit: 25, after: null }).then(ids)
    expect(await q({ mode: 'atc' })).toEqual(['g2'])
    expect(await q({ player: 'ann' })).toEqual(['g4', 'g3', 'g1'])
    expect(await q({ player: 'u2' })).toEqual(['g2', 'g1'])
    expect(await q({ player: '100%' })).toEqual(['g3'])
    expect(await q({ player: '%' })).toEqual(['g3'])
    expect(await q({ ranked: true })).toEqual(['g1'])
    expect(await q({ from: t(10), to: t(30) })).toEqual(['g3', 'g2'])
  })

  it('pages with a cursor', async () => {
    const first = await listAllGames(db, { status: 'all' }, { limit: 3, after: null })
    expect(ids(first)).toEqual(['g4', 'g3', 'g2'])
    expect(first.next).not.toBeNull()
    const second = await listAllGames(db, { status: 'all' }, { limit: 3, after: first.next })
    expect(ids(second)).toEqual(['g1'])
    expect(second.next).toBeNull()
  })

  describe('invalidateGame', () => {
    const duel = (winner: string, loser: string) =>
      [
        { won: true, players: [{ userId: winner, average: 60 }] },
        { won: false, players: [{ userId: loser, average: 40 }] },
      ] as [
        { won: boolean; players: { userId: string; average: number }[] },
        { won: boolean; players: { userId: string; average: number }[] },
      ]
    const page = { limit: 25, after: null }

    beforeAll(async () => {
      await db
        .insertInto('user')
        .values([
          { id: 'u3', name: 'Cy', email: 'cy@example.com', emailVerified: true, image: null, role: null },
          { id: 'u4', name: 'Di', email: 'di@example.com', emailVerified: true, image: null, role: null },
        ])
        .execute()
      for (const [id, min] of [
        ['r1', 100],
        ['r2', 110],
      ] as const) {
        await game(
          id,
          'x01',
          [
            ['Cy', 'u3'],
            ['Di', 'u4'],
          ],
          'finished',
          min,
        )
      }
      await recordRankedResult(db, { sessionId: 'r1', mode: '1v1', at: t(105), sides: duel('u4', 'u3') })
      await recordRankedResult(db, { sessionId: 'r2', mode: '1v1', at: t(115), sides: duel('u3', 'u4') })
    })

    it('counts the game for its players until it is invalidated', async () => {
      expect((await listFinishedGames(db, 'u3', page)).games.map(g => g.id)).toEqual(['r2', 'r1'])
      expect(await getStatRows(db, 'u3', t(0))).toHaveLength(2)
      expect((await getRatings(db, 'u3'))['1v1'].matches).toBe(2)
      expect(await recentRanked(db, 'u3')).toHaveLength(2)
    })

    it('keeps the game, takes it out of history, stats and ratings, and writes an audit row with the reason', async () => {
      const before = (await getRatings(db, 'u3'))['1v1']
      expect(await invalidateGame(db, 'r1', 'u4', 'Board was misreading')).toEqual({ recalculated: ['1v1'] })

      expect(await db.selectFrom('game_sessions').select('id').where('id', '=', 'r1').execute()).toHaveLength(1)
      expect(await db.selectFrom('game_players').select('seat').where('session_id', '=', 'r1').execute()).toHaveLength(2)

      // Gone for the players
      expect((await listFinishedGames(db, 'u3', page)).games.map(g => g.id)).toEqual(['r2'])
      expect(await getStatRows(db, 'u3', t(0))).toHaveLength(1)
      expect(await getViewableGame(db, 'r1', 'u3')).toBeUndefined()
      expect(await recentRanked(db, 'u3')).toHaveLength(1)
      expect(await onlineAverage(db, 'u3')).toBe(60)
      expect(await ratingChangeSince(db, 'u3', t(0))).toEqual({ '1v1': 0, '2v2': 0 })

      // Still there for moderators
      expect(await getFinishedGame(db, 'r1')).toMatchObject({ id: 'r1' })

      // Ratings replayed as if it never happened
      const after = (await getRatings(db, 'u3'))['1v1']
      expect(after).toMatchObject({ matches: 1, wins: 1, streak: 1 })
      expect(after.rating).toBeGreaterThan(before.rating)

      const [audit] = await db.selectFrom('admin_audit').selectAll().where('target', '=', 'r1').execute()
      expect(audit).toMatchObject({ admin_user_id: 'u4', action: 'game.invalidate' })
      expect(audit.detail).toMatchObject({ mode: 'x01', reason: 'Board was misreading', recalculated: ['1v1'] })
    })

    it('says who invalidated it, when and why, in the list and for the game itself', async () => {
      const listed = await listAllGames(db, { status: 'finished' }, { limit: 25, after: null })
      const r1 = listed.games.find(g => g.id === 'r1')
      expect(r1?.invalidated).toMatchObject({ by: { id: 'u4', name: 'Di' }, reason: 'Board was misreading' })
      expect(r1?.invalidated?.at).toBeInstanceOf(Date)
      expect(r1?.ranked).toBe(true)
      expect(listed.games.find(g => g.id === 'r2')?.invalidated).toBeNull()
      expect(await getInvalidation(db, 'r1')).toMatchObject({ reason: 'Board was misreading' })
      expect(await getInvalidation(db, 'r2')).toBeNull()
    })

    it('lists only the invalidated games with the invalidated status', async () => {
      expect(ids(await listAllGames(db, { status: 'invalidated' }, { limit: 25, after: null }))).toEqual(['r1'])
    })

    it('takes no reason', async () => {
      expect(await invalidateGame(db, 'r2', 'u3', null)).toEqual({ recalculated: ['1v1'] })
      expect(await getInvalidation(db, 'r2')).toMatchObject({ by: { id: 'u3', name: 'Cy' }, reason: null })
      // Nobody has a rated game left: they are seeded afresh by the next one
      expect((await getRatings(db, 'u3'))['1v1'].matches).toBe(0)
    })

    it('refuses what is not finished, or already invalidated, and an unknown game', async () => {
      expect(await invalidateGame(db, 'g3', 'u1', null)).toBe('not-finished')
      expect(await invalidateGame(db, 'g4', 'u1', null)).toBe('not-finished')
      expect(await invalidateGame(db, 'r1', 'u1', null)).toBe('already-invalidated')
      expect(await invalidateGame(db, 'nope', 'u1', null)).toBe('not-found')
      expect(await db.selectFrom('game_sessions').select('invalidated_at').where('id', '=', 'g4').executeTakeFirst()).toEqual({
        invalidated_at: null,
      })
    })
  })
  describe('restoreGame', () => {
    const duel = (winner: string, loser: string) =>
      [
        { won: true, players: [{ userId: winner, average: 60 }] },
        { won: false, players: [{ userId: loser, average: 40 }] },
      ] as [
        { won: boolean; players: { userId: string; average: number }[] },
        { won: boolean; players: { userId: string; average: number }[] },
      ]
    const page = { limit: 25, after: null }
    const pair = ['u5', 'u6', 'u7', 'u8']

    beforeAll(async () => {
      await db
        .insertInto('user')
        .values(pair.map(id => ({ id, name: id.toUpperCase(), email: `${id}@example.com`, emailVerified: true, image: null, role: null })))
        .execute()
      const seats = (a: string, b: string): [string, string | null][] => [
        [a.toUpperCase(), a],
        [b.toUpperCase(), b],
      ]
      await game('s1', 'x01', seats('u5', 'u6'), 'finished', 200)
      await game('s2', 'x01', seats('u5', 'u6'), 'finished', 210)
      await game('s3', 'x01', seats('u5', 'u6'), 'finished', 220)
      await recordRankedResult(db, { sessionId: 's1', mode: '1v1', at: t(205), sides: duel('u5', 'u6') })
      await recordRankedResult(db, { sessionId: 's2', mode: '1v1', at: t(215), sides: duel('u6', 'u5') })
      await recordRankedResult(db, { sessionId: 's3', mode: '1v1', at: t(225), sides: duel('u5', 'u6') })
      await game('o1', 'x01', seats('u7', 'u8'), 'finished', 300)
      await recordRankedResult(db, { sessionId: 'o1', mode: '1v1', at: t(305), sides: duel('u7', 'u8') })
    })

    it('puts a game from the middle back where it was played: the ratings come out as before', async () => {
      const before = [await getRatings(db, 'u5'), await getRatings(db, 'u6')]
      await invalidateGame(db, 's2', 'u1', 'Board was misreading')
      expect((await getRatings(db, 'u5'))['1v1'].matches).toBe(2)
      expect((await listFinishedGames(db, 'u5', page)).games.map(g => g.id)).toEqual(['s3', 's1'])

      expect(await restoreGame(db, 's2', 'u2')).toEqual({ recalculated: ['1v1'] })

      expect([await getRatings(db, 'u5'), await getRatings(db, 'u6')]).toEqual(before)
      expect((await listFinishedGames(db, 'u5', page)).games.map(g => g.id)).toEqual(['s3', 's2', 's1'])
      expect(await getViewableGame(db, 's2', 'u5')).toMatchObject({ id: 's2' })
      expect(await getInvalidation(db, 's2')).toBeNull()
      expect(await recentRanked(db, 'u5')).toHaveLength(3)
      const audit = await db.selectFrom('admin_audit').selectAll().where('target', '=', 's2').orderBy('id').execute()
      expect(audit.map(a => [a.action, a.admin_user_id])).toEqual([
        ['game.invalidate', 'u1'],
        ['game.restore', 'u2'],
      ])
      expect(audit[1]?.detail).toMatchObject({
        mode: 'x01',
        recalculated: ['1v1'],
        wasInvalidatedBy: 'u1',
        wasInvalidatedFor: 'Board was misreading',
      })
    })

    it('gives a player their rating back when the restored game was their only one', async () => {
      const rows = () => db.selectFrom('ranked_ratings').selectAll().where('user_id', 'in', ['u7', 'u8']).execute()
      const before = await rows()
      expect(before).toHaveLength(2)

      await invalidateGame(db, 'o1', 'u1', null)
      expect(await rows()).toEqual([])

      await restoreGame(db, 'o1', 'u1')
      const after = await rows()
      expect(after.map(r => [r.user_id, r.rating, r.matches, r.wins]).sort()).toEqual(
        before.map(r => [r.user_id, r.rating, r.matches, r.wins]).sort(),
      )
    })

    it('refuses a game that is not invalidated, and an unknown one', async () => {
      expect(await restoreGame(db, 's1', 'u1')).toBe('not-invalidated')
      expect(await restoreGame(db, 'nope', 'u1')).toBe('not-found')
    })

    it('can be invalidated again after a restore', async () => {
      expect(await invalidateGame(db, 's2', 'u1', null)).toEqual({ recalculated: ['1v1'] })
      expect(await restoreGame(db, 's2', 'u1')).toEqual({ recalculated: ['1v1'] })
    })
  })
})
