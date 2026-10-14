import { describe, it, expect } from 'vitest'
import {
  RANK_COUNT,
  expectedScore,
  performance,
  ratingChange,
  seedRating,
  nextRankIndex,
  nextStage,
  rank,
  rankIndexFor,
  rankThreshold,
  sideRating,
  stakes,
} from './ranked.js'

describe('ranks', () => {
  it('six tiers of five stages, 50 RP apart from Wood II to Elite V', () => {
    expect(RANK_COUNT).toBe(30)
    expect(rank(0)).toMatchObject({ name: 'Wood I', min: 0 })
    expect(rank(1)).toMatchObject({ name: 'Wood II', min: 600 })
    expect(rank(5)).toMatchObject({ name: 'Bronze I', min: 800 })
    expect(rank(14)).toMatchObject({ name: 'Silver V', tier: 'Silver', stage: 5, numeral: 'V', min: 1250 })
    expect(rank(15)).toMatchObject({ name: 'Gold I', min: 1300 })
    expect(rank(25)).toMatchObject({ name: 'Elite I', min: 1800 })
    expect(rank(29)).toMatchObject({ name: 'Elite V', min: 2000 })
  })

  it('the rating picks the highest stage reached', () => {
    expect(rank(rankIndexFor(0)).name).toBe('Wood I')
    expect(rank(rankIndexFor(599)).name).toBe('Wood I')
    expect(rank(rankIndexFor(1200)).name).toBe('Silver IV')
    expect(rank(rankIndexFor(1284)).name).toBe('Silver V')
    expect(rank(rankIndexFor(1300)).name).toBe('Gold I')
    expect(rank(rankIndexFor(3000)).name).toBe('Elite V')
  })

  it('promotes at once but drops only 25 RP below the held stage', () => {
    const silverV = rankIndexFor(1250)
    expect(nextRankIndex(silverV, 1301)).toBe(rankIndexFor(1300))
    expect(nextRankIndex(silverV, 1240)).toBe(silverV)
    expect(nextRankIndex(silverV, 1225)).toBe(silverV)
    expect(nextRankIndex(silverV, 1224)).toBe(rankIndexFor(1200))
  })

  it('places by rating alone while placing', () => {
    expect(nextRankIndex(null, 1110)).toBe(rankIndexFor(1100))
  })

  it('the next stage and what is missing to it', () => {
    expect(nextStage(rankIndexFor(1284), 1284)).toEqual({ rank: rank(15), missing: 16 })
    expect(nextStage(29, 2100)).toBeNull()
    expect(rankThreshold(29)).toBe(2000)
  })
})

describe('Elo', () => {
  it('even ratings: an even chance, 16 either way', () => {
    expect(expectedScore(1200, 1200)).toBe(0.5)
    expect(stakes(1200, 1200)).toEqual({ win: 16, loss: 16 })
  })

  it('beating a higher-rated player pays more', () => {
    const s = stakes(1284, 1301)
    expect(s.win).toBeGreaterThan(16)
    expect(s.loss).toBeLessThan(16)
    expect(s.win + s.loss).toBe(32)
  })

  it('once ranked, only the result counts', () => {
    expect(ratingChange({ rating: 1200, opponent: 1200, won: true, placing: false, performance: 0 })).toBe(16)
    expect(ratingChange({ rating: 1200, opponent: 1200, won: false, placing: false, performance: 1 })).toBe(-16)
  })

  it('never zero, even against a far weaker side', () => {
    expect(stakes(2400, 800).win).toBe(1)
  })

  it('a duo is rated on its average', () => {
    expect(sideRating([1241, 1198])).toBe(1220)
    expect(sideRating([1284])).toBe(1284)
  })
})

describe('placement', () => {
  const placing = (won: boolean, perf: number | null, rating = 1200, opponent = 1200) =>
    ratingChange({ rating, opponent, won, placing: true, performance: perf })

  it('starts from the X01 average, 50/3 RP a point, within Wood II and Elite I', () => {
    expect(seedRating(null)).toBe(1200)
    expect(seedRating(0)).toBe(1200)
    expect(seedRating(30)).toBe(800)
    expect(seedRating(45)).toBe(1050)
    expect(seedRating(52)).toBe(1167)
    expect(seedRating(60)).toBe(1300)
    expect(seedRating(10)).toBe(600)
    expect(seedRating(120)).toBe(1800)
  })

  it('measures how a side threw against the other', () => {
    expect(performance(50, 50)).toBe(0.5)
    expect(performance(60, 50)).toBe(0.75)
    expect(performance(80, 50)).toBe(1)
    expect(performance(20, 50)).toBe(0)
  })

  it('70% result, 30% average, at twice the usual pace', () => {
    expect(placing(true, 0.5)).toBe(22) // 64 × (0.85 − 0.5)
    expect(placing(true, 1)).toBe(32)
    expect(placing(false, 0.5)).toBe(-22)
    expect(placing(false, 0.75)).toBe(-18) // outthrew them: loses less
  })

  it('the result alone without averages', () => {
    expect(placing(true, null)).toBe(32)
    expect(placing(false, null)).toBe(-32)
  })

  it('a win never costs RP and a loss never gains any', () => {
    expect(placing(true, 0, 1600, 900)).toBe(1)
    expect(placing(false, 1, 900, 1600)).toBe(-1)
  })
})
