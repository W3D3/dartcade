import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { insertGameSession } from '../db/queries.js'
import { insertTournament, insertTournamentEntry, insertUsers } from '../test/fixtures.js'
import { myTournaments } from './mine.js'

const NOW = new Date('2026-11-12T12:00:00Z')

describe.skipIf(!process.env.TEST_DATABASE_URL)('myTournaments', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  /** `me`'s spot in a tournament: its entry and player. */
  async function spot(
    tournament: string,
    entry: string,
    over: { name?: string; status?: 'pending' | 'registered' | 'withdrawn'; place?: number } = {},
  ) {
    await insertTournamentEntry(db, {
      id: entry,
      tournament_id: tournament,
      name: over.name ?? 'Me',
      status: over.status ?? 'registered',
      final_place: over.place ?? null,
    })
    await db
      .insertInto('tournament_players')
      .values({ id: `p-${entry}`, tournament_id: tournament, entry_id: entry, user_id: 'me', name: over.name ?? 'Me', position: 0 })
      .execute()
  }
  const finishedAt = (id: string, iso: string) =>
    db
      .updateTable('tournaments')
      .set({ status: 'finished', started_at: new Date(iso), ended_at: new Date(iso) })
      .where('id', '=', id)
      .execute()

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('tournaments_mine_test'))
    await insertUsers(db, ['me', 'max', 'boss', 'co'])
  })
  afterAll(async () => close())

  it('is empty for someone with no tournaments', async () => {
    expect(await myTournaments(db, 'max', NOW)).toEqual({
      liveMatch: null,
      playing: [],
      organizing: [],
      past: [],
      season: { label: 'Q4 2026', played: 0, titles: 0, won: 0, lost: 0, average: null, best: null },
    })
  })

  it('lists spots by start, the running match and a team still waiting for a teammate', async () => {
    await insertTournament(db, {
      id: 'sat',
      status: 'open',
      name: 'Doubles Cup',
      team_size: 2,
      starts_at: new Date('2026-11-15T20:00:00Z'),
    })
    await spot('sat', 'e-sat', { name: 'Double Agents', status: 'pending' })
    await db
      .insertInto('tournament_players')
      .values({ id: 'p-lena', tournament_id: 'sat', entry_id: 'e-sat', user_id: null, name: 'Lena', position: 1 })
      .execute()
    await insertTournament(db, {
      id: 'live',
      status: 'running',
      name: 'Living Room',
      owner_user_id: 'boss',
      starts_at: new Date('2026-11-12T11:00:00Z'),
    })
    await spot('live', 'e-live')
    await insertTournamentEntry(db, { id: 'e-max', tournament_id: 'live', name: 'Max' })
    // A quarter-final of a 3-round bracket, its game running
    await db
      .insertInto('tournament_matches')
      .values({
        id: 'm-live',
        tournament_id: 'live',
        bracket: 'main',
        round: 1,
        slot: 0,
        entry_a_id: 'e-live',
        entry_b_id: 'e-max',
        first_to: 3,
        status: 'live',
        ready_at: NOW,
        started_at: NOW,
      })
      .execute()
    await db
      .insertInto('tournament_matches')
      .values({ id: 'm-final', tournament_id: 'live', bracket: 'main', round: 3, slot: 0, first_to: 5 })
      .execute()
    await insertGameSession(db, {
      id: 'g-live',
      owner_user_id: 'me',
      board_db_id: null,
      game_id: 'x01',
      game_version: 1,
      rng_seed: 0,
      config: {},
      players: [{ name: 'Me', user_id: 'me', controller_user_id: 'me', board_db_id: null, bot_level: null }],
    })
    await db.updateTable('game_sessions').set({ tournament_match_id: 'm-live' }).where('id', '=', 'g-live').execute()
    // Withdrawn and cancelled ones are not shown
    await insertTournament(db, { id: 'gone', status: 'open' })
    await spot('gone', 'e-gone', { status: 'withdrawn' })
    await insertTournament(db, { id: 'off', status: 'cancelled' })
    await spot('off', 'e-off')

    const r = await myTournaments(db, 'me', NOW)
    expect(r.playing.map(p => [p.tournament.id, p.entryName, p.waitingFor, p.opponent])).toEqual([
      ['live', 'Me', [], 'Max'],
      ['sat', 'Double Agents', ['Lena'], null],
    ])
    expect(r.liveMatch).toMatchObject({
      tournament: { id: 'live', owner: { id: 'boss' } },
      round: 'Quarter-final',
      opponent: 'Max',
      firstTo: 3,
      sessionId: 'g-live',
    })
    expect(r.past).toEqual([])
  })

  it('has no running match before the game starts', async () => {
    await db.updateTable('game_sessions').set({ status: 'finished' }).where('id', '=', 'g-live').execute()
    expect((await myTournaments(db, 'me', NOW)).liveMatch).toBeNull()
  })

  it('lists what you organize, drafts and in person tournaments with their claimed spots', async () => {
    await insertTournament(db, { id: 'draft', owner_user_id: 'me', name: 'Cracker' })
    await insertTournament(db, { id: 'club', status: 'open', access: 'in_person', owner_user_id: 'me', name: 'Club Night' })
    await insertTournamentEntry(db, { id: 'c1', tournament_id: 'club' })
    await insertTournamentEntry(db, { id: 'c2', tournament_id: 'club' })
    await db
      .insertInto('tournament_players')
      .values([
        { id: 'pc1', tournament_id: 'club', entry_id: 'c1', user_id: 'max', name: 'Max', position: 0 },
        { id: 'pc2', tournament_id: 'club', entry_id: 'c2', user_id: null, name: 'Guest', position: 0 },
      ])
      .execute()
    await insertTournament(db, { id: 'office', status: 'open', owner_user_id: 'boss', name: 'Office Cup' })
    await db.insertInto('tournament_organizers').values({ tournament_id: 'office', user_id: 'me' }).execute()
    await insertTournament(db, { id: 'done', status: 'finished', owner_user_id: 'me' })

    const r = await myTournaments(db, 'me', NOW)
    expect(r.organizing.map(o => [o.tournament.id, o.role, o.claimed])).toEqual(
      expect.arrayContaining([
        ['draft', 'owner', null],
        ['club', 'owner', 1],
        ['office', 'organizer', null],
      ]),
    )
    expect(r.organizing).toHaveLength(3)
  })

  it('sums the finished ones: place, record, average and the quarter', async () => {
    // This quarter: a title (3-0) and a quarter-final exit (1-1); an older one outside it
    await insertTournament(db, { id: 'won', status: 'running', name: 'Classic #3' })
    await spot('won', 'e-won', { place: 1 })
    await insertTournament(db, { id: 'qf', status: 'running', name: 'Weekly #44', kind: 'official' })
    await spot('qf', 'e-qf', { place: 5 })
    await insertTournament(db, { id: 'old', status: 'running', name: 'Summer Open' })
    await spot('old', 'e-old', { place: 2 })
    await finishedAt('won', '2026-10-12T20:00:00Z')
    await finishedAt('qf', '2026-10-26T20:00:00Z')
    await finishedAt('old', '2026-08-01T20:00:00Z')
    let n = 0
    const match = async (tournament: string, me: string, other: string, winner: string, outcome: 'played' | 'bye' = 'played') => {
      await insertTournamentEntry(db, { id: `o-${other}`, tournament_id: tournament, name: other }).catch(() => {})
      await db
        .insertInto('tournament_matches')
        .values({
          id: `m${n}`,
          tournament_id: tournament,
          bracket: 'main',
          round: ++n,
          slot: 0,
          entry_a_id: me,
          entry_b_id: `o-${other}`,
          first_to: 3,
          status: 'finished',
          outcome,
          winner_entry_id: winner === 'me' ? me : `o-${other}`,
          legs_a: 3,
          legs_b: 1,
        })
        .execute()
    }
    await match('won', 'e-won', 'a', 'me')
    await match('won', 'e-won', 'b', 'me')
    await match('won', 'e-won', 'c', 'me')
    await match('qf', 'e-qf', 'd', 'me', 'bye')
    await match('qf', 'e-qf', 'e', 'me')
    await match('qf', 'e-qf', 'f', 'other')
    // 60 over 30 darts and 80 over 90 darts: 75 for the title run; the older tournament's game is out of the quarter
    const played = async (id: string, playerId: string, average: number, darts: number) => {
      await insertGameSession(db, {
        id,
        owner_user_id: 'me',
        board_db_id: null,
        game_id: 'x01',
        game_version: 1,
        rng_seed: 0,
        config: {},
        players: [{ name: 'Me', user_id: 'me', controller_user_id: 'me', board_db_id: null, bot_level: null }],
      })
      await db.updateTable('game_sessions').set({ status: 'finished', finished_at: NOW }).where('id', '=', id).execute()
      await db
        .updateTable('game_players')
        .set({ stats: JSON.stringify({ average, dartsThrown: darts }), tournament_player_id: playerId })
        .where('session_id', '=', id)
        .execute()
    }
    await played('x1', 'p-e-won', 60, 30)
    await played('x2', 'p-e-won', 80, 90)
    await played('x3', 'p-e-qf', 50, 30)
    await played('x4', 'p-e-old', 90, 30)

    const r = await myTournaments(db, 'me', NOW)
    expect(r.past.map(p => [p.tournament.id, p.place, p.won, p.lost, p.average])).toEqual([
      ['qf', 5, 1, 1, 50],
      ['won', 1, 3, 0, 75],
      ['old', 2, 0, 0, 90],
    ])
    expect(r.season).toEqual({
      label: 'Q4 2026',
      played: 2,
      titles: 1,
      won: 4,
      lost: 1,
      average: 70,
      best: { place: 1, tournament: 'Classic #3' },
    })
  })
})
