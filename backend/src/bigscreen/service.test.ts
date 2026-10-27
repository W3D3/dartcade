import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BigScreenService } from './service.js'
import type { PickInput } from './screen.js'
import type { BigScreenMessage } from '../shared/bigScreen.js'

let sessions: PickInput[]
let svc: BigScreenService
const sess = (o: Partial<PickInput> & { id: string }): PickInput => ({
  boardIds: ['b1'],
  status: 'active',
  startedAt: Date.now(),
  finishedAt: null,
  invalidated: false,
  ...o,
})
const flush = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
  vi.useFakeTimers()
  sessions = []
  svc = new BigScreenService({
    getSessions: () => sessions,
    getSnapshot: id => ({ id }),
    getBoard: id => Promise.resolve({ name: `Board ${id}`, ownerUserId: id === 'b1' ? 'u1' : 'u2' }),
    isOnline: () => true,
    getPrefs: u => Promise.resolve({ owner: u }),
  })
})
afterEach(() => {
  svc.close()
  vi.useRealTimers()
})

describe('BigScreenService', () => {
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
    sessions = [sess({ id: 'g1' })]
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

  it('goes idle when a held result expires, and a new game cancels the timer', async () => {
    const got: BigScreenMessage[] = []
    sessions = [sess({ id: 'g1', status: 'finished', finishedAt: Date.now() })]
    svc.add('b1', m => got.push(m))
    await flush()
    expect(got.at(-1)!.screen.kind).toBe('result')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(got.at(-1)!.screen).toEqual({ kind: 'idle' })

    sessions = [sess({ id: 'g2', status: 'finished', finishedAt: Date.now() })]
    svc.onSessionChanged('g2')
    await flush()
    sessions = [...sessions, sess({ id: 'g3' })]
    svc.onSessionChanged('g3')
    await flush()
    const n = got.length
    await vi.advanceTimersByTimeAsync(120_000)
    expect(got).toHaveLength(n)
    expect(got.at(-1)!.screen.kind).toBe('game')
  })
})
