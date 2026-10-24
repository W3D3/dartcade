import { describe, it, expect } from 'vitest'
import { get, writable } from 'svelte/store'
import { chipMotion, levelView, lineLabel, milestoneLine, streakLine, toastsFor } from '../progress/view.js'
import { createGameGain, createProgress, type Progress } from '../progress/store.js'
import type { XpGainedMessage } from '../api/lobby-ws.js'
import { DEFAULT_EQUIPPED } from '$shared/progression.js'

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
    expect(lineLabel({ kind: 'daily', amount: 160, count: 7 })).toBe('First game of the day · day 7')
    expect(lineLabel({ kind: 'challenge', amount: 40, title: 'Hit 5 trebles' })).toBe('Hit 5 trebles')
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

describe('streak copy', () => {
  it('names the next milestone by its reward, or its XP', () => {
    expect(milestoneLine({ days: 14, xp: 300 })).toBe('Day 14: title Fortnight')
    expect(milestoneLine({ days: 60, xp: 500 })).toBe('Day 60: +500 XP')
  })
  it('shows the streak line when the game paid the daily bonus', () => {
    expect(streakLine([{ kind: 'daily', amount: 200, count: 12 }])).toEqual({ days: 12, bonus: 200 })
    expect(streakLine([{ kind: 'game', amount: 50 }])).toBeNull()
  })
  it('toasts a freeze spent and a milestone reached', () => {
    const t = toastsFor(
      gained({
        lines: [
          { kind: 'daily', amount: 160, count: 7 },
          { kind: 'milestone', amount: 250 },
        ],
        streak: { current: 7, freezes: 1, frozeDay: '2026-10-18', milestone: 7 },
      }),
    )
    expect(t).toEqual([
      { kind: 'freeze', left: 1 },
      { kind: 'milestone', days: 7, xp: 250, perks: [expect.objectContaining({ id: 'picture.flame' })] },
    ])
  })
  it('toasts the streak extended with its bonus, and challenges done', () => {
    const streak = { current: 13, freezes: 0, frozeDay: null, milestone: null }
    expect(toastsFor(gained({ lines: [{ kind: 'daily', amount: 200, count: 13 }], streak }))).toEqual([
      { kind: 'streak', days: 13, bonus: 200 },
    ])
    expect(toastsFor(gained())).toEqual([])
    expect(toastsFor(gained({ challenges: [{ title: 'Throw 100 darts on a board', xp: 40, period: 'daily' }] }))).toEqual([
      { kind: 'challenge', title: 'Throw 100 darts on a board', xp: 40 },
    ])
  })
})

describe('createProgress', () => {
  const streak = {
    current: 0,
    best: 0,
    freezes: 1,
    playedToday: false,
    bonus: 100,
    today: '2026-10-21',
    days: [] as Progress['streak']['days'],
    nextMilestone: { days: 7, xp: 250 },
  }
  const perks = { unlocked: [], equipped: DEFAULT_EQUIPPED }
  const at = (xp: number): Progress => ({ xp, level: 1, streak, challengesToClaim: 3, perks })

  it('reads your progress, shows a push at once and reads again', async () => {
    const xp = writable<XpGainedMessage | null>(null)
    let reads = 0
    const store = createProgress({ xp }, () => Promise.resolve(at(reads++ === 0 ? 100 : 150)))
    const seen: (number | undefined)[] = []
    const stop = store.subscribe(v => seen.push(v?.xp))
    await tick()
    xp.set(gained())
    await tick()
    expect(seen).toEqual([undefined, 100, 150, 150])
    expect(reads).toBe(2)
    stop()
  })

  it('never lets an older read overwrite a newer one', async () => {
    const xp = writable<XpGainedMessage | null>(null)
    const resolvers: ((p: ReturnType<typeof at>) => void)[] = []
    const store = createProgress({ xp }, () => new Promise(r => resolvers.push(r)))
    const stop = store.subscribe(() => undefined)
    xp.set(gained())
    resolvers[1](at(150))
    resolvers[0](at(100))
    await tick()
    expect(get(store)?.xp).toBe(150)
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
    expect(get(store)).toEqual({
      lines: [{ kind: 'game', amount: 50 }],
      total: 50,
      xpBefore: 100,
      xpAfter: 150,
      unlocks: [],
      challenges: [],
    })
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
