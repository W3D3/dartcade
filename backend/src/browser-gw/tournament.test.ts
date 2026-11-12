import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { AddressInfo } from 'net'
import fastifyWebsocket from '@fastify/websocket'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { setOverrides, setupFlags } from '../flags/index.js'
import { WsCloseCode } from '../schema/game-ws.js'
import type { TournamentLiveMessage } from '../schema/tournament-ws.js'
import { insertTournament, insertTournamentEntry, insertUsers } from '../test/fixtures.js'
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
    await insertTournament(db, { id: 'pub', owner_user_id: 'org', status: 'open', access: 'public' })
    await insertTournament(db, { id: 'inv', owner_user_id: 'org', status: 'open', access: 'invite', invite_code: 'K7Q4MD' })
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
  async function open(u: string): Promise<{ ws: WebSocket; got: TournamentLiveMessage[] }> {
    const ws = new WebSocket(u)
    const got: TournamentLiveMessage[] = []
    ws.addEventListener('message', e => got.push(JSON.parse(String(e.data)) as TournamentLiveMessage))
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
    expect(got[1].entries.map(e => e.name)).toEqual(['Pia'])
    ws.close()
    for (let i = 0; i < 100 && live.socketCount() > 0; i++) await new Promise(r => setTimeout(r, 10))
    expect(live.socketCount()).toBe(0)
  })
})
