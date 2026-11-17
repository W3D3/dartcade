import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import { insertTournament, insertTournamentEntry, insertUsers } from '../test/fixtures.js'
import { handOverTournamentsOf, withdrawEntriesOf } from './tournamentAccount.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('a deleted account in tournaments', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('tournament_account_test'))
    await insertUsers(db, ['gone', 'mate', 'org', 'co1', 'co2'])
  })
  afterAll(async () => {
    await close()
  })

  const player = (id: string, tournamentId: string, entryId: string, userId: string, position = 0) =>
    db
      .insertInto('tournament_players')
      .values({ id, tournament_id: tournamentId, entry_id: entryId, user_id: userId, name: userId, position })
      .execute()
  const statusOf = async (id: string) =>
    (await db.selectFrom('tournaments').select('status').where('id', '=', id).executeTakeFirst())?.status
  const entryStatus = async (id: string) =>
    (await db.selectFrom('tournament_entries').select('status').where('id', '=', id).executeTakeFirstOrThrow()).status

  it('frees the spot in an open tournament and withdraws a running one, for the service to settle', async () => {
    await insertTournament(db, { id: 'open', status: 'open', max_entries: 2 })
    await insertTournamentEntry(db, { id: 'e-open', tournament_id: 'open', status: 'registered' })
    await player('p-open', 'open', 'e-open', 'gone')
    await insertTournament(db, { id: 'run', status: 'running' })
    await insertTournamentEntry(db, { id: 'e-run', tournament_id: 'run', status: 'checked_in' })
    await player('p-run', 'run', 'e-run', 'gone')
    await insertTournament(db, { id: 'done', status: 'finished' })
    await insertTournamentEntry(db, { id: 'e-done', tournament_id: 'done', status: 'checked_in' })
    await player('p-done', 'done', 'e-done', 'gone')

    const left = await withdrawEntriesOf(db, 'gone')
    expect(left.sort((a, b) => a.entryId.localeCompare(b.entryId))).toEqual([
      { tournamentId: 'open', entryId: 'e-open', running: false },
      { tournamentId: 'run', entryId: 'e-run', running: true },
    ])
    expect(await entryStatus('e-open')).toBe('withdrawn')
    expect(await entryStatus('e-done')).toBe('checked_in')
  })

  it('withdraws a team whose captain or member is deleted, and leaves in-person spots to the organizers', async () => {
    await insertTournament(db, { id: 'team', status: 'open', team_size: 2 })
    await insertTournamentEntry(db, { id: 'e-team', tournament_id: 'team', status: 'registered', registered_by_user_id: 'mate' })
    await player('p-team-a', 'team', 'e-team', 'mate')
    await player('p-team-b', 'team', 'e-team', 'gone', 1)
    await insertTournament(db, { id: 'live', status: 'running', play: 'in_person', preselected: true })
    await insertTournamentEntry(db, { id: 'e-live', tournament_id: 'live', status: 'checked_in' })
    await player('p-live', 'live', 'e-live', 'gone')

    expect(await withdrawEntriesOf(db, 'gone')).toEqual([{ tournamentId: 'team', entryId: 'e-team', running: false }])
    expect(await entryStatus('e-team')).toBe('withdrawn')
    expect(await entryStatus('e-live')).toBe('checked_in')
  })

  it('passes a tournament to its longest co-organizer, and ends one with none', async () => {
    await insertTournament(db, { id: 'owned', status: 'open', owner_user_id: 'org' })
    await db.insertInto('tournament_organizers').values({ tournament_id: 'owned', user_id: 'co2' }).execute()
    await db.insertInto('tournament_organizers').values({ tournament_id: 'owned', user_id: 'co1' }).execute()
    await insertTournament(db, { id: 'alone', status: 'running', owner_user_id: 'org' })
    await insertTournament(db, { id: 'draft', status: 'draft', owner_user_id: 'org' })
    await insertTournament(db, { id: 'over', status: 'finished', owner_user_id: 'org' })

    await handOverTournamentsOf(db, 'org')
    const owned = await db.selectFrom('tournaments').select('owner_user_id').where('id', '=', 'owned').executeTakeFirstOrThrow()
    expect(owned.owner_user_id).toBe('co2')
    const co = await db.selectFrom('tournament_organizers').select('user_id').where('tournament_id', '=', 'owned').execute()
    expect(co.map(c => c.user_id)).toEqual(['co1'])
    expect(await statusOf('alone')).toBe('cancelled')
    expect(await statusOf('draft')).toBeUndefined()
    expect(await statusOf('over')).toBe('finished')
  })
})
