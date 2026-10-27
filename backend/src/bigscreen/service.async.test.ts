import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BigScreenService, type BigScreenDeps } from './service.js'
import type { PickInput } from './screen.js'
import type { BigScreenMessage } from '../shared/bigScreen.js'

let sessions: PickInput[]
let online: boolean
const sess = (o: Partial<PickInput> & { id: string }): PickInput => ({
  boardIds: ['b1'],
  status: 'active',
  startedAt: Date.now(),
  finishedAt: null,
  invalidated: false,
  ...o,
})
const flush = () => vi.advanceTimersByTimeAsync(0)
const make = (over: Partial<BigScreenDeps> = {}) =>
  new BigScreenService({
    getSessions: () => sessions,
    getSnapshot: id => ({ id }),
    getBoard: () => Promise.resolve({ name: 'B', ownerUserId: 'u1' }),
    isOnline: () => online,
    getPrefs: () => Promise.resolve({}),
    ...over,
  })

beforeEach(() => {
  vi.useFakeTimers()
  sessions = []
  online = true
})
afterEach(() => vi.useRealTimers())

describe('BigScreenService async behaviour', () => {
  it('lets the last-triggered push win when lookups resolve in reverse order', async () => {
    const gates: Array<() => void> = []
    const svc = make({
      getBoard: () => new Promise(res => gates.push(() => res({ name: 'B', ownerUserId: 'u1' }))),
    })
    const got: BigScreenMessage[] = []
    svc.add('b1', m => got.push(m)) // push 1 (idle)
    sessions = [sess({ id: 'g1', status: 'finished', finishedAt: Date.now() })]
    svc.onSessionChanged('g1') // push 2 (result)
    gates[1]()
    await flush()
    gates[0]()
    await flush()
    expect(got.at(-1)!.screen.kind).toBe('result')
    // the expiry timer belongs to the final screen
    await vi.advanceTimersByTimeAsync(60_000)
    gates[2]() // the expiry push's own lookup
    await flush()
    expect(got.at(-1)!.screen).toEqual({ kind: 'idle' })
    svc.close()
  })

  it('survives a rejecting lookup and still pushes later', async () => {
    const warn = vi.fn()
    let fail = true
    const svc = make({
      warn,
      getBoard: () => (fail ? Promise.reject(new Error('db down')) : Promise.resolve({ name: 'B', ownerUserId: 'u1' })),
    })
    const got: BigScreenMessage[] = []
    svc.add('b1', m => got.push(m))
    await flush()
    expect(warn).toHaveBeenCalledOnce()
    expect(got).toHaveLength(0)
    fail = false
    svc.onBoardPresence('b1')
    await flush()
    expect(got).toHaveLength(1)
    svc.close()
  })

  it('does not send to a subscriber that left while the push was awaiting', async () => {
    const svc = make()
    const got: BigScreenMessage[] = []
    svc.add('b1', m => got.push(m))()
    await flush()
    expect(got).toHaveLength(0)
  })

  it('sends the new online flag on board presence', async () => {
    const svc = make()
    const got: BigScreenMessage[] = []
    svc.add('b1', m => got.push(m))
    await flush()
    online = false
    svc.onBoardPresence('b1')
    await flush()
    expect(got.map(m => m.board.online)).toEqual([true, false])
    svc.close()
  })

  it('shows idle when the picked session has no snapshot', async () => {
    sessions = [sess({ id: 'g1' })]
    const svc = make({ getSnapshot: () => undefined })
    const got: BigScreenMessage[] = []
    svc.add('b1', m => got.push(m))
    await flush()
    expect(got[0].screen).toEqual({ kind: 'idle' })
    svc.close()
  })
})
