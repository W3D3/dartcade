import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import { insertTournament, insertTournamentEntry, insertUsers } from '../test/fixtures.js'
import { listPublicTournaments, moveMatch, moveTournament } from './tournaments.js'
import { MATCH_OUTCOMES, MATCH_STATUSES, TOURNAMENT_STATUSES } from '../shared/tournaments/state.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('tournament tables', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let n = 0
  const id = (prefix: string) => `${prefix}${++n}`

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('tournaments_test'))
    await insertUsers(db, ['ann', 'ben'])
  })
  afterAll(async () => close())

  const status = async (t: string) => (await db.selectFrom('tournaments').selectAll().where('id', '=', t).executeTakeFirstOrThrow()).status
  const match = async (m: string) => db.selectFrom('tournament_matches').selectAll().where('id', '=', m).executeTakeFirstOrThrow()

  /** A running tournament with two entries and a pending first-round match between them. */
  async function bracket(): Promise<{ t: string; a: string; b: string; m: string }> {
    const t = id('t')
    const [a, b, m] = [id('e'), id('e'), id('m')]
    await insertTournament(db, { id: t, status: 'running' })
    await insertTournamentEntry(db, { id: a, tournament_id: t })
    await insertTournamentEntry(db, { id: b, tournament_id: t })
    await db
      .insertInto('tournament_matches')
      .values({ id: m, tournament_id: t, bracket: 'main', round: 1, slot: 0, first_to: 3, entry_a_id: a, entry_b_id: b })
      .execute()
    return { t, a, b, m }
  }

  describe('moveTournament', () => {
    it('publishes, starts and finishes a tournament, stamping each step', async () => {
      const t = id('t')
      await insertTournament(db, { id: t })
      expect(await moveTournament(db, t, 'publish')).toBe('open')
      expect(await moveTournament(db, t, 'start')).toBe('running')
      expect(await moveTournament(db, t, 'finish')).toBe('finished')
      const row = await db.selectFrom('tournaments').selectAll().where('id', '=', t).executeTakeFirstOrThrow()
      expect(row.status).toBe('finished')
      expect([row.published_at, row.started_at, row.ended_at].every(d => d instanceof Date)).toBe(true)
    })

    it('refuses finished → running and leaves the row alone', async () => {
      const t = id('t')
      await insertTournament(db, { id: t, status: 'finished' })
      expect(await moveTournament(db, t, 'start')).toBeNull()
      expect(await status(t)).toBe('finished')
    })

    it('returns null for a tournament that does not exist', async () => {
      expect(await moveTournament(db, 'nope', 'publish')).toBeNull()
    })

    it('lets only one of two racing starts through', async () => {
      const t = id('t')
      await insertTournament(db, { id: t, status: 'open' })
      const results = await Promise.all([moveTournament(db, t, 'start'), moveTournament(db, t, 'start')])
      expect(results.filter(r => r === 'running')).toHaveLength(1)
      expect(await status(t)).toBe('running')
    })
  })

  describe('moveMatch', () => {
    it('seats, starts and finishes a played match with its result', async () => {
      const { m, b } = await bracket()
      expect(await moveMatch(db, m, { event: 'seat' })).toBe('ready')
      expect(await moveMatch(db, m, { event: 'start' })).toBe('live')
      expect(await moveMatch(db, m, { event: 'finish', winnerEntryId: b, legsA: 1, legsB: 3 })).toBe('finished')
      expect(await match(m)).toMatchObject({ status: 'finished', outcome: 'played', winner_entry_id: b, legs_a: 1, legs_b: 3 })
    })

    it('puts an aborted game back to ready', async () => {
      const { m } = await bracket()
      await moveMatch(db, m, { event: 'seat' })
      await moveMatch(db, m, { event: 'start' })
      expect(await moveMatch(db, m, { event: 'abort' })).toBe('ready')
      expect(await match(m)).toMatchObject({ status: 'ready', started_at: null })
    })

    it('refuses to start a finished match', async () => {
      const { m, a } = await bracket()
      await moveMatch(db, m, { event: 'seat' })
      await moveMatch(db, m, { event: 'walkover', winnerEntryId: a, legsA: 0, legsB: 0 })
      expect(await moveMatch(db, m, { event: 'start' })).toBeNull()
      expect(await match(m)).toMatchObject({ status: 'finished', outcome: 'walkover' })
    })

    it('refuses to seat a match whose sides are not both known', async () => {
      const { m } = await bracket()
      await db.updateTable('tournament_matches').set({ entry_b_id: null }).where('id', '=', m).execute()
      await expect(moveMatch(db, m, { event: 'seat' })).rejects.toThrow(/check/)
    })

    it('refuses a winner who is not in the match', async () => {
      const { m, t } = await bracket()
      const other = id('e')
      await insertTournamentEntry(db, { id: other, tournament_id: t })
      await moveMatch(db, m, { event: 'seat' })
      await expect(moveMatch(db, m, { event: 'set_result', winnerEntryId: other, legsA: 3, legsB: 0 })).rejects.toThrow(/check/)
    })
  })

  describe('constraints', () => {
    it('accepts every status and outcome the state tables know', async () => {
      for (const s of TOURNAMENT_STATUSES) await insertTournament(db, { id: id('t'), status: s })
      const { m } = await bracket()
      for (const s of MATCH_STATUSES.filter(s => s !== 'finished'))
        await db.updateTable('tournament_matches').set({ status: s }).where('id', '=', m).execute()
      for (const outcome of MATCH_OUTCOMES)
        await db.updateTable('tournament_matches').set({ status: 'finished', outcome }).where('id', '=', m).execute()
    })

    it('keeps a finished match and its outcome together', async () => {
      const { m } = await bracket()
      await expect(db.updateTable('tournament_matches').set({ status: 'finished' }).where('id', '=', m).execute()).rejects.toThrow()
    })

    it('holds one bracket slot per match, also in groups', async () => {
      const { t } = await bracket()
      const row = { tournament_id: t, bracket: 'group' as const, group_no: 1, round: 1, slot: 0, first_to: 2 }
      await db
        .insertInto('tournament_matches')
        .values({ id: id('m'), ...row })
        .execute()
      await expect(
        db
          .insertInto('tournament_matches')
          .values({ id: id('m'), ...row })
          .execute(),
      ).rejects.toThrow(/unique/)
      await expect(
        db
          .insertInto('tournament_matches')
          .values({ id: id('m'), ...row, slot: 1 })
          .execute(),
      ).resolves.toBeDefined()
      await expect(
        db
          .insertInto('tournament_matches')
          .values({ id: id('m'), ...row, bracket: 'main', group_no: null })
          .execute(),
      ).rejects.toThrow(/unique/)
    })

    it('gives a person one spot per tournament, and keeps a player in an entry of the same tournament', async () => {
      const { t, a, b } = await bracket()
      const player = { tournament_id: t, user_id: 'ann', name: 'Ann', position: 0 }
      await db
        .insertInto('tournament_players')
        .values({ id: id('p'), entry_id: a, ...player })
        .execute()
      await expect(
        db
          .insertInto('tournament_players')
          .values({ id: id('p'), entry_id: b, ...player })
          .execute(),
      ).rejects.toThrow(/unique/)
      // Guests (no account) are not limited
      await db
        .insertInto('tournament_players')
        .values({ id: id('p'), entry_id: b, ...player, user_id: null, name: 'G1' })
        .execute()
      await db
        .insertInto('tournament_players')
        .values({ id: id('p'), entry_id: b, ...player, user_id: null, name: 'G2', position: 1 })
        .execute()

      const elsewhere = id('t')
      await insertTournament(db, { id: elsewhere })
      await expect(
        db
          .insertInto('tournament_players')
          .values({ id: id('p'), entry_id: a, ...player, tournament_id: elsewhere, user_id: 'ben', position: 5 })
          .execute(),
      ).rejects.toThrow(/foreign key/)
    })

    it('turns a deleted account into a guest spot under its stored name', async () => {
      const { t, a } = await bracket()
      await insertUsers(db, ['gone'])
      const p = id('p')
      await db
        .insertInto('tournament_players')
        .values({ id: p, tournament_id: t, entry_id: a, user_id: 'gone', name: 'Gone', position: 0 })
        .execute()
      await db.deleteFrom('user').where('id', '=', 'gone').execute()
      expect(await db.selectFrom('tournament_players').select(['user_id', 'name']).where('id', '=', p).executeTakeFirst()).toEqual({
        user_id: null,
        name: 'Gone',
      })
    })

    it('links a game to its match and seat, and keeps the game when the tournament goes', async () => {
      const { t, a, m } = await bracket()
      const p = id('p')
      await db
        .insertInto('tournament_players')
        .values({ id: p, tournament_id: t, entry_id: a, user_id: null, name: 'G', position: 0 })
        .execute()
      const g = id('g')
      await db
        .insertInto('game_sessions')
        .values({ id: g, owner_user_id: null, board_db_id: null, game_id: 'x01', config: '{}', status: 'active', tournament_match_id: m })
        .execute()
      await db
        .insertInto('game_players')
        .values({
          session_id: g,
          seat: 0,
          name: 'G',
          user_id: null,
          placement: null,
          stats: null,
          throw_position: null,
          controller_user_id: null,
          board_db_id: null,
          bot_level: null,
          tournament_player_id: p,
        })
        .execute()
      await db.deleteFrom('tournaments').where('id', '=', t).execute()
      expect(await db.selectFrom('game_sessions').select('tournament_match_id').where('id', '=', g).executeTakeFirst()).toEqual({
        tournament_match_id: null,
      })
      expect(await db.selectFrom('game_players').select('tournament_player_id').where('session_id', '=', g).executeTakeFirst()).toEqual({
        tournament_player_id: null,
      })
    })
  })

  describe('listPublicTournaments', () => {
    it('lists published public tournaments not yet over, soonest first, with their entries', async () => {
      await db.deleteFrom('tournaments').execute()
      const at = (d: number) => new Date(Date.UTC(2026, 10, d, 19))
      await insertTournament(db, { id: 'later', status: 'open', starts_at: at(20) })
      await insertTournament(db, { id: 'soon', status: 'check_in', starts_at: at(16) })
      await insertTournament(db, { id: 'whenever', status: 'open', starts_at: null })
      await insertTournament(db, { id: 'live', status: 'running', starts_at: at(10) })
      await insertTournament(db, { id: 'draft', status: 'draft', starts_at: at(12) })
      await insertTournament(db, { id: 'done', status: 'finished', starts_at: at(1) })
      await insertTournament(db, { id: 'called-off', status: 'cancelled', starts_at: at(2) })
      await insertTournament(db, { id: 'friends', status: 'open', access: 'friends', starts_at: at(3) })
      await insertTournamentEntry(db, { id: 's1', tournament_id: 'soon' })
      await insertTournamentEntry(db, { id: 's2', tournament_id: 'soon' })
      await insertTournamentEntry(db, { id: 's3', tournament_id: 'soon', status: 'withdrawn' })

      const rows = await listPublicTournaments(db)
      expect(rows.map(r => [r.id, r.entries])).toEqual([
        ['live', 0],
        ['soon', 2],
        ['later', 0],
        ['whenever', 0],
      ])
    })
  })
})
