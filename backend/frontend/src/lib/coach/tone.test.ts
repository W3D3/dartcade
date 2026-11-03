import { describe, it, expect } from 'vitest'
import { groupingPill } from './tone'

describe('groupingPill', () => {
  it("pills the server's comment: Great and Good in the grade tones, Scattered weak, null without one", () => {
    expect(groupingPill({ comment: { level: 'great', text: 'Great grouping' } })).toEqual({ label: 'Great grouping', tone: 'solid' })
    expect(groupingPill({ comment: { level: 'good', text: 'Good grouping' } })).toEqual({ label: 'Good grouping', tone: 'good' })
    expect(groupingPill({ comment: { level: 'scattered', text: 'Scattered' } })).toEqual({ label: 'Scattered', tone: 'weak' })
    expect(groupingPill({ comment: null })).toBeNull()
    expect(groupingPill(null)).toBeNull()
  })
})
