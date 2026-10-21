import { describe, it, expect } from 'vitest'
import { get, writable } from 'svelte/store'
import { chipMotion, levelView, lineLabel } from '../progress/view.js'
import { createGameGain, createProgress } from '../progress/store.js'
import type { XpGainedMessage } from '../api/lobby-ws.js'

describe('levelView', () => {
  it('shows the level, how far into it and the XP to go', () => {
    expect(levelView(6780)).toEqual({ level: 14, pct: (540 / 760) * 100, toGo: '220 XP to go', xp: 6780 })
    expect(levelView(0)).toMatchObject({ level: 1, pct: 0, toGo: '240 XP to go' })
  })
})

describe('chipMotion', () => {
  it('fills within a level', () => {
    expect(chipMotion(0, 120)).toEqual({ from: 0, to: 50, levelBefore: 1, levelAfter: 1, levelUp: false })
  })
  it('runs past the end on a level-up', () => {
    expect(chipMotion(200, 300)).toMatchObject({ levelBefore: 1, levelAfter: 2, levelUp: true })
  })
})

describe('lineLabel', () => {
  it('names each line, with its count where it has one', () => {
    expect(lineLabel({ kind: 'dart', amount: 42, count: 42 })).toBe('Darts thrown · 42')
    expect(lineLabel({ kind: 'oneEighty', amount: 50, count: 2 })).toBe('180 × 2')
    expect(lineLabel({ kind: 'oneEighty', amount: 25, count: 1 })).toBe('180')
    expect(lineLabel({ kind: 'win', amount: 100 })).toBe('Win')
  })
})

const gained = (over: Partial<XpGainedMessage> = {}): XpGainedMessage => ({
  type: 'xp.gained',
  sessionId: 'g1',
  lines: [{ kind: 'game', amount: 50 }],
  total: 50,
  xpBefore: 100,
  xpAfter: 150,
  levelBefore: 1,
  levelAfter: 1,
  ...over,
})
const tick = () => new Promise(r => setTimeout(r, 0))

describe('createProgress', () => {
  it('reads the total, then follows the pushes', async () => {
    const xp = writable<XpGainedMessage | null>(null)
    const store = createProgress({ xp }, () => Promise.resolve(100))
    const seen: (number | null)[] = []
    const stop = store.subscribe(v => seen.push(v))
    await tick()
    xp.set(gained())
    expect(seen).toEqual([null, 100, 150])
    stop()
  })
  it('keeps a push over a slower read', async () => {
    const xp = writable<XpGainedMessage | null>(gained())
    let resolve: (n: number) => void = () => undefined
    const store = createProgress({ xp }, () => new Promise<number>(r => (resolve = r)))
    const stop = store.subscribe(() => undefined)
    resolve(100)
    await tick()
    expect(get(store)).toBe(150)
    stop()
  })
})

describe('createGameGain', () => {
  it("takes the game's push, not another game's", async () => {
    const xp = writable<XpGainedMessage | null>(gained({ sessionId: 'other' }))
    const store = createGameGain('g1', { xp }, () => Promise.resolve(null))
    const stop = store.subscribe(() => undefined)
    await tick()
    expect(get(store)).toBeNull()
    xp.set(gained())
    expect(get(store)).toEqual({ lines: [{ kind: 'game', amount: 50 }], total: 50, xpBefore: 100, xpAfter: 150 })
    stop()
  })
  it('falls back to the API after a reload', async () => {
    const xp = writable<XpGainedMessage | null>(null)
    const gain = { lines: [], total: 50, xpBefore: 100, xpAfter: 150 }
    const store = createGameGain('g1', { xp }, () => Promise.resolve(gain))
    const stop = store.subscribe(() => undefined)
    await tick()
    expect(get(store)).toEqual(gain)
    stop()
  })
})
