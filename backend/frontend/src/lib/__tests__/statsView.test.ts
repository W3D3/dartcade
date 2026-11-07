import { describe, expect, it } from 'vitest'
import type { StatRef } from '$lib/api'
import { compareNote, doubleTotals, rangeNoun, refLine, visitTitle } from '$lib/stats/view'

describe('compareNote', () => {
  it('names the range the arrows compare with and its dates', () => {
    expect(compareNote('legs50', { legs: 50, from: '2026-08-12T20:00:00Z', to: '2026-10-03T20:00:00Z' })).toBe(
      'Arrows compare with the 50 legs before (12 Aug – 3 Oct)',
    )
  })

  it('says when there is nothing to compare with, and nothing for all time', () => {
    expect(compareNote('days30', null)).toBe('Nothing to compare with yet: no legs in the 30 days before')
    expect(compareNote('all', null)).toBeNull()
    expect(rangeNoun('all')).toBe('all time')
    expect(rangeNoun('legs20')).toBe('the last 20 legs')
  })
})

describe('refLine', () => {
  const ref: StatRef = {
    gameId: 'g',
    finishedAt: '2026-10-12T20:00:00Z',
    leg: 2,
    visit: null,
    startScore: 501,
    kind: 'casual',
    opponents: ['Lena'],
  }

  it('names the game, the opponent, the day and the leg', () => {
    expect(refLine(ref)).toBe('501 · vs Lena · 12 Oct · leg 3')
  })

  it('leaves the leg to a visit title, and names ranked and solo games', () => {
    expect(refLine({ ...ref, visit: 2, kind: 'ranked' })).toBe('Ranked 501 · vs Lena · 12 Oct')
    expect(visitTitle({ ...ref, visit: 2 })).toBe('Visit 2 of leg 3')
    expect(refLine({ ...ref, leg: null, kind: 'solo', opponents: [] })).toBe('Solo practice · 12 Oct')
  })
})

describe('doubleTotals', () => {
  it('adds up the darts at a double and the ones that went out', () => {
    expect(
      doubleTotals([
        { target: 'D20', hits: 2, attempts: 5 },
        { target: 'D8', hits: 1, attempts: 3 },
      ]),
    ).toEqual({ hits: 3, attempts: 8 })
  })
})
