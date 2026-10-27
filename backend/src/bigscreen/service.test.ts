import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BigScreenService, type BigScreenDeps } from './service.js'
import type { BigScreenMessage } from '../schema/board-ws.js'

// board -> its running session
let active: Record<string, string | undefined>
let online: boolean
const flush = () => vi.advanceTimersByTimeAsync(0)
const board = (id: string) => ({ name: `Board ${id}`, prefs: { owner: id === 'b1' ? 'u1' : 'u2' } })
const make = (over: Partial<BigScreenDeps> = {}) =>
  new BigScreenService({
    activeOn: b => active[b],
    getSnapshot: id => ({ id }) as never,
    loadBoard: b => Promise.resolve(board(b)),
    isOnline: () => online,
    now: Date.now,
    setTimer: setTimeout,
    warn: () => undefined,
    ...over,
  })
const saved = (invalidated = false) => ({ game: { invalidated }, detail: {}, stats: {} }) as never

let svc: BigScreenService
beforeEach(() => {
  vi.useFakeTimers()
  active = {}
  online = true
  svc = make()
})
afterEach(() => {
  svc.close()
  vi.useRealTimers()
})

describe('BigScreenService', () => {
  it('does no work for a session change while nobody follows', () => {
    const activeOn = vi.fn()
    const loadBoard = vi.fn()
    const idle = make({ activeOn, loadBoard })
    idle.onSessionChanged('g1')
    expect(activeOn).not.toHaveBeenCalled()
    expect(loadBoard).not.toHaveBeenCalled()
  })

  it('sends idle at once, with the owner prefs', async () => {
    const got: BigScreenMessage[] = []
    svc.add('b1', m => got.push(m))
    await flush()
    expect(got).toEqual([
      { type: 'big_screen', board: { id: 'b1', name: 'Board b1', online: true }, prefs: { owner: 'u1' }, screen: { kind: 'idle' } },
    ])
  })

  it('re-sends on a session change, not for other boards, and stops after unsubscribe', async () => {
    const a: BigScreenMessage[] = []
    const b: BigScreenMessage[] = []
    const off = svc.add('b1', m => a.push(m))
    svc.add('b2', m => b.push(m))
    await flush()
    active = { b1: 'g1' }
    svc.onSessionChanged('g1')
    await flush()
    expect(a.at(-1)!.screen).toEqual({ kind: 'game', snapshot: { id: 'g1' } })
    expect(b).toHaveLength(1)
    expect(b[0].prefs).toEqual({ owner: 'u2' })
    off()
    svc.onSessionChanged('g1')
    await flush()
    expect(a).toHaveLength(2)
  })

  it('reads the board and its prefs on every push, so a rename or settings change reaches the screen', async () => {
    let name = 'Old'
    const s = make({ loadBoard: () => Promise.resolve({ name, prefs: {} }) })
    const got: BigScreenMessage[] = []
    s.add('b1', m => got.push(m))
    await flush()
    name = 'New'
    s.onBoardPresence('b1')
    await flush()
    expect(got.map(m => m.board.name)).toEqual(['Old', 'New'])
    s.close()
  })

  it('sends the new online flag on board presence', async () => {
    const got: BigScreenMessage[] = []
    svc.add('b1', m => got.push(m))
    await flush()
    online = false
    svc.onBoardPresence('b1')
    await flush()
    expect(got.map(m => m.board.online)).toEqual([true, false])
  })

  it('closes the subscribers with not found when the board is gone', async () => {
    const close = vi.fn()
    const s = make({ loadBoard: () => Promise.resolve(undefined) })
    s.add('b1', () => undefined, close)
    await flush()
    expect(close).toHaveBeenCalledWith(4404, expect.any(String))
    s.close()
  })

  it('revoke closes only the token subscribers, with the given code', () => {
    const tokenClose = vi.fn()
    const cookieClose = vi.fn()
    svc.add('b1', () => undefined, tokenClose, true)
    svc.add('b1', () => undefined, cookieClose)
    svc.revoke('b1')
    expect(tokenClose).toHaveBeenCalledWith(4403, expect.any(String))
    expect(cookieClose).not.toHaveBeenCalled()
    svc.revoke('b1', 4404)
    expect(tokenClose).toHaveBeenLastCalledWith(4404, expect.any(String))
  })

  it('survives a rejecting lookup and still pushes later', async () => {
    const warn = vi.fn()
    let fail = true
    const s = make({ warn, loadBoard: b => (fail ? Promise.reject(new Error('db down')) : Promise.resolve(board(b))) })
    const got: BigScreenMessage[] = []
    s.add('b1', m => got.push(m))
    await flush()
    expect(warn).toHaveBeenCalledOnce()
    expect(got).toHaveLength(0)
    fail = false
    s.add('b1', m => got.push(m))
    await flush()
    expect(got).toHaveLength(1)
    s.close()
  })

  it('does not send to a subscriber that left while the push was awaiting', async () => {
    const got: BigScreenMessage[] = []
    svc.add('b1', m => got.push(m))()
    await flush()
    expect(got).toHaveLength(0)
  })

  describe('held result', () => {
    it('shows a finished game as a result, then goes idle when the hold ends', async () => {
      const got: BigScreenMessage[] = []
      svc.add('b1', m => got.push(m))
      await flush()
      svc.onGameEnded('g1', ['b1'], Promise.resolve(null))
      await flush()
      expect(got.at(-1)!.screen).toMatchObject({ kind: 'result', snapshot: { id: 'g1' } })
      await vi.advanceTimersByTimeAsync(60_000)
      expect(got.at(-1)!.screen).toEqual({ kind: 'idle' })
    })

    it('drops expired results of boards nobody watches when another game ends', async () => {
      svc.onGameEnded('g1', ['b2'], Promise.resolve(null))
      await vi.advanceTimersByTimeAsync(120_000)
      svc.onGameEnded('g2', ['b1'], Promise.resolve(null))
      expect((svc as unknown as { held: Map<string, unknown> }).held.has('b2')).toBe(false)
    })

    it('holds the result for a screen that connects afterwards', async () => {
      svc.onGameEnded('g1', ['b1'], Promise.resolve(null))
      const got: BigScreenMessage[] = []
      svc.add('b1', m => got.push(m))
      await flush()
      expect(got[0].screen.kind).toBe('result')
    })

    it('a new game replaces the result and cancels the expiry', async () => {
      const got: BigScreenMessage[] = []
      svc.add('b1', m => got.push(m))
      svc.onGameEnded('g1', ['b1'], Promise.resolve(null))
      await flush()
      active = { b1: 'g2' }
      svc.onSessionChanged('g2')
      await flush()
      const n = got.length
      await vi.advanceTimersByTimeAsync(120_000)
      expect(got).toHaveLength(n)
      expect(got.at(-1)!.screen.kind).toBe('game')
    })

    it('goes idle when the finished game has no snapshot any more', async () => {
      const s = make({ getSnapshot: () => undefined })
      s.onGameEnded('g1', ['b1'], Promise.resolve(null))
      const got: BigScreenMessage[] = []
      s.add('b1', m => got.push(m))
      await flush()
      expect(got[0].screen).toEqual({ kind: 'idle' })
      s.close()
    })

    it('an aborted game leaves the board idle', async () => {
      const got: BigScreenMessage[] = []
      active = { b1: 'g1' }
      svc.add('b1', m => got.push(m))
      await flush()
      active = {}
      svc.onGameEnded('g1', ['b1'], null)
      await flush()
      expect(got.at(-1)!.screen).toEqual({ kind: 'idle' })
    })

    it('adds the saved game when it lands, without delaying the result', async () => {
      let land!: (v: unknown) => void
      const got: BigScreenMessage[] = []
      svc.add('b1', m => got.push(m))
      svc.onGameEnded('g1', ['b1'], new Promise(res => (land = res)) as never)
      await flush()
      expect(got.at(-1)!.screen).toMatchObject({ kind: 'result' })
      expect(got.at(-1)!.screen).not.toHaveProperty('detail')
      land(saved())
      await flush()
      expect(got.at(-1)!.screen).toHaveProperty('detail')
    })

    it('drops the result when the saved game is invalidated', async () => {
      const got: BigScreenMessage[] = []
      svc.add('b1', m => got.push(m))
      svc.onGameEnded('g1', ['b1'], Promise.resolve(saved(true)))
      await flush()
      expect(got.at(-1)!.screen).toEqual({ kind: 'idle' })
    })

    it('warns when the saved game cannot be read and still shows the result', async () => {
      const warn = vi.fn()
      const s = make({ warn })
      const got: BigScreenMessage[] = []
      s.add('b1', m => got.push(m))
      s.onGameEnded('g1', ['b1'], Promise.reject(new Error('db down')))
      await flush()
      expect(warn).toHaveBeenCalledOnce()
      expect(got.at(-1)!.screen.kind).toBe('result')
      s.close()
    })
  })
})
