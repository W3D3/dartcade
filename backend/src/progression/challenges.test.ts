import { describe, expect, it } from 'vitest'
import {
  type ChallengeContext,
  type ChallengeGame,
  applyGame,
  challengeTitle,
  generateChallenge,
  generateSet,
  inPeriod,
  metricOf,
  periodEnd,
  periodKey,
  scaledTarget,
  templateById,
  TEMPLATES,
} from './challenges.js'

const ctx: ChallengeContext = { dartsPerDay: null, gamesPerDay: null, bestAverage: null, untriedModes: [] }
const game = (over: Partial<ChallengeGame> = {}): ChallengeGame => ({
  id: 'g1',
  mode: 'x01',
  qualifies: true,
  won: true,
  vsHuman: true,
  ranked: false,
  lobby: true,
  boardDarts: 30,
  visits: [],
  checkouts: [],
  legsLost: 0,
  maxDeficit: 0,
  average: 60,
  people: ['bob'],
  ...over,
})

describe('generateSet', () => {
  const sets = (period: 'daily' | 'weekly', c = ctx) =>
    Array.from({ length: 300 }, (_, i) => generateSet(`user${i}`, period, '2026-10-21', c))

  it('is the same for the same user and period', () => {
    expect(generateSet('ann', 'daily', '2026-10-21', ctx)).toEqual(generateSet('ann', 'daily', '2026-10-21', ctx))
    expect(generateSet('ann', 'daily', '2026-10-21', ctx)).not.toEqual(generateSet('ann', 'daily', '2026-10-22', ctx))
  })

  it('never holds more than one hard challenge, and one about half the time', () => {
    for (const period of ['daily', 'weekly'] as const) {
      const hard = sets(period).map(s => s.filter(c => c.difficulty === 'hard').length)
      expect(Math.max(...hard)).toBe(1)
      const share = hard.filter(h => h === 1).length / hard.length
      expect(share).toBeGreaterThan(0.35)
      expect(share).toBeLessThan(0.65)
    }
  })

  it('makes slot 1 easy and slot 2 medium', () => {
    for (const s of sets('weekly')) expect(s.map(c => c.difficulty).slice(0, 2)).toEqual(['easy', 'medium'])
  })

  it('uses a metric once per set', () => {
    for (const s of [...sets('daily'), ...sets('weekly')]) expect(new Set(s.map(c => metricOf(c.templateId))).size).toBe(3)
  })

  it('pays by period and difficulty', () => {
    for (const s of sets('daily')) for (const c of s) expect(c.xp).toBe({ easy: 40, medium: 75, hard: 125 }[c.difficulty])
  })

  it('offers a mode you have not played lately in slot 1, sometimes', () => {
    const tries = sets('daily', { ...ctx, untriedModes: ['atc'] }).filter(s => s[0].templateId === 'd.try.atc')
    expect(tries.length).toBeGreaterThan(100)
    expect(challengeTitle(tries[0][0])).toBe('Play a game of Around the Clock')
  })

  it('only offers beating your average when you have one', () => {
    const ids = sets('weekly').flatMap(s => s.map(c => c.templateId))
    expect(ids).not.toContain('w.beat-average')
    const withAvg = sets('weekly', { ...ctx, bestAverage: 61.5 }).flatMap(s => s.filter(c => c.templateId === 'w.beat-average'))
    expect(withAvg[0].state).toEqual({ threshold: 61.5 })
    expect(challengeTitle(withAvg[0])).toBe('Beat your best 3-dart average of the last 30 days (61.5)')
  })
})

describe('reroll', () => {
  it('gives another challenge of the same difficulty, avoiding the other slots', () => {
    const set = generateSet('ann', 'daily', '2026-10-21', ctx)
    const others = set.filter(c => c.slot !== 2).map(c => metricOf(c.templateId))
    const rerolled = generateChallenge('ann', 'daily', '2026-10-21', 2, 1, ctx, others, set[1].difficulty)
    expect(rerolled.difficulty).toBe(set[1].difficulty)
    expect(others).not.toContain(metricOf(rerolled.templateId))
  })
})

describe('scaledTarget', () => {
  const darts = templateById('d.darts')!
  it('keeps the base for a new player', () => {
    expect(scaledTarget(darts, ctx)).toBe(100)
  })
  it('scales between half and twice the base, with a floor', () => {
    expect(scaledTarget(darts, { ...ctx, dartsPerDay: 150 })).toBe(150)
    expect(scaledTarget(darts, { ...ctx, dartsPerDay: 1000 })).toBe(200)
    expect(scaledTarget(darts, { ...ctx, dartsPerDay: 5 })).toBe(50)
    expect(scaledTarget(templateById('d.games')!, { ...ctx, gamesPerDay: 0.2 })).toBe(2)
  })
})

describe('applyGame', () => {
  const T20 = { n: 20, m: 3 }
  it('counts a game once', () => {
    const c = { templateId: 'd.darts', progress: 10, state: {} }
    const after = applyGame(c, game())!
    expect(after.progress).toBe(40)
    expect(applyGame({ ...c, ...after }, game())).toBeNull()
  })

  it('remembers distinct values across games', () => {
    let c = { templateId: 'w.modes', progress: 0, state: {} }
    for (const [id, mode] of [
      ['g1', 'x01'],
      ['g2', 'x01'],
      ['g3', 'atc'],
    ]) {
      c = { ...c, ...applyGame(c, game({ id, mode }))! }
    }
    expect(c.progress).toBe(2)
  })

  it('keeps a win run, broken by a loss to a human', () => {
    let c = { templateId: 'w.win-run', progress: 0, state: {} }
    for (const [id, won] of [
      ['a', true],
      ['b', false],
      ['c', true],
      ['d', true],
    ] as const) {
      c = { ...c, ...applyGame(c, game({ id, won }))! }
    }
    expect(c.progress).toBe(2)
  })

  it('reads visits and checkouts', () => {
    const run = [140, 180, 140].map(scored => ({ leg: 0, segs: [T20, T20, T20], scored, bust: false }))
    expect(applyGame({ templateId: 'd.140-run', progress: 0, state: {} }, game({ visits: run }))!.progress).toBe(1)
    const checkout = { last: { n: 16, m: 2 }, value: 32, darts: 18, startScore: 501 }
    expect(applyGame({ templateId: 'd.d16', progress: 0, state: {} }, game({ checkouts: [checkout] }))!.progress).toBe(1)
    expect(applyGame({ templateId: 'd.leg21', progress: 0, state: {} }, game({ checkouts: [checkout] }))!.progress).toBe(1)
    const bull = { ...checkout, last: { n: 25, m: 2 } }
    expect(applyGame({ templateId: 'd.bull', progress: 0, state: {} }, game({ checkouts: [bull] }))!.progress).toBe(1)
  })

  it('knows every template it generates', () => {
    for (const t of TEMPLATES) expect(templateById(t.id)?.id).toBe(t.id)
  })
})

describe('periods', () => {
  it('keys a day by its date and a week by its Monday', () => {
    expect(periodKey('daily', '2026-10-21')).toBe('2026-10-21')
    expect(periodKey('weekly', '2026-10-21')).toBe('2026-10-19')
    expect(periodKey('weekly', '2026-10-19')).toBe('2026-10-19')
    expect(periodKey('weekly', '2026-10-25')).toBe('2026-10-19')
    expect(periodEnd('weekly', '2026-10-19')).toBe('2026-10-26')
    expect(inPeriod('weekly', '2026-10-19', '2026-10-25')).toBe(true)
    expect(inPeriod('weekly', '2026-10-19', '2026-10-26')).toBe(false)
  })
})
