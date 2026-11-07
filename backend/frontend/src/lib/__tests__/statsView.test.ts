import { describe, expect, it } from 'vitest'
import type { StatRef } from '$lib/api'
import { axis, compareNote, delta, rangeNoun, refLine, sparkPoints } from '$lib/stats/view'

describe('delta', () => {
  it('points up and is good when a higher-is-better number rose', () => {
    expect(delta(68.4, 65.3, 'decimal', 'higher')).toEqual({ text: '▲ 3.1', good: true })
  })

  it('is good when a lower-is-better number fell', () => {
    expect(delta(19.8, 20.7, 'decimal', 'lower')).toEqual({ text: '▼ 0.9', good: true })
  })

  it('gives a share in points', () => {
    expect(delta(0.36, 0.38, 'pts', 'higher')).toEqual({ text: '▼ 2 pts', good: false })
  })

  it('shows nothing without the range before, or when nothing changed', () => {
    expect(delta(4, null, 'count', 'higher')).toBeNull()
    expect(delta(0.361, 0.358, 'pts', 'higher')).toBeNull()
  })
})

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
    expect(refLine({ ...ref, leg: null, kind: 'solo', opponents: [] })).toBe('Solo practice · 12 Oct')
  })
})

describe('chart helpers', () => {
  it('draws a flat line for one value and spans the box for more', () => {
    expect(sparkPoints([5], 150, 34)).toBe('0,17 150,17')
    expect(sparkPoints([1, 3], 150, 34)).toBe('0.0,31.0 150.0,3.0')
  })

  it('rounds an axis out to whole steps', () => {
    expect(axis([43, 115.6], 20)).toEqual({ lo: 40, hi: 120, ticks: [40, 60, 80, 100, 120] })
  })
})
