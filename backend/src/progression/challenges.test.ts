import { describe, expect, it } from 'vitest'
import {
  type ChallengeContext,
  type ChallengeGame,
  applyGame,
  challengeTitle,
  generateChallenge,
  generateSet,
  inPeriod,
  LEG_DART_LIMIT,
  legDartLimit,
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
  boardDarts: 30,
  visits: [],
  checkouts: [],
  legResults: [],
  maxDeficit: 0,
  average: 60,
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

  it('keeps a leg win run across games, broken by a lost leg', () => {
    let c = { templateId: 'w.leg-run', progress: 0, state: {} }
    for (const [id, legResults] of [
      ['a', [true, false]],
      ['b', [true]],
      ['c', [true, true, false]],
    ] as const) {
      c = { ...c, ...applyGame(c, game({ id, legResults: [...legResults] }))! }
    }
    expect(c.progress).toBe(3)
  })

  it('counts six darts in a row in the same segment, across visits', () => {
    const seg = (n: number, m: number) => ({ n, m })
    const visit = (...segs: { n: number; m: number }[]) => ({ leg: 0, segs, scored: null, bust: false })
    const c = { templateId: 'd.six-same', progress: 0, state: {} }
    const five = [visit(seg(20, 1), seg(20, 1), seg(20, 1)), visit(seg(20, 1), seg(20, 1), seg(5, 1))]
    expect(applyGame(c, game({ visits: five }))!.progress).toBe(0)
    const six = [visit(seg(20, 1), seg(20, 1), seg(20, 1)), visit(seg(20, 1), seg(20, 1), seg(20, 1))]
    expect(applyGame(c, game({ visits: six }))!.progress).toBe(1)
    const mixed = [visit(seg(20, 3), seg(20, 3), seg(20, 1)), visit(seg(20, 3), seg(20, 3), seg(20, 3))]
    expect(applyGame(c, game({ visits: mixed }))!.progress).toBe(0)
  })

  it('names the doubles hit so far', () => {
    const D = (n: number) => ({ n, m: 2 })
    const c = { templateId: 'd.ten-doubles', progress: 0, state: {} }
    const after = applyGame(c, game({ visits: [{ leg: 0, segs: [D(20), D(16), D(20)], scored: null, bust: false }] }))!
    expect(after.progress).toBe(2)
    expect(challengeTitle({ templateId: c.templateId, target: 10, state: after.state })).toBe('Hit 10 different doubles (D20, D16)')
  })

  it('sets the leg dart limit by average class, at every class boundary', () => {
    const classes = Object.keys(LEG_DART_LIMIT).map(Number)
    expect(classes).toEqual(Array.from({ length: 17 }, (_, i) => 20 + 5 * i))
    classes.forEach((c, i) => {
      expect(legDartLimit(c)).toBe(LEG_DART_LIMIT[c])
      expect(legDartLimit(c + 4.9)).toBe(LEG_DART_LIMIT[c])
      // Just under a class is the class below (the lowest has nothing below it)
      expect(legDartLimit(c - 0.1)).toBe(LEG_DART_LIMIT[classes[Math.max(0, i - 1)]])
      // Better classes never get a longer limit
      if (i > 0) expect(LEG_DART_LIMIT[c]).toBeLessThanOrEqual(LEG_DART_LIMIT[classes[i - 1]])
    })
    expect(legDartLimit(19.9)).toBe(45)
    expect(legDartLimit(135)).toBe(18)
    expect(legDartLimit(null)).toBe(36)
    const hard = { templateId: 'd.leg-limit', progress: 0, state: { limit: 24 } }
    const checkout = { last: { n: 16, m: 2 }, value: 32, darts: 24, startScore: 501 }
    expect(applyGame(hard, game({ checkouts: [checkout] }))!.progress).toBe(1)
    expect(applyGame(hard, game({ checkouts: [{ ...checkout, darts: 27 }] }))!.progress).toBe(0)
  })

  it('counts bullseyes and two trebles in a visit', () => {
    const bull = { templateId: 'd.bullseye', progress: 0, state: {} }
    expect(applyGame(bull, game({ visits: [{ leg: 0, segs: [{ n: 25, m: 2 }], scored: null, bust: false }] }))!.progress).toBe(1)
    const two = { templateId: 'd.two-trebles', progress: 0, state: {} }
    const T = (n: number) => ({ n, m: 3 })
    expect(applyGame(two, game({ visits: [{ leg: 0, segs: [T(20), T(20), { n: 1, m: 1 }], scored: null, bust: false }] }))!.progress).toBe(
      1,
    )
  })

  it('reads visits and checkouts', () => {
    const run = [140, 180, 140].map(scored => ({ leg: 0, segs: [T20, T20, T20], scored, bust: false }))
    expect(applyGame({ templateId: 'd.140-run', progress: 0, state: {} }, game({ visits: run }))!.progress).toBe(1)
    const checkout = { last: { n: 16, m: 2 }, value: 32, darts: 18, startScore: 501 }
    expect(applyGame({ templateId: 'd.d16', progress: 0, state: {} }, game({ checkouts: [checkout] }))!.progress).toBe(1)
    expect(
      applyGame({ templateId: 'w.big-checkout', progress: 0, state: {} }, game({ checkouts: [{ ...checkout, value: 60 }] }))!.progress,
    ).toBe(1)
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
