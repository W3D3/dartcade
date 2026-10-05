import { describe, it, expect, vi } from 'vitest'
import { SessionEngine, type EngineStore } from './session/engine.js'
import { browserConnections, pushSnapshot, pushNotice } from './browser-gw/handler.js'
import { x01Module } from './games/x01.js'

vi.mock('./auth/session.js', () => ({ getAuthUser: vi.fn() }))

const store: EngineStore = {
  insertSession: vi.fn().mockResolvedValue(undefined),
  getActiveSessions: vi.fn().mockResolvedValue([]),
  getSessionEvents: vi.fn().mockResolvedValue([]),
  appendEvent: vi.fn().mockResolvedValue(undefined),
  insertDarts: vi.fn().mockResolvedValue(undefined),
  deleteDarts: vi.fn().mockResolvedValue(undefined),
  finishSession: vi.fn().mockResolvedValue(undefined),
  abortSession: vi.fn().mockResolvedValue(undefined),
}
const sock = () => ({ readyState: 1, send: vi.fn() }) as any
const last = (ws: { send: { mock: { calls: unknown[][] } } }) => JSON.parse(String(ws.send.mock.calls.at(-1)?.[0]))

describe('two players, two boards', () => {
  it("each sees their own seats, the other's darts, and only their own notices", async () => {
    const engine: SessionEngine = new SessionEngine(
      store,
      id => {
        pushSnapshot(id, engine)
      },
      undefined,
      pushNotice,
    )
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'host',
      gameId: 'x01',
      config: x01Module.defaultConfig,
      seats: [
        { name: 'Host', userId: 'host', controllerUserId: 'host', boardId: 'a', boardName: 'Living room' },
        { name: 'Lena', userId: 'lena', controllerUserId: 'lena', boardId: 'b', boardName: "Lena's place" },
      ],
    })
    const hostWs = sock()
    const lenaWs = sock()
    browserConnections.add(sessionId, hostWs, 'host')
    browserConnections.add(sessionId, lenaWs, 'lena')

    await engine.onBridgeEvent('a', 'dart.detected', {
      visit_id: 'v',
      index: 0,
      source_seq: 0,
      dart: { segment: { name: 'T20', number: 20, bed: 'Triple', multiplier: 3 }, score: 60 },
    })
    expect(last(lenaWs)).toMatchObject({ mySeats: [1], seats: [{ controllerConnected: true }, { controllerConnected: true }] })
    expect(last(lenaWs).game.currentVisitDarts).toHaveLength(1)
    expect(last(hostWs).mySeats).toEqual([0])

    lenaWs.send.mockClear()
    hostWs.send.mockClear()
    await engine.onBridgeEvent('b', 'dart.detected', {
      visit_id: 'v',
      index: 0,
      source_seq: 0,
      dart: { segment: { name: 'S5', number: 5, bed: 'SingleOuter', multiplier: 1 }, score: 5 },
    })
    expect(lenaWs.send.mock.calls.map((c: unknown[]) => JSON.parse(String(c[0])).type)).toContain('notice')
    expect(hostWs.send.mock.calls.map((c: unknown[]) => JSON.parse(String(c[0])).type)).not.toContain('notice')
    const notice = lenaWs.send.mock.calls.map((c: unknown[]) => JSON.parse(String(c[0]))).find((m: { type: string }) => m.type === 'notice')
    expect(notice).toEqual({ type: 'notice', code: 'not_your_turn', boardId: 'b', throwerName: 'Host', throwerBoard: 'Living room' })

    expect(await engine.onUserAction(sessionId, 'lena', { type: 'takeout' })).toEqual({ ok: false, code: 'forbidden' })
  })

  it('everyone sees since when a player has the game closed', async () => {
    const engine: SessionEngine = new SessionEngine(
      store,
      id => {
        pushSnapshot(id, engine)
      },
      undefined,
      pushNotice,
    )
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'host2',
      gameId: 'x01',
      config: x01Module.defaultConfig,
      seats: [
        { name: 'Host', userId: 'host2', controllerUserId: 'host2', boardId: 'c', boardName: 'Living room' },
        { name: 'Lena', userId: 'lena2', controllerUserId: 'lena2', boardId: 'd', boardName: "Lena's place" },
      ],
    })
    const hostWs = sock()
    const lenaWs = sock()
    browserConnections.add(sessionId, hostWs, 'host2')
    browserConnections.add(sessionId, lenaWs, 'lena2')
    browserConnections.remove(sessionId, lenaWs, new Date('2026-10-02T18:00:00.000Z'))
    pushSnapshot(sessionId, engine)
    expect(last(hostWs)).toMatchObject({
      lobbyName: null,
      seats: [
        { controllerConnected: true, disconnectedAt: null },
        { controllerConnected: false, disconnectedAt: '2026-10-02T18:00:00.000Z' },
      ],
    })
  })
})
