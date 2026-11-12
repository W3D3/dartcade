import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import { x01Forms } from './ranked.js'
import { dropIneligibleEntries } from './tournaments.js'
import { insertTournament, insertTournamentEntry, insertUsers } from '../test/fixtures.js'
import type { AvgLimit } from '../shared/tournaments/avgLimit.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('average limit queries', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let n = 0
  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000)

  /** A finished X01 game: each seat its player, 3-dart average, darts and legs won. */
  async function x01(seats: [string | null, number, number, number][], opts: { teams?: number[]; at?: Date } = {}) {
    const id = `g${++n}`
    const config = opts.teams ? { format: 'teams', teams: opts.teams } : {}
    await db
      .insertInto('game_sessions')
      .values({
        id,
        owner_user_id: null,
        board_db_id: null,
        game_id: 'x01',
        config: JSON.stringify(config),
        status: 'finished',
        finished_at: opts.at ?? daysAgo(1),
      })
      .execute()
    await db
      .insertInto('game_players')
      .values(
        seats.map(([user, average, darts, legsWon], seat) => ({
          session_id: id,
          seat,
          name: user ?? 'Guest',
          user_id: user,
          placement: 1,
          stats: JSON.stringify({ average, dartsThrown: darts, legsWon }),
          controller_user_id: user,
          board_db_id: null,
        })),
      )
      .execute()
  }

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('tournament_eligibility_test'))
    await insertUsers(db, ['ann', 'bob', 'cat', 'dan', 'eve'])
    // Ann: 3–1 against Bob, then a 2–0 against a guest; Bob's 30-day average is his only game's
    await x01([
      ['ann', 60, 90, 3],
      ['bob', 40, 90, 1],
    ])
    await x01([
      ['ann', 80, 30, 2],
      [null, 30, 30, 0],
    ])
    // Too old to count
    await x01([['ann', 20, 300, 5]], { at: daysAgo(31) })
    // Cat and Dan against Eve and Ann in teams: 2–1, each team's legs counted once
    await x01(
      [
        ['cat', 50, 30, 2],
        ['eve', 70, 30, 1],
        ['dan', 52, 30, 2],
        ['ann', 70, 30, 1],
      ],
      { teams: [0, 1, 0, 1] },
    )
  })
  afterAll(async () => close())

  it('x01Forms: the dart-weighted 30-day average and the legs of those games', async () => {
    const forms = await x01Forms(db, ['ann', 'bob', 'cat', 'eve', 'nobody'], 30)
    // Ann: (60·90 + 80·30 + 70·30) / 150 = 66; legs 4 + 2 + 3
    expect(forms.get('ann')).toEqual({ average: 66, legs: 9 })
    expect(forms.get('bob')).toEqual({ average: 40, legs: 4 })
    expect(forms.get('cat')).toEqual({ average: 50, legs: 3 })
    expect(forms.get('nobody')).toEqual({ average: null, legs: 0 })
  })

  async function tournament(id: string, limit: AvgLimit) {
    await insertTournament(db, { id, status: 'check_in' })
    await db
      .updateTable('tournaments')
      .set(eb => ({ settings: eb.fn('jsonb_set', [eb.ref('settings'), eb.val('{avgLimit}'), eb.val(JSON.stringify(limit))]) }))
      .where('id', '=', id)
      .execute()
    for (const user of ['ann', 'bob']) {
      await insertTournamentEntry(db, { id: `${id}-${user}`, tournament_id: id })
      await db
        .insertInto('tournament_players')
        .values({ id: `${id}-${user}-p`, tournament_id: id, entry_id: `${id}-${user}`, user_id: user, name: user, position: 0 })
        .execute()
    }
  }
  const statuses = async (id: string) =>
    Object.fromEntries(
      (await db.selectFrom('tournament_entries').select(['id', 'status']).where('tournament_id', '=', id).execute()).map(e => [
        e.id,
        e.status,
      ]),
    )

  it('dropIneligibleEntries: at check-in an unlocked limit withdraws who moved out of range', async () => {
    await tournament('unlocked', { min: 50, max: null, teams: 'every', minLegs: 0, lock: false })
    expect(await dropIneligibleEntries(db, 'unlocked')).toEqual([
      { userId: 'bob', eligibility: { eligible: false, reason: 'below', average: 40 } },
    ])
    expect(await statuses('unlocked')).toEqual({ 'unlocked-ann': 'registered', 'unlocked-bob': 'withdrawn' })
  })

  it('dropIneligibleEntries: a locked limit keeps every spot', async () => {
    await tournament('locked', { min: 50, max: null, teams: 'every', minLegs: 0, lock: true })
    expect(await dropIneligibleEntries(db, 'locked')).toEqual([])
    expect(await statuses('locked')).toEqual({ 'locked-ann': 'registered', 'locked-bob': 'registered' })
  })

  it('dropIneligibleEntries: too few legs drops a spot too', async () => {
    await tournament('legs', { min: null, max: 100, teams: 'every', minLegs: 5, lock: false })
    expect(await dropIneligibleEntries(db, 'legs')).toEqual([
      { userId: 'bob', eligibility: { eligible: false, reason: 'few_legs', average: null } },
    ])
  })
})
