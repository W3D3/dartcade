import { describe, it, expect } from 'vitest'
import { coachFound, legWhen, needsAnotherPage, shouldRefresh, vsLine } from './list'

describe('vsLine', () => {
  it('names the opponents, or Solo without one', () => {
    expect(vsLine(['Lena'])).toBe('vs Lena')
    expect(vsLine(['Max', 'Sophie'])).toBe('vs Max, Sophie')
    expect(vsLine([])).toBe('Solo')
  })
})

describe('legWhen', () => {
  // Wednesday 5 Nov 2025, evening
  const now = new Date(2025, 10, 5, 22, 0)
  const at = (day: number, h = 21, m = 14) => new Date(2025, 10, day, h, m).toISOString()

  it('gives the time today, then Yesterday', () => {
    expect(legWhen(at(5), now)).toBe('Today 21:14')
    expect(legWhen(at(4), now)).toBe('Yesterday')
  })

  it('gives the weekday from 2 to 6 days ago, the date beyond', () => {
    expect(legWhen(at(3), now)).toBe('Mon')
    expect(legWhen(new Date(2025, 9, 30, 21, 0).toISOString(), now)).toBe('Thu')
    expect(legWhen(new Date(2025, 9, 29, 21, 0).toISOString(), now)).toBe('29 Oct')
  })
})

describe('coachFound', () => {
  const row = { missedDoubles: 0, badSetups: 0, lowVisits: 0, clean: false }

  it('pills missed doubles red, then bad setups and low visits yellow, with singulars', () => {
    expect(coachFound({ ...row, missedDoubles: 2, badSetups: 1, lowVisits: 4 })).toEqual([
      { label: '2 missed doubles', tone: 'bad' },
      { label: '1 bad setup', tone: 'weak' },
      { label: '4 low visits', tone: 'weak' },
    ])
    expect(coachFound({ ...row, missedDoubles: 1, lowVisits: 1 })).toEqual([
      { label: '1 missed double', tone: 'bad' },
      { label: '1 low visit', tone: 'weak' },
    ])
  })

  it('shows a clean leg as its green pill alone, even with a lone missed double', () => {
    expect(coachFound({ ...row, clean: true })).toEqual([{ label: 'Clean leg', tone: 'lime' }])
    expect(coachFound({ ...row, missedDoubles: 1, clean: true })).toEqual([{ label: 'Clean leg', tone: 'lime' }])
  })

  it('is empty with nothing found', () => {
    expect(coachFound(row)).toEqual([])
  })
})

describe('asking again while reviews are built', () => {
  it('asks while games are pending, and stops at 0', () => {
    expect(shouldRefresh(3, false)).toBe(true)
    expect(shouldRefresh(0, false)).toBe(false)
  })

  it('never asks while a request is still running (no overlap)', () => {
    expect(shouldRefresh(3, true)).toBe(false)
  })

  it('fetches pages until it has the rows the user had open, keeping their Show more', () => {
    expect(needsAnotherPage(40, 80, 'c2')).toBe(true)
    expect(needsAnotherPage(80, 80, 'c3')).toBe(false)
    expect(needsAnotherPage(40, 15, 'c2')).toBe(false)
    // the list got shorter than what was open: stop at its end
    expect(needsAnotherPage(40, 80, null)).toBe(false)
  })
})
