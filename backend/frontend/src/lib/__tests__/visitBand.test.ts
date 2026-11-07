import { describe, it, expect } from 'vitest'
import { visitFx, isBigDart, x01Band, atcBand, atcAdvanced, shouldReplay, bigDartIndex, ownedBand } from '../visitBand.js'

const d = (score: number) => ({ segment: { name: 'x' }, score })

describe('visitFx', () => {
  it('ton plus from 100 to 179, maximum at 180', () => {
    expect([99, 100, 179, 180].map(visitFx)).toEqual(['none', 'ton', 'ton', 'max'])
  })
})

describe('isBigDart', () => {
  it('is 50 or more', () => {
    expect([49, 50, 60].map(isBigDart)).toEqual([false, true, true])
  })
})

describe('x01Band', () => {
  it('shows the sum', () => {
    expect(x01Band({ darts: [d(60)], bust: false })).toEqual({
      eyebrow: 'This visit',
      sum: '60',
      fx: 'none',
      bigDart: true,
      bust: false,
    })
  })

  it('celebrates a ton and a maximum', () => {
    expect(x01Band({ darts: [d(60), d(60), d(20)], bust: false })).toMatchObject({
      eyebrow: 'Ton plus',
      fx: 'ton',
      bigDart: false,
    })
    expect(x01Band({ darts: [d(60), d(60), d(60)], bust: false })).toMatchObject({ eyebrow: 'Maximum', fx: 'max', sum: '180' })
  })

  it('uses the points actually scored when known (darts before opening do not count)', () => {
    expect(x01Band({ darts: [d(60), d(60), d(60)], bust: false, scored: 0 })).toMatchObject({
      sum: '0',
      eyebrow: 'This visit',
      fx: 'none',
      bigDart: false,
    })
  })

  it('a bust never celebrates', () => {
    expect(x01Band({ darts: [d(60), d(60)], bust: true })).toMatchObject({
      eyebrow: 'Bust',
      fx: 'none',
      bigDart: false,
      bust: true,
    })
  })
})

describe('atcBand', () => {
  it('shows targets advanced', () => {
    expect(atcBand({ advanced: 1 })).toEqual({
      eyebrow: 'This visit',
      sum: '+1',
      fx: 'none',
      bigDart: false,
      bust: false,
    })
  })
})

describe('atcAdvanced', () => {
  it('is progress since the visit started', () => expect(atcAdvanced(7, 5, [true, true])).toBe(2))
  it('counts hits when the start is unknown (after a reload)', () => expect(atcAdvanced(7, null, [true, false, true])).toBe(2))
  it('never goes negative', () => expect(atcAdvanced(3, 5, [])).toBe(0))
})

describe('shouldReplay', () => {
  const band = (sum: string, fx: 'none' | 'ton' | 'max' = 'ton', bigDart = false) => ({
    ...x01Band({ darts: [], bust: false }),
    sum,
    fx,
    bigDart,
  })
  it('replays when a celebrating sum goes up', () => expect(shouldReplay(100, band('140'))).toBe(true))
  it('not when an undo brings the sum down', () => expect(shouldReplay(140, band('100'))).toBe(false))
  it('not for a calm visit', () => expect(shouldReplay(20, band('45', 'none'))).toBe(false))
  it('a big dart replays', () => expect(shouldReplay(0, band('60', 'none', true))).toBe(true))
  it('not on the first snapshot', () => expect(shouldReplay(null, band('140'))).toBe(false))
})

describe('bigDartIndex', () => {
  const d = (score: number) => ({ segment: { name: 'x' }, score })
  it('is the last dart when it is worth 50 or more', () => expect(bigDartIndex([d(1), d(60)], { opened: true, bust: false })).toBe(1))
  it('none before opening or on a bust', () => {
    expect(bigDartIndex([d(60)], { opened: false, bust: false })).toBeNull()
    expect(bigDartIndex([d(60)], { opened: true, bust: true })).toBeNull()
  })
  it('none for a small last dart', () => expect(bigDartIndex([d(60), d(5)], { opened: true, bust: false })).toBeNull())
})

describe('ownedBand', () => {
  const dart = (score: number) => ({ score })
  it('names the thrower on a plain visit', () => {
    expect(ownedBand(x01Band({ darts: [dart(20)], bust: false }), 'Marco').eyebrow).toBe("Marco's visit")
  })
  it('keeps a bust and a celebration as they are', () => {
    const bust = x01Band({ darts: [dart(60)], bust: true })
    const ton = x01Band({ darts: [dart(60), dart(60)], bust: false })
    expect(ownedBand(bust, 'Marco')).toBe(bust)
    expect(ownedBand(ton, 'Marco')).toBe(ton)
  })
})
