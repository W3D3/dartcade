import { describe, it, expect } from 'vitest'
import { holeJustFinished, scorecardRows, teeOffLine } from '$lib/minigolf/scorecard'

const players = [{ name: 'Anna' }, { name: 'Ben' }]

describe('minigolf scorecard', () => {
  it('ranks players by total and colours each hole against par', () => {
    const rows = scorecardRows(
      [
        [3, 1],
        [4, 3],
        [null, null],
      ],
      [2, 3, 3],
      players,
    )
    expect(rows.map(r => [r.name, r.total, r.toPar])).toEqual([
      ['Ben', 4, '−1'],
      ['Anna', 7, '+2'],
    ])
    expect(rows[0].cells).toEqual([
      { text: '1', tone: 'under', ace: true },
      { text: '3', tone: 'par', ace: false },
      { text: '·', tone: 'none', ace: false },
    ])
    expect(rows[1].cells[0]).toEqual({ text: '3', tone: 'over', ace: false })
  })

  it('opens when the game moves to a new hole, not on the first snapshot', () => {
    expect(holeJustFinished(null, 1)).toBe(false)
    expect(holeJustFinished(0, 0)).toBe(false)
    expect(holeJustFinished(0, 1)).toBe(true)
  })

  it('says who tees off and why', () => {
    expect(teeOffLine('Lena', true)).toBe('Lena tees off first: best score on the last hole.')
    expect(teeOffLine('Lena', false)).toBe('Lena tees off first.')
  })
})
