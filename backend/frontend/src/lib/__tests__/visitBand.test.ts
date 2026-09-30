import { describe, it, expect } from 'vitest'
import { visitFx, isBigDart, x01Band, atcBand } from '../visitBand.js'

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
  it('shows the sum and what is left', () => {
    expect(x01Band({ darts: [d(60)], left: 81, bust: false })).toEqual({
      eyebrow: 'This visit', progress: '1 of 3 darts', progressShort: '1 of 3', sum: '60',
      afterLabel: 'Left after', after: '81', fx: 'none', bigDart: true, bust: false,
    })
  })

  it('celebrates a ton and a maximum', () => {
    expect(x01Band({ darts: [d(60), d(60), d(20)], left: 361, bust: false })).toMatchObject({ eyebrow: 'Ton plus', fx: 'ton', bigDart: false })
    expect(x01Band({ darts: [d(60), d(60), d(60)], left: 321, bust: false })).toMatchObject({ eyebrow: 'Maximum', fx: 'max', sum: '180' })
  })

  it('uses the points actually scored when known (darts before opening do not count)', () => {
    expect(x01Band({ darts: [d(60), d(60), d(60)], left: 501, bust: false, scored: 0 }))
      .toMatchObject({ sum: '0', eyebrow: 'This visit', fx: 'none', bigDart: false })
  })

  it('a bust never celebrates', () => {
    expect(x01Band({ darts: [d(60), d(60)], left: 101, bust: true })).toMatchObject({ eyebrow: 'Bust', fx: 'none', bigDart: false, bust: true })
  })
})

describe('atcBand', () => {
  it('shows targets advanced and the target now', () => {
    expect(atcBand({ dartCount: 2, advanced: 1, target: '14' })).toEqual({
      eyebrow: 'This visit', progress: '2 of 3 darts', progressShort: '2 of 3', sum: '+1',
      afterLabel: 'Target now', after: '14', fx: 'none', bigDart: false, bust: false,
    })
  })
})
