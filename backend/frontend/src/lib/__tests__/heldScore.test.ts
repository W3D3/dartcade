import { describe, it, expect } from 'vitest'
import { shownScore } from '../heldScore.js'

const d = (score: number) => ({ score })
const visit = { mode: 'visit' as const, thrower: true, locked: false }

describe('shownScore', () => {
  it("'dart' shows the snapshot's score as it is", () => {
    expect(shownScore({ ...visit, mode: 'dart', score: 81, darts: [d(60)], start: 141 })).toBe(81)
  })

  it('holds the score the open visit started from', () => {
    expect(shownScore({ ...visit, score: 81, darts: [d(60)], start: 141 })).toBe(141)
    expect(shownScore({ ...visit, score: 36, darts: [d(60), d(45)], start: 141 })).toBe(141)
  })

  it('an undo or correction mid-visit leaves the held score where it is', () => {
    // T20 then T15 undone: back to 81, still held at 141; T20 corrected to S20: 121, still 141
    expect(shownScore({ ...visit, score: 81, darts: [d(60)], start: 141 })).toBe(141)
    expect(shownScore({ ...visit, score: 121, darts: [d(20)], start: 141 })).toBe(141)
  })

  it('without a known start (page loaded mid-visit) adds the darts back on', () => {
    expect(shownScore({ ...visit, score: 81, darts: [d(60)], start: null })).toBe(141)
  })

  it('a bust or a checkout ends the visit: the real score shows', () => {
    // Bust: the server already put the score back to the visit's start
    expect(shownScore({ ...visit, locked: true, score: 32, darts: [d(20), d(13)], start: 32 })).toBe(32)
    expect(shownScore({ ...visit, locked: true, score: 0, darts: [d(60), d(45), d(36)], start: 141 })).toBe(0)
  })

  it('the third dart ends the visit: the real score shows straight away, before the takeout', () => {
    expect(shownScore({ ...visit, score: 36, darts: [d(60), d(45), d(0)], start: 141 })).toBe(36)
    // Undoing the third dart reopens the visit: held again
    expect(shownScore({ ...visit, score: 36, darts: [d(60), d(45)], start: 141 })).toBe(141)
  })

  it('only the thrower (or the thrower\'s team) is held; the others show their score', () => {
    expect(shownScore({ ...visit, thrower: false, score: 87, darts: [d(60)], start: 141 })).toBe(87)
  })

  it('no darts yet (a new visit or a new leg): the score itself', () => {
    expect(shownScore({ ...visit, score: 501, darts: [], start: 0 })).toBe(501)
    expect(shownScore({ ...visit, score: 81, darts: [], start: 141 })).toBe(81)
  })
})
