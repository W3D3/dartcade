import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../schema/game-ws.js'
import { DEFAULT_PROFILE, type Profile } from '../shared/lights/index.js'
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
    profile: () => Promise.resolve(DEFAULT_PROFILE),
    enabled: () => Promise.resolve(true),
    getSession: id => sessions.get(id),
    getSnapshot: id => snaps.get(id),
    sessionOnBoard: () => null,
    inLobby: () => Promise.resolve(true),
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
    expect((a.state as { seg: { col: number[][] }[] }).seg[0].col).toEqual([[86, 212, 232]])
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

  it('a board’s own seat colours reach the strip, and a changed colour shows on the next fire', async () => {
    let colors: readonly string[] = ['#010203', '#040506', '#070809', '#0a0b0c', '#0d0e0f', '#101112']
    const { svc, sent, snaps, sessions } = setup({ profile: () => Promise.resolve({ ...DEFAULT_PROFILE, seatColors: colors }) })
    sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }, { boardId: null }] })
    snaps.set('s', x01({}))
    await svc.onPush('s')
    const col = () => (applies(sent, 'b1').at(-1)?.state as { seg: { col: number[][] }[] }).seg[0].col
    expect(col()).toEqual([[1, 2, 3]])
    colors = ['#ff0000', ...colors.slice(1)]
    sent.length = 0
    await svc.devicesChanged('b1') // what saving a colour does: the remembered scene is sent again
    expect(col()).toEqual([[255, 0, 0]])
  })

  it('test() uses the board’s seat colours too', async () => {
    const { svc, sent } = setup({ profile: () => Promise.resolve({ ...DEFAULT_PROFILE, seatColors: ['#010203'] }) })
    expect(await svc.test('b1', 0)).toBe(true) // turn scene, seat 1
    expect((applies(sent, 'b1')[0].state as { seg: { col: number[][] }[] }).seg[0].col).toEqual([[1, 2, 3]])
  })

  it('a board runs its own profile: its rules decide what lights, and a disabled one never does', async () => {
    const bust = DEFAULT_PROFILE.rules.find(r => r.when.trigger === 'bust')!
    const own = (enabled: boolean): Profile => ({
      id: 'p1',
      name: 'Mine',
      seatColors: DEFAULT_PROFILE.seatColors,
      rules: [{ ...bust, enabled, holdMs: 777 }],
    })
    for (const [enabled, holds] of [
      [true, [777]],
      [false, []],
    ] as const) {
      const { svc, sent, snaps, sessions } = setup({ profile: () => Promise.resolve(own(enabled)) })
      sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }, { boardId: null }] })
      snaps.set('s', x01({ currentVisitDarts: [{}], scores: [30, 501], visitStartScores: [40, 501] }))
      await svc.onPush('s')
      snaps.set(
        's',
        x01({ currentVisitDarts: [{}, {}], scores: [40, 501], visitStartScores: [40, 501], bustThisVisit: true, visitLocked: true }),
      )
      await svc.onPush('s')
      expect(applies(sent, 'b1').map(a => a.hold_ms)).toEqual(holds)
    }
  })

  it('switching the scene on the strip off darkens it, and switching it on shows it again', async () => {
    let off = false
    const profile = (): Profile => ({
      ...DEFAULT_PROFILE,
      rules: DEFAULT_PROFILE.rules.map(r => (r.when.trigger === 'turn' ? { ...r, enabled: !off } : r)),
    })
    const { svc, sent, snaps, sessions } = setup({ profile: () => Promise.resolve(profile()), sessionOnBoard: () => 's' })
    sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }, { boardId: null }] })
    snaps.set('s', x01({}))
    await svc.onPush('s')
    expect(applies(sent, 'b1')).toHaveLength(1) // the turn scene
    sent.length = 0
    off = true
    await svc.devicesChanged('b1') // what saving the switch does
    expect(applies(sent, 'b1').map(a => a.state)).toEqual([{ on: false }])
    sent.length = 0
    off = false
    snaps.set('s', x01({ currentPlayer: 1 }))
    await svc.onPush('s') // the next turn shows again
    expect(applies(sent, 'b1')).toHaveLength(1)
    expect((applies(sent, 'b1')[0].state as { seg: { col: number[][] }[] }).seg[0].col).toEqual([[239, 238, 230]])
  })

  describe('a failure that is not a switched-off effect leaves the strip and its scene alone', () => {
    const cases: [string, Partial<LightsDeps>][] = [
      ['the profile cannot be read', { profile: () => Promise.reject(new Error('db down')) }],
      ['lights cannot be checked', { enabled: () => Promise.reject(new Error('db down')) }],
      ['the devices cannot be read', { devices: () => Promise.reject(new Error('db down')) }],
    ]
    it.each(cases)('when %s: a takeout, a calibration and a bridge hello send nothing and keep the scene', async (_name, broken) => {
      let working = true
      const { svc, sent, snaps, sessions } = setup({
        sessionOnBoard: () => 's',
        profile: () => (working ? Promise.resolve(DEFAULT_PROFILE) : (broken.profile?.('b1') ?? Promise.resolve(DEFAULT_PROFILE))),
        enabled: () => (working ? Promise.resolve(true) : (broken.enabled?.('b1') ?? Promise.resolve(true))),
        devices: board =>
          working
            ? Promise.resolve([dev(`dev-${board}`, board)])
            : (broken.devices?.(board) ?? Promise.resolve([dev(`dev-${board}`, board)])),
      })
      sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }, { boardId: null }] })
      snaps.set('s', x01({}))
      await svc.onPush('s') // the turn scene is remembered
      working = false
      sent.length = 0
      await svc.onBoardEvent('b1', 'takeout.finished')
      await svc.onBridgeHello('b1')
      expect(applies(sent, 'b1')).toEqual([]) // no off sent for a hiccup
      working = true
      await svc.onBoardEvent('b1', 'takeout.finished')
      expect(applies(sent, 'b1')).toHaveLength(1) // the scene was kept, and shows again
      expect((applies(sent, 'b1')[0].state as { bri?: number }).bri).toBe(255)
    })

    it('an old bridge, and lights switched off, send nothing either', async () => {
      for (const over of [{ bridgeVersion: () => '0.3.1' }, { enabled: () => Promise.resolve(false) }]) {
        const { svc, sent } = setup({ sessionOnBoard: () => 's', ...over })
        await svc.onBoardEvent('b1', 'takeout.finished')
        expect(applies(sent, 'b1')).toEqual([])
      }
    })
  })

  it('the Test button plays a rule of the board’s own profile', async () => {
    const { svc, sent } = setup({
      profile: () =>
        Promise.resolve({ ...DEFAULT_PROFILE, rules: DEFAULT_PROFILE.rules.filter(r => r.when.trigger === 'takeout.started') }),
    })
    expect(await svc.test('b1', 0)).toBe(true) // its only rule is the takeout scene
    expect(applies(sent, 'b1')[0].hold_ms).toBe(3000)
    expect(await svc.test('b1', 1)).toBe(false)
  })

  it('takeout lights yellow, then the game scene comes back', async () => {
    const { svc, sent, snaps, sessions } = setup()
    sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }, { boardId: null }] })
    snaps.set('s', x01({}))
    await svc.onPush('s')
    const turn = applies(sent, 'b1')[0].state
    sent.length = 0
    await svc.onBoardEvent('b1', 'takeout.started')
    await svc.onBoardEvent('b1', 'takeout.finished')
    const [yellow, back] = applies(sent, 'b1')
    expect((yellow.state as { seg: { col: number[][] }[] }).seg[0].col).toEqual([[255, 214, 10]])
    expect(back.state).toEqual(turn)
  })

  const status = (s: string) => ({ status: s, event: '', running: true, connected: true })

  it('Running to Calibrating sends the purple comet scene', async () => {
    const { svc, sent, snaps, sessions } = setup()
    sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }, { boardId: null }] })
    snaps.set('s', x01({}))
    await svc.onPush('s')
    sent.length = 0
    await svc.onBoardEvent('b1', 'board.status', status('Calibrating'))
    const [purple] = applies(sent, 'b1')
    expect((purple.state as { seg: { col: number[][] }[] }).seg[0].col).toEqual([[168, 85, 247]])
  })

  it('Calibrating to Running restores the remembered game scene', async () => {
    const { svc, sent, snaps, sessions } = setup()
    sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }, { boardId: null }] })
    snaps.set('s', x01({}))
    await svc.onPush('s')
    const turn = applies(sent, 'b1')[0].state
    sent.length = 0
    await svc.onBoardEvent('b1', 'board.status', status('Calibrating'))
    await svc.onBoardEvent('b1', 'board.status', status('Running'))
    const [, back] = applies(sent, 'b1')
    expect(back.state).toEqual(turn)
  })

  it('repeated Calibrating statuses do not resend', async () => {
    const { svc, sent, snaps, sessions } = setup()
    sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }, { boardId: null }] })
    snaps.set('s', x01({}))
    await svc.onPush('s')
    sent.length = 0
    await svc.onBoardEvent('b1', 'board.status', status('Calibrating'))
    await svc.onBoardEvent('b1', 'board.status', status('Calibrating'))
    expect(applies(sent, 'b1')).toHaveLength(1)
  })

  it('ignores malformed board.status data', async () => {
    const { svc, sent } = setup()
    await svc.onBoardEvent('b1', 'board.status', null)
    await svc.onBoardEvent('b1', 'board.status', { event: 'no status field' })
    await svc.onBoardEvent('b1', 'board.status', 'Calibrating')
    expect(sent).toEqual([])
  })

  it('a game scene change during calibration is remembered, the same as during a takeout', async () => {
    const { svc, sent, snaps, sessions } = setup()
    sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }, { boardId: null }] })
    snaps.set('s', x01({}))
    await svc.onPush('s')
    sent.length = 0
    // None of these are awaited before the next is issued, the same race the takeout test above covers.
    const started = svc.onBoardEvent('b1', 'board.status', status('Calibrating'))
    snaps.set('s', x01({ currentPlayer: 1 }))
    const pushed = svc.onPush('s')
    const finished = svc.onBoardEvent('b1', 'board.status', status('Running'))
    await Promise.all([started, pushed, finished])
    const last = applies(sent, 'b1').at(-1)
    expect((last?.state as { seg: { col: number[][] }[] }).seg[0].col).toEqual([[239, 238, 230]]) // seat 1's colour
  })

  it('takeout.finished during calibration does not restore the game scene (calibration.finished does it later)', async () => {
    const { svc, sent, snaps, sessions } = setup()
    sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }, { boardId: null }] })
    snaps.set('s', x01({}))
    await svc.onPush('s')
    const turn = applies(sent, 'b1')[0].state
    sent.length = 0
    await svc.onBoardEvent('b1', 'board.status', status('Calibrating'))
    sent.length = 0
    await svc.onBoardEvent('b1', 'takeout.finished')
    expect(applies(sent, 'b1')).toEqual([]) // still calibrating; no restore yet
    await svc.onBoardEvent('b1', 'board.status', status('Running'))
    const [back] = applies(sent, 'b1')
    expect(back.state).toEqual(turn)
  })

  it('onPush sends nothing when lights are off or the bridge is too old', async () => {
    for (const over of [{ enabled: () => Promise.resolve(false) }, { bridgeVersion: () => '0.3.1' }]) {
      const { svc, sent, snaps, sessions } = setup(over)
      sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }] })
      snaps.set('s', x01({}))
      await svc.onPush('s')
      expect(sent).toEqual([])
    }
  })

  it('onBridgeHello sends nothing for an old bridge', async () => {
    const { svc, sent } = setup({ bridgeVersion: () => '0.3.1' })
    await svc.onBridgeHello('b1')
    expect(sent).toEqual([])
  })

  it('onBridgeHello sends nothing when lights are off and the bridge is too old', async () => {
    const { svc, sent } = setup({ enabled: () => Promise.resolve(false), bridgeVersion: () => '0.3.1' })
    await svc.onBridgeHello('b1')
    expect(sent).toEqual([])
  })

  it('onBridgeHello darkens when lights are off, so a strip left on while the bridge was offline goes dark on reconnect', async () => {
    const { svc, sent } = setup({ enabled: () => Promise.resolve(false) })
    await svc.onBridgeHello('b1')
    // A restarted bridge has no workers yet: the devices list goes first, so the off applies land
    // on real workers instead of being dropped as unpaired, before the allowlist is cleared.
    expect(sent.map(s => s.msg.kind)).toEqual(['wled.devices', 'wled.apply', 'wled.devices'])
    expect(sent[0].msg.data).toEqual({ devices: [{ id: 'dev-b1', mac: 'dev-b1', host: '192.168.1.2', max_bri: 178 }] })
    expect(sent[1].msg.data).toEqual({ device_id: 'dev-b1', state: { on: false } })
    expect(sent[2].msg.data).toEqual({ devices: [] })
  })

  it('darkenDevice sends {on:false} to just that device, for a DELETE before the new allowlist goes out', async () => {
    const { svc, sent } = setup()
    await svc.darkenDevice('b1', 'd1')
    expect(sent).toEqual([{ board: 'b1', msg: { kind: 'wled.apply', data: { device_id: 'd1', state: { on: false } } } }])
  })

  it('darkenDevice sends nothing for an old bridge', async () => {
    const { svc, sent } = setup({ bridgeVersion: () => '0.3.1' })
    await svc.darkenDevice('b1', 'd1')
    expect(sent).toEqual([])
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

  it('the Lobby scene is off by default: a board in a lobby with no game goes dark on hello', async () => {
    const { svc, sent } = setup()
    await svc.onBridgeHello('b1')
    expect(applies(sent, 'b1').map(a => a.state)).toEqual([{ on: false }])
  })

  it('the game ending darkens the board', async () => {
    const { svc, sent, snaps, sessions } = setup()
    sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }] })
    snaps.set('s', x01({}))
    await svc.onPush('s')
    sent.length = 0
    await svc.onGameEnded('s')
    expect(applies(sent, 'b1').map(a => a.state)).toEqual([{ on: false }])
  })

  it('a board no lobby uses goes off instead of idle (#291)', async () => {
    const { svc, sent, snaps, sessions } = setup({ inLobby: () => Promise.resolve(false) })
    await svc.onBridgeHello('b1')
    expect(applies(sent, 'b1')).toEqual([{ device_id: 'dev-b1', state: { on: false } }])
    sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }] })
    snaps.set('s', x01({}))
    await svc.onPush('s')
    sent.length = 0
    await svc.onGameEnded('s')
    await svc.onBoardEvent('b1', 'takeout.finished')
    expect(applies(sent, 'b1').map(a => a.state)).toEqual([{ on: false }, { on: false }])
  })

  it('a board joining or leaving a lobby goes dark, a board in a game is left alone', async () => {
    let session: string | null = null
    const { svc, sent } = setup({ sessionOnBoard: () => session })
    await svc.onLobbyBoards(['b1'])
    expect(applies(sent, 'b1')).toEqual([{ device_id: 'dev-b1', state: { on: false } }])
    sent.length = 0
    session = 's'
    await svc.onLobbyBoards(['b1'])
    expect(sent).toEqual([])
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

  it('turning lights off sends the devices, darkens the strip, then clears the allowlist', async () => {
    const { svc, sent } = setup({ enabled: () => Promise.resolve(false) })
    await svc.devicesChanged('b1')
    expect(sent.map(s => s.msg.kind)).toEqual(['wled.devices', 'wled.apply', 'wled.devices'])
    expect(sent[0].msg.data).toEqual({ devices: [{ id: 'dev-b1', mac: 'dev-b1', host: '192.168.1.2', max_bri: 178 }] })
    expect(sent[1].msg.data.state).toEqual({ on: false })
    expect(sent[2].msg.data).toEqual({ devices: [] })
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
      const started = svc.onBoardEvent('b1', 'takeout.started') // amber, not remembered
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
      expect(cols).toEqual([[[86, 212, 232]], [[239, 238, 230]]]) // seat 0, then seat 1 — never reversed
    })

    it('onGameEnded racing an in-flight scene fire still leaves the strip dark', async () => {
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
      expect(last?.state).toEqual({ on: false }) // dark, not the turn scene
    })
  })
})
