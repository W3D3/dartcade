import { describe, expect, it } from 'vitest'
import { boardLine, defaultBoard, firstChoices, pickable, type PlayBoard } from './play'

const board = (id: string, state: PlayBoard['state'], matchKey: string | null = null): PlayBoard => ({ id, name: id, state, matchKey })

describe('play boards', () => {
  const boards = [board('b1', 'free'), board('b2', 'in_use', 'R1M2'), board('b3', 'offline'), board('b4', 'free')]

  it('only a free board can be picked', () => {
    expect(boards.map(pickable)).toEqual([true, false, false, true])
  })

  it('preselects the board used last when it is free, else the first free one, else no board', () => {
    expect(defaultBoard(boards, 'b4')).toBe('b4')
    expect(defaultBoard(boards, 'b2')).toBe('b1')
    expect(defaultBoard(boards, null)).toBe('b1')
    expect(defaultBoard([board('b2', 'in_use'), board('b3', 'offline')], 'b2')).toBeNull()
  })

  it('says why a board is or is not offered', () => {
    expect(boardLine(boards[0], 'b1', null)).toBe('Free · last used on this device')
    expect(boardLine(boards[3], 'b1', null)).toBe('Free')
    expect(boardLine(boards[1], null, 'QF 2, Mia K. vs Paul')).toBe('In use · QF 2, Mia K. vs Paul')
    expect(boardLine(boards[1], null, null)).toBe('In use · another game')
    expect(boardLine(boards[2], null, null)).toBe('Offline')
  })

  it('offers a bull off or either side first', () => {
    expect(firstChoices(['Sven', 'Lea'])).toEqual([
      { id: 'bull_off', label: 'Bull-off' },
      { id: 'a', label: 'Sven' },
      { id: 'b', label: 'Lea' },
    ])
  })
})
