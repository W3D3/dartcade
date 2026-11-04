import { describe, it, expect } from 'vitest'
import type { CoachNote, ReviewVisit } from '$shared/coach'
import { defaultVisit, legGroupingLine, legHeading, legSubtitle, legSubtitleShort } from './leg'

describe('leg review text', () => {
  const now = new Date(2025, 10, 5, 22, 0)
  const title = {
    opponents: ['Lena'],
    context: '501 · Friday darts · leg 3',
    finishedAt: new Date(2025, 10, 5, 21, 14).toISOString(),
    won: false,
    winnerName: 'Lena',
    winnerDarts: 21,
  }
  const note = (n: Partial<CoachNote>): CoachNote => ({
    leg: 2,
    visit: 8,
    dart: 2,
    left: 16,
    darts: 1,
    thrown: 'S1',
    better: 'D8',
    betterAimId: 'D8',
    cost: 0.3,
    reason: null,
    book: ['D8'],
    tip: false,
    ...n,
  })

  it('heads the leg and words its subtitles as drawn', () => {
    expect(legHeading(2, ['Lena'])).toBe('Leg 3 vs Lena')
    expect(legHeading(0, [])).toBe('Leg 1 · Solo')
    expect(legSubtitle(title, 18, now)).toBe('501 · double out · Friday darts · today 21:14 · lost, Lena checked out in 21 darts')
    expect(legSubtitle({ ...title, context: 'Ranked 1v1 · leg 1', won: true }, 18, now)).toBe(
      'Ranked 1v1 · double out · today 21:14 · won in 18 darts',
    )
    expect(legSubtitle({ ...title, winnerName: null, winnerDarts: null }, 18, now)).toMatch(/ · no checkout$/)
    expect(legSubtitleShort(title, 18, 71, now)).toBe('501 · today 21:14 · lost · 18 darts · avg 71.0')
    expect(legSubtitleShort({ ...title, context: 'Ranked 1v1 · leg 1' }, 18, null, now)).toBe('Ranked 1v1 · today 21:14 · lost · 18 darts')
    expect(legSubtitleShort({ ...title, winnerName: null, winnerDarts: null }, 18, null, now)).toBe(
      '501 · today 21:14 · no checkout · 18 darts',
    )
  })

  it('opens on the first Bad visit, else the first noted visit, else the first', () => {
    const v = (grade: ReviewVisit['grade'], notes: CoachNote[] = []) => ({ grade, notes })
    expect(defaultVisit([v('great'), v('weak', [note({})]), v('bad')])).toBe(2)
    expect(defaultVisit([v('great'), v('weak', [note({})])])).toBe(1)
    expect(defaultVisit([v('great'), v('ok')])).toBe(0)
  })

  it("adds the leg's grouping to the scoring line, nothing without one", () => {
    expect(legGroupingLine({ spreadMm: 12.2, edgeMm: 3.6 })).toBe(' · grouping 12 mm · edge 4 mm')
    expect(legGroupingLine({ spreadMm: null, edgeMm: 3.6 })).toBe(' · edge 4 mm')
    expect(legGroupingLine({ spreadMm: null, edgeMm: null })).toBe('')
  })
})
