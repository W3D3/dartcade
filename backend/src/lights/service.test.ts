import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../schema/game-ws.js'
import { LightsService, type LightsDeps } from './service.js'

type Sent = { board: string; msg: { kind: string; data: Record<string, unknown> } }

const dev = (id: string, board: string) => ({
  id,
  board_id: board,
  mac: id,
  name: id,
  host: '192.168.1.2',
  leds: 60,
  version: '0.15.0',
  segments: 1,
  segment_mode: 'whole' as const,
  max_bri: 178,
  created_at: new Date(),
})

function setup(over: Partial<LightsDeps> = {}) {
  const sent: Sent[] = []
  const snaps = new Map<string, Snapshot>()
  const sessions = new Map<string, { boardId: string | null; seats: { boardId: string | null }[] }>()
  const deps: LightsDeps = {
    send: (board, msg) => (sent.push({ board, msg: msg as Sent['msg'] }), true),
    bridgeVersion: () => '0.4.0',
    devices: board => Promise.resolve([dev(`dev-${board}`, board)]),
    enabled: () => Promise.resolve(true),
    getSession: id => sessions.get(id),
    getSnapshot: id => snaps.get(id),
    sessionOnBoard: () => null,
    warn: () => undefined,
    ...over,
  }
  return { svc: new LightsService(deps), sent, snaps, sessions }
}

const x01 = (g: Record<string, unknown>) =>
  ({
    gameId: 'x01',
    game: {
      phase: 'game',
      currentPlayer: 0,
      winner: null,
      scores: [501, 501],
      visitStartScores: [501, 501],
      bustThisVisit: false,
      visitLocked: false,
      currentVisitDarts: [],
      totalVisits: [0, 0],
      ...g,
    },
  }) as unknown as Snapshot
const applies = (sent: Sent[], board: string) => sent.filter(s => s.board === board && s.msg.kind === 'wled.apply').map(s => s.msg.data)

describe('LightsService', () => {
  it('a local game lights the board in the first seat’s colour', async () => {
    const { svc, sent, snaps, sessions } = setup()
    sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }, { boardId: null }] })
    snaps.set('s', x01({}))
    await svc.onPush('s')
    const [a] = applies(sent, 'b1')
    expect(a.device_id).toBe('dev-b1')
    expect(a.hold_ms).toBeUndefined()
    expect((a.state as { seg: { col: number[][] }[] }).seg[0].col).toEqual([[198, 242, 78]])
  })

  it('remote game: a bust flashes only the throwing board; the other board shows waiting', async () => {
    const { svc, sent, snaps, sessions } = setup()
    sessions.set('s', { boardId: null, seats: [{ boardId: 'b1' }, { boardId: 'b2' }] })
    snaps.set('s', x01({ currentVisitDarts: [{}], scores: [30, 501], visitStartScores: [40, 501] }))
    await svc.onPush('s')
    sent.length = 0
    snaps.set(
      's',
      x01({ currentVisitDarts: [{}, {}], scores: [40, 501], visitStartScores: [40, 501], bustThisVisit: true, visitLocked: true }),
    )
    await svc.onPush('s')
    expect(applies(sent, 'b1').map(a => a.hold_ms)).toEqual([1500])
    expect(applies(sent, 'b2')).toEqual([])
    sent.length = 0
    snaps.set('s', x01({ currentPlayer: 1, totalVisits: [1, 0] }))
    await svc.onPush('s')
    const b1 = applies(sent, 'b1')[0].state as { bri: number }
    expect(b1.bri).toBe(40) // waiting: the other board's turn
    expect(applies(sent, 'b2')[0].hold_ms).toBeUndefined()
  })

  it('takeout lights white, then the game scene comes back', async () => {
    const { svc, sent, snaps, sessions } = setup()
    sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }, { boardId: null }] })
    snaps.set('s', x01({}))
    await svc.onPush('s')
    const turn = applies(sent, 'b1')[0].state
    sent.length = 0
    await svc.onBoardEvent('b1', 'takeout.started')
    await svc.onBoardEvent('b1', 'takeout.finished')
    const [white, back] = applies(sent, 'b1')
    expect((white.state as { seg: { col: number[][] }[] }).seg[0].col).toEqual([[255, 255, 255]])
    expect(back.state).toEqual(turn)
  })

  it('lights off or an old bridge sends nothing', async () => {
    for (const over of [{ enabled: () => Promise.resolve(false) }, { bridgeVersion: () => '0.3.1' }]) {
      const { svc, sent, snaps, sessions } = setup(over)
      sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }] })
      snaps.set('s', x01({}))
      await svc.onPush('s')
      await svc.onBridgeHello('b1')
      expect(sent).toEqual([])
    }
  })

  it('a reconnecting bridge gets its devices, then the scene', async () => {
    const { svc, sent, snaps, sessions } = setup()
    sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }, { boardId: null }] })
    snaps.set('s', x01({}))
    await svc.onPush('s')
    sent.length = 0
    await svc.onBridgeHello('b1')
    expect(sent.map(s => s.msg.kind)).toEqual(['wled.devices', 'wled.apply'])
    expect(sent[0].msg.data).toEqual({ devices: [{ id: 'dev-b1', mac: 'dev-b1', host: '192.168.1.2', max_bri: 178 }] })
  })

  it('a board with no game goes idle on hello', async () => {
    const { svc, sent } = setup()
    await svc.onBridgeHello('b1')
    const state = applies(sent, 'b1')[0].state as { bri: number; seg: { fx: number }[] }
    expect(state.bri).toBe(60)
    expect(state.seg[0].fx).toBe(2)
  })

  it('the game ending makes the board idle', async () => {
    const { svc, sent, snaps, sessions } = setup()
    sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }] })
    snaps.set('s', x01({}))
    await svc.onPush('s')
    sent.length = 0
    await svc.onGameEnded('s')
    expect((applies(sent, 'b1')[0].state as { bri: number }).bri).toBe(60)
  })

  it('a send that throws is logged, not raised', async () => {
    const warns: string[] = []
    const { svc, snaps, sessions } = setup({
      send: () => {
        throw new Error('socket')
      },
      warn: m => warns.push(m),
    })
    sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }] })
    snaps.set('s', x01({}))
    await expect(svc.onPush('s')).resolves.toBeUndefined()
    expect(warns.length).toBeGreaterThan(0)
  })

  it('turning lights off darkens the strip, then clears the allowlist', async () => {
    const { svc, sent } = setup({ enabled: () => Promise.resolve(false) })
    await svc.devicesChanged('b1')
    expect(sent.map(s => s.msg.kind)).toEqual(['wled.apply', 'wled.devices'])
    expect(sent[0].msg.data.state).toEqual({ on: false })
    expect(sent[1].msg.data).toEqual({ devices: [] })
  })

  it('test plays a rule as a flash for seat 1', async () => {
    const { svc, sent } = setup()
    expect(await svc.test('b1', 0)).toBe(true) // rule 1 is a scene; Test holds it 3 s
    expect(applies(sent, 'b1')[0].hold_ms).toBe(3000)
    expect(await svc.test('b1', 99)).toBe(false)
  })

  it('test sends nothing and returns false when devices() throws', async () => {
    const { svc } = setup({
      devices: () => Promise.reject(new Error('scan failed')),
    })
    expect(await svc.test('b1', 0)).toBe(false)
  })

  describe('serialized per board (a push racing a takeout, or onGameEnded, never lands out of order)', () => {
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    it('a takeout racing the push that changed the turn still resends the new turn last', async () => {
      const { svc, sent, snaps, sessions } = setup()
      sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }, { boardId: null }] })
      snaps.set('s', x01({}))
      await svc.onPush('s') // turn seat 0, remembered
      sent.length = 0
      // None of these are awaited before the next is issued, the way the bridge handler fires
      // onPush (from the push callback) and onBoardEvent back to back without awaiting either.
      const started = svc.onBoardEvent('b1', 'takeout.started') // white, not remembered
      snaps.set('s', x01({ currentPlayer: 1 }))
      const pushed = svc.onPush('s') // turn seat 1
      const finished = svc.onBoardEvent('b1', 'takeout.finished') // must resend turn seat 1, not the stale seat 0
      await Promise.all([started, pushed, finished])
      const last = applies(sent, 'b1').at(-1)
      expect((last?.state as { seg: { col: number[][] }[] }).seg[0].col).toEqual([[239, 238, 230]]) // seat 1's colour
    })

    it('a slow devices() call on the first push does not let a faster later push overtake it', async () => {
      let calls = 0
      const { svc, sent, snaps, sessions } = setup({
        devices: board => {
          calls++
          return calls === 1 ? delay(20).then(() => [dev(`dev-${board}`, board)]) : Promise.resolve([dev(`dev-${board}`, board)])
        },
      })
      sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }, { boardId: null }] })
      snaps.set('s', x01({}))
      const first = svc.onPush('s') // slow: turn seat 0
      snaps.set('s', x01({ currentPlayer: 1 }))
      const second = svc.onPush('s') // fast: turn seat 1, issued right behind the slow one
      await Promise.all([first, second])
      const cols = applies(sent, 'b1').map(a => (a.state as { seg: { col: number[][] }[] }).seg[0].col)
      expect(cols).toEqual([[[198, 242, 78]], [[239, 238, 230]]]) // seat 0, then seat 1 — never reversed
    })

    it('onGameEnded racing an in-flight scene fire still leaves idle as the last apply', async () => {
      let calls = 0
      const { svc, sent, snaps, sessions } = setup({
        devices: board => {
          calls++
          return calls === 1 ? delay(20).then(() => [dev(`dev-${board}`, board)]) : Promise.resolve([dev(`dev-${board}`, board)])
        },
      })
      sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }] })
      snaps.set('s', x01({}))
      const pushed = svc.onPush('s') // slow: turn seat 0 fire still in flight
      const ended = svc.onGameEnded('s') // issued right behind it, not awaited first
      await Promise.all([pushed, ended])
      const last = applies(sent, 'b1').at(-1)
      expect((last?.state as { bri: number }).bri).toBe(60) // idle, not the turn scene
    })
  })
})
