import { describe, expect, it } from 'vitest'
import { matchTitle, placeLabel, quarterOf } from './mine.js'

describe('quarterOf', () => {
  it('names the calendar quarter and starts it on its first day', () => {
    expect(quarterOf(new Date('2026-11-12T10:00:00Z'))).toEqual({ label: 'Q4 2026', start: new Date('2026-10-01T00:00:00Z') })
    expect(quarterOf(new Date('2026-03-31T23:59:59Z')).label).toBe('Q1 2026')
    expect(quarterOf(new Date('2026-07-01T00:00:00Z')).start).toEqual(new Date('2026-07-01T00:00:00Z'))
  })
})

describe('placeLabel', () => {
  it('uses ordinals for the podium and round robins', () => {
    expect(placeLabel(1, 'single_elimination')).toBe('1st')
    expect(placeLabel(2, 'double_elimination')).toBe('2nd')
    expect(placeLabel(3, 'single_elimination')).toBe('3rd')
    expect(placeLabel(4, 'round_robin')).toBe('4th')
    expect(placeLabel(11, 'round_robin')).toBe('11th')
    expect(placeLabel(22, 'groups_knockout')).toBe('22nd')
  })
  it('names the round a single elimination player went out in', () => {
    expect(placeLabel(5, 'single_elimination')).toBe('QF')
    expect(placeLabel(9, 'single_elimination')).toBe('Last 16')
    expect(placeLabel(17, 'single_elimination')).toBe('Last 32')
    expect(placeLabel(7, 'single_elimination')).toBe('7th')
  })
})

describe('matchTitle', () => {
  it('names a match by its bracket', () => {
    expect(matchTitle({ bracket: 'main', group: null, round: 2 }, 3)).toBe('Semi-final')
    expect(matchTitle({ bracket: 'main', group: null, round: 1 }, 3)).toBe('Quarter-final')
    expect(matchTitle({ bracket: 'main', group: null, round: 3 }, 3)).toBe('Final')
    expect(matchTitle({ bracket: 'main', group: null, round: 1 }, 5)).toBe('Round 1')
    expect(matchTitle({ bracket: 'group', group: 2, round: 1 }, 0)).toBe('Group 2')
    expect(matchTitle({ bracket: 'final', group: null, round: 1 }, 3)).toBe('Grand final')
  })
})
