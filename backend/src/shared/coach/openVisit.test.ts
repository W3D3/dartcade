import { describe, it, expect } from 'vitest'
import { bestAims, coachOpenVisit } from './openVisit.js'
import { dart, REFS } from './testLegs.js'

const open = (names: string[]) =>
  coachOpenVisit(
    { start: 204, opponent: null, average: 60 },
    names.map(n => dart(n)),
    REFS,
    5,
  )

describe('coachOpenVisit', () => {
  it('on the last dart from 179 offers the 19s, not the T20 whose miss leaves a bogey', () => {
    const { left, next } = open(['S5', 'S20'])
    expect(left).toBe(179)
    const labels = next.map(n => n.aim.label)
    expect(labels[0]).toBe('T19')
    expect(labels).not.toContain('T20')
  })

  it('with two darts left it still offers the T20 from 199', () => {
    expect(open(['S5']).next.map(n => n.aim.label)).toContain('T20')
  })

  it('names the 25, not the bull, for the bull aim on 65 with one dart left', () => {
    const next = bestAims(REFS.model, 65, 65, 1, 1, 5)
    expect(next[0]).toMatchObject({ label: '25' })
    expect(next.map(n => n.label)).toEqual([...new Set(next.map(n => n.label))])
  })
})
