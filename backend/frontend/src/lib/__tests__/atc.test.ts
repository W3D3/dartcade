import { describe, it, expect } from 'vitest'
import { atcTargetLabel, atcCells, atcDone, atcTargetSegment, atcLeaders } from '../atc.js'

const seq = [...Array.from({ length: 20 }, (_, i) => i + 1), 22]

describe('atc helpers', () => {
  it('labels targets', () => {
    expect([14, 21, 22, 23].map(t => atcTargetLabel([...seq.slice(0, 20), 21, 22], t))).toEqual(['14', '25', 'Bull', '✓'])
  })

  it('builds 21 cells with hit, current and todo', () => {
    const cells = atcCells(seq, 14)
    expect(cells).toHaveLength(21)
    expect(cells[12]).toEqual({ label: '13', short: '13', state: 'hit' })
    expect(cells[13]).toEqual({ label: '14', short: '14', state: 'current' })
    expect(cells[14].state).toBe('todo')
    expect(cells[20]).toEqual({ label: 'Bull', short: 'B', state: 'todo' })
  })

  it('all cells are hit once finished', () => {
    expect(atcCells(seq, 23).every(c => c.state === 'hit')).toBe(true)
    expect(atcDone(seq, 23)).toBe(21)
  })

  it('counts done targets', () => {
    expect(atcDone(seq, 14)).toBe(13)
  })

  it('maps targets to board segments', () => {
    expect(atcTargetSegment([...seq.slice(0, 20), 21, 22], 21)).toBe(25)
    expect(atcTargetSegment(seq, 22)).toBe(50)
    expect(atcTargetSegment(seq, 9)).toBe(9)
    expect(atcTargetSegment(seq, 23)).toBeNull()
    expect(atcTargetSegment(seq, undefined)).toBeNull()
  })

  it('leaders are everyone on the highest count, nobody at zero', () => {
    expect(atcLeaders([13, 8, 16, 16])).toEqual([2, 3])
    expect(atcLeaders([0, 0])).toEqual([])
  })
})
