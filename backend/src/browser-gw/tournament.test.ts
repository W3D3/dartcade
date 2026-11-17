import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { AddressInfo } from 'net'
import fastifyWebsocket from '@fastify/websocket'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { setOverrides, setupFlags } from '../flags/index.js'
import { WsCloseCode } from '../schema/game-ws.js'
import type { TournamentDevice, TournamentServerMessage } from '../schema/tournament-ws.js'
import { addOrganizer } from '../db/tournaments.js'
import { setParticipants } from '../db/tournamentParticipants.js'
import { insertTournament, insertTournamentEntry, insertUsers } from '../test/fixtures.js'
import { TournamentService } from '../tournaments/service.js'
import { TournamentLive, liveMessage } from '../tournaments/live.js'
import { tournamentGwPlugin } from './tournament.js'

vi.mock('../auth/session.js', () => ({ getAuthUser: vi.fn().mockResolvedValue(null) }))
import { getAuthUser } from '../auth/session.js'

const signIn = (userId: string) => vi.mocked(getAuthUser).mockResolvedValue({ userId, impersonatedBy: null })

describe.skipIf(!process.env.TEST_DATABASE_URL)('/ws/tournament', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let app: FastifyInstance
  let live: TournamentLive
  let port: number

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('tournament_gw_test'))
    await setupFlags(new Set())
    await setOverrides(new Map([['tournaments.enabled', { mode: 'users', userIds: ['org', 'max', 'pia'] }]]))
    await insertUsers(db, ['org', 'max', 'pia', 'off'])
    await insertTournament(db, { id: 'pub', owner_user_id: 'org', status: 'open', visibility: 'public' })
    await insertTournament(db, { id: 'inv', owner_user_id: 'org', status: 'open', visibility: 'invite', invite_code: 'K7Q4MD' })
    await insertTournament(db, { id: 'draft', owner_user_id: 'org', status: 'draft' })
    live = new TournamentLive(id => liveMessage(db, { getSession: () => undefined }, id, Date.now()))
    app = Fastify()
    await app.register(fastifyWebsocket)
    await app.register(tournamentGwPlugin, { db, live })
    await app.listen({ port: 0, host: '127.0.0.1' })
    port = (app.server.address() as AddressInfo).port
  })

  afterAll(async () => {
    await app.close()
    await setOverrides(new Map())
    await close()
  })

  afterEach(() => {
    vi.mocked(getAuthUser).mockReset().mockResolvedValue(null)
  })

  const url = (query: string) => `ws://127.0.0.1:${port}/ws/tournament?${query}`
  const closeCode = (u: string) =>
    new Promise<number>((resolve, reject) => {
      const ws = new WebSocket(u)
      ws.addEventListener('close', e => {
        resolve(e.code)
      })
      setTimeout(() => reject(new Error('timeout')), 2000)
    })
  /** Opens the socket and collects what it gets. */
  async function open(u: string): Promise<{ ws: WebSocket; got: TournamentServerMessage[] }> {
    const ws = new WebSocket(u)
    const got: TournamentServerMessage[] = []
    ws.addEventListener('message', e => got.push(JSON.parse(String(e.data)) as TournamentServerMessage))
    for (let i = 0; i < 200 && got.length === 0; i++) await new Promise(r => setTimeout(r, 10))
    return { ws, got }
  }

  it('closes for the signed out, without an id, and like a 404 for whoever may not see it', async () => {
    expect(await closeCode(url('tournamentId=pub'))).toBe(WsCloseCode.Unauthorized)
    signIn('max')
    expect(await closeCode(url(''))).toBe(WsCloseCode.MissingSession)
    expect(await closeCode(url('tournamentId=nope'))).toBe(WsCloseCode.NotFound)
    expect(await closeCode(url('tournamentId=draft'))).toBe(WsCloseCode.NotFound)
    expect(await closeCode(url('tournamentId=inv'))).toBe(WsCloseCode.NotFound)
    // tournaments.enabled is off for this one
    signIn('off')
    expect(await closeCode(url('tournamentId=pub'))).toBe(WsCloseCode.NotFound)
  })

  it('sends the state at once, then again only when it changed', async () => {
    signIn('max')
    const { ws, got } = await open(url('tournamentId=inv&code=k7q4md'))
    expect(got).toEqual([
      expect.objectContaining({ type: 'tournament.live', tournamentId: 'inv', status: 'open', entries: [], matches: [] }),
    ])
    await live.refreshAll()
    await new Promise(r => setTimeout(r, 50))
    expect(got).toHaveLength(1)
    await insertTournamentEntry(db, { id: 'e1', tournament_id: 'inv', name: 'Pia', status: 'registered' })
    await live.refreshAll()
    for (let i = 0; i < 100 && got.length < 2; i++) await new Promise(r => setTimeout(r, 10))
    expect(got[1]).toMatchObject({ entries: [{ name: 'Pia' }] })
    ws.close()
    for (let i = 0; i < 100 && live.socketCount() > 0; i++) await new Promise(r => setTimeout(r, 10))
    expect(live.socketCount()).toBe(0)
  })

  describe('devices in tournament mode', () => {
    beforeAll(async () => {
      await insertTournament(db, { id: 'venue', owner_user_id: 'org', status: 'open', play: 'in_person', preselected: true })
      await addOrganizer(db, 'venue', 'pia')
      await setParticipants(
        db,
        'venue',
        ['Anna', 'Jonas', 'Mia', 'Paul'].map(name => ({ name, tag: null, color: null, players: [{ name }] })),
      )
      const runner = new TournamentService({ db, engine: {} as never, isOnline: () => false, boardOnline: () => false, send: () => {} })
      expect(await runner.organizerStart('venue')).toBe('started')
      // R1M1's game is on (#617 starts it from a device)
      await db
        .updateTable('tournament_matches')
        .set({ status: 'live' })
        .where('tournament_id', '=', 'venue')
        .where('slot', '=', 1)
        .where('round', '=', 1)
        .execute()
      await live.refreshAll()
    })

    const device = (id: string, name: string) => url(`tournamentId=venue&deviceId=${id}&device=${encodeURIComponent(name)}`)
    /** The devices as the socket last heard them, once `until` holds (within a second). */
    async function devices(got: TournamentServerMessage[], until: (d: TournamentDevice[]) => boolean): Promise<TournamentDevice[]> {
      const last = () => got.filter(m => m.type === 'tournament.devices').at(-1)?.devices ?? []
      const t0 = Date.now()
      while (!until(last())) {
        if (Date.now() - t0 > 1000) throw new Error(`devices not as expected: ${JSON.stringify(last())}`)
        await new Promise(r => setTimeout(r, 10))
      }
      return last()
    }
    const send = (ws: WebSocket, msg: object) => ws.send(JSON.stringify(msg))

    it('lets only organizers of an in-person tournament open it as a device', async () => {
      signIn('max')
      expect(await closeCode(device('x', 'Phone'))).toBe(WsCloseCode.Forbidden)
      signIn('org')
      expect(await closeCode(url('tournamentId=pub&deviceId=x&device=Tablet'))).toBe(WsCloseCode.Forbidden)
    })

    it('shows every device to every organizer at once, pauses the match of one that leaves and lets another continue it', async () => {
      signIn('org')
      const bar = await open(device('bar', 'Tablet · Bar'))
      const stage = await open(device('stage', 'Tablet · Stage'))
      // Two browsers on one account see each other within a second
      await devices(bar.got, d => d.length === 2)
      expect(await devices(stage.got, d => d.length === 2)).toEqual([
        { id: 'bar', name: 'Tablet · Bar', matchKey: null },
        { id: 'stage', name: 'Tablet · Stage', matchKey: null },
      ])
      // A co-organizer on another account sees the same list; watching is not being a device
      signIn('pia')
      const office = await open(url('tournamentId=venue'))
      await devices(office.got, d => d.length === 2)

      send(bar.ws, { type: 'device.hold', matchKey: 'R1M1' })
      send(bar.ws, { type: 'device.rename', name: 'Tablet · Window' })
      await devices(office.got, d => d[0]?.name === 'Tablet · Window' && d[0].matchKey === 'R1M1')
      // Another device can't take a match one plays, nor one still waiting for its players
      send(stage.ws, { type: 'device.hold', matchKey: 'R1M1' })
      send(stage.ws, { type: 'device.hold', matchKey: 'R2M1' })
      send(office.ws, { type: 'device.hold', matchKey: 'R1M2' })
      send(stage.ws, { type: 'device.rename', name: 'Tablet · Stage 2' })
      expect(await devices(office.got, d => d[1]?.name === 'Tablet · Stage 2')).toEqual([
        { id: 'bar', name: 'Tablet · Window', matchKey: 'R1M1' },
        { id: 'stage', name: 'Tablet · Stage 2', matchKey: null },
      ])

      // Leaving tournament mode pauses R1M1: no device plays it, and another one continues it
      bar.ws.close()
      expect(await devices(office.got, d => d.length === 1)).toEqual([{ id: 'stage', name: 'Tablet · Stage 2', matchKey: null }])
      send(stage.ws, { type: 'device.hold', matchKey: 'R1M1' })
      await devices(office.got, d => d[0]?.matchKey === 'R1M1')

      // A reload: the socket closes first, then the device opens it again naming its match
      stage.ws.close()
      await devices(office.got, d => d.length === 0)
      const reloaded = await open(`${device('stage', 'Tablet · Stage 2')}&hold=R1M1`)
      expect(await devices(office.got, d => d.length === 1)).toEqual([{ id: 'stage', name: 'Tablet · Stage 2', matchKey: 'R1M1' }])
      // Not when another device took it meanwhile
      const bar2 = await open(`${device('bar', 'Tablet · Window')}&hold=R1M1`)
      expect(await devices(office.got, d => d.length === 2)).toEqual([
        { id: 'stage', name: 'Tablet · Stage 2', matchKey: 'R1M1' },
        { id: 'bar', name: 'Tablet · Window', matchKey: null },
      ])
      bar2.ws.close()
      await devices(office.got, d => d.length === 1)

      // The same browser opening it again while its old socket is still open takes its place over
      signIn('org')
      const again = await open(device('stage', 'Tablet · Stage 2'))
      expect(await devices(again.got, d => d.length === 1)).toEqual([{ id: 'stage', name: 'Tablet · Stage 2', matchKey: 'R1M1' }])
      for (const ws of [reloaded.ws, again.ws, office.ws]) ws.close()
    })
  })
})
