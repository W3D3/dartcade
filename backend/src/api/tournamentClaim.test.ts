import '../test/authByHeader.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { listFinishedGames } from '../db/history.js'
import type { components } from '../schema/api.js'
import { insertTournament, insertUsers } from '../test/fixtures.js'
import { setupFlags } from '../flags/index.js'
import { createFastify } from './fastify.js'
import { tournamentsApiPlugin } from './tournaments.js'

type Participants = components['schemas']['TournamentParticipants']
type Claim = components['schemas']['TournamentClaim']

const SETTINGS = JSON.stringify({
  seeding: 'random',
  firstTo: 3,
  longerFinal: null,
  groups: null,
  registrationClosesMinutes: null,
  checkInMinutes: null,
  plannedFor: null,
  manualScoring: true,
  noShowMinutes: null,
  avgLimit: null,
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('claiming a tournament spot', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  const counted: string[][] = []

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('tournament_claim_api_test'))
    await insertUsers(db, [
      { id: 'admin', role: 'admin' },
      { id: 'anna', name: 'anna.b', role: 'admin' },
      { id: 'ben', name: 'ben', role: 'admin' },
    ])
    await setupFlags(new Set())
    for (const id of ['club', 'other', 'draft'])
      await insertTournament(db, {
        id,
        owner_user_id: 'admin',
        access: 'in_person',
        status: id === 'draft' ? 'draft' : 'open',
        settings: SETTINGS,
        game_config: JSON.stringify({ startScore: 501 }),
      })
  })
  afterAll(async () => close())

  const send = (user: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) => {
    const app = createFastify()
    app.register(tournamentsApiPlugin, {
      db,
      hub: { sendTournamentRequest: () => {} },
      lobbies: { pushMe: () => Promise.resolve() },
      tournaments: { organizerStart: () => Promise.resolve('started' as const), withdrawn: () => Promise.resolve() },
      countGames: ids => {
        counted.push(ids)
        return Promise.resolve()
      },
    })
    return app.inject({ method, url, payload, headers: { 'x-user': user } })
  }
  const fill = async (id: string, ...names: string[]) =>
    (
      await send('admin', 'PUT', `/api/tournaments/${id}/participants`, {
        entries: names.map(name => ({ name, tag: null, color: null, players: [{ name }] })),
      })
    ).json<Participants>()
  const codeOf = (p: Participants, name: string) => p.entries.flatMap(e => e.players).find(s => s.name === name)!
  const history = async (userId: string) => (await listFinishedGames(db, userId, { limit: 10, after: null })).games.map(g => g.id)

  async function playedFor(spotId: string, gameId: string) {
    await db
      .insertInto('game_sessions')
      .values({ id: gameId, game_id: 'x01', config: '{}', status: 'finished', finished_at: new Date() })
      .execute()
    await db
      .insertInto('game_players')
      .values({ session_id: gameId, seat: 0, name: 'Chris', user_id: null, placement: 1, stats: '{}', tournament_player_id: spotId })
      .execute()
    await db.insertInto('game_details').values({ session_id: gameId, version: 'v', detail: '{}', stats: '{}' }).execute()
  }

  it('claims a spot: its games move to the account, are counted, and the stored detail is dropped', async () => {
    const club = await fill('club', 'Chris', 'Dora')
    const chris = codeOf(club, 'Chris')
    await playedFor(chris.id, 'g1')
    expect(await history('anna')).toEqual([])

    const page = await send('anna', 'GET', `/api/tournaments/claim/${chris.claimCode}`)
    expect(page.json<Claim>()).toMatchObject({ spotName: 'Chris', tournamentName: 'club cup', claimable: true, claimedByMe: false })

    const res = await send('anna', 'POST', `/api/tournaments/claim/${chris.claimCode}`)
    expect(res.statusCode).toBe(200)
    expect(res.json<Claim>()).toMatchObject({ claimable: false, claimedByMe: true })
    expect(await history('anna')).toEqual(['g1'])
    expect(counted).toEqual([['g1']])
    expect(await db.selectFrom('game_details').select('session_id').where('session_id', '=', 'g1').execute()).toEqual([])
    const organizer = await send('admin', 'GET', '/api/tournaments/club/participants')
    expect(codeOf(organizer.json<Participants>(), 'Chris').claimedBy).toEqual({ id: 'anna', name: 'anna.b' })

    // Claiming a spot you hold again hands nothing over twice
    await send('anna', 'POST', `/api/tournaments/claim/${chris.claimCode}`)
    expect(counted).toEqual([['g1'], []])
  })

  it('refuses a claimed spot, a second spot in the same tournament and a draft', async () => {
    const club = (await send('admin', 'GET', '/api/tournaments/club/participants')).json<Participants>()
    expect((await send('ben', 'POST', `/api/tournaments/claim/${codeOf(club, 'Chris').claimCode}`)).statusCode).toBe(409)
    const dora = codeOf(club, 'Dora')
    const second = await send('anna', 'POST', `/api/tournaments/claim/${dora.claimCode}`)
    expect(second.statusCode).toBe(409)
    expect(second.json<{ error: string }>().error).toBe('already has a spot')
    expect((await send('anna', 'GET', `/api/tournaments/claim/${dora.claimCode}`)).json<Claim>().claimable).toBe(false)

    const draft = await fill('draft', 'Eve')
    expect((await send('ben', 'POST', `/api/tournaments/claim/${codeOf(draft, 'Eve').claimCode}`)).statusCode).toBe(404)
    // The same person may hold a spot in another tournament
    const other = await fill('other', 'Chris')
    expect((await send('anna', 'POST', `/api/tournaments/claim/${codeOf(other, 'Chris').claimCode}`)).statusCode).toBe(200)
  })

  it('a reissued link kills the old one, and a claimed spot cannot be reissued', async () => {
    const club = (await send('admin', 'GET', '/api/tournaments/club/participants')).json<Participants>()
    const dora = codeOf(club, 'Dora')
    const res = await send('admin', 'POST', `/api/tournaments/club/participants/${dora.id}/reissue`)
    const fresh = codeOf(res.json<Participants>(), 'Dora').claimCode
    expect(fresh).not.toBe(dora.claimCode)
    expect((await send('ben', 'GET', `/api/tournaments/claim/${dora.claimCode}`)).statusCode).toBe(404)
    expect((await send('ben', 'POST', `/api/tournaments/claim/${fresh}`)).statusCode).toBe(200)
    expect((await send('admin', 'POST', `/api/tournaments/club/participants/${dora.id}/reissue`)).statusCode).toBe(409)
    expect((await send('anna', 'POST', `/api/tournaments/club/participants/${dora.id}/reissue`)).statusCode).toBe(403)
  })

  it('unlinking takes the games out of history and stats again', async () => {
    const club = (await send('admin', 'GET', '/api/tournaments/club/participants')).json<Participants>()
    const chris = codeOf(club, 'Chris')
    await db.insertInto('game_details').values({ session_id: 'g1', version: 'v', detail: '{}', stats: '{}' }).execute()
    expect((await send('admin', 'POST', `/api/tournaments/club/participants/${chris.id}/unlink`)).statusCode).toBe(200)
    expect(await history('anna')).toEqual([])
    expect(await db.selectFrom('game_details').select('session_id').where('session_id', '=', 'g1').execute()).toEqual([])
    // The link works for the next person
    expect((await send('ben', 'GET', `/api/tournaments/claim/${chris.claimCode}`)).json<Claim>().claimable).toBe(false)
  })
})
