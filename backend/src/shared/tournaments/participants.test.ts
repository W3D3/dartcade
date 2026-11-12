import { describe, expect, it } from 'vitest'
import { cleanEntries, participantProblems, startBlocker, type EntryInput } from './participants.js'

const solo = (...names: string[]): EntryInput[] => names.map(name => ({ name, tag: null, color: null, players: [{ name }] }))
const team = (name: string, ...players: string[]): EntryInput => ({
  name,
  tag: null,
  color: null,
  players: players.map(n => ({ name: n })),
})

describe('cleanEntries', () => {
  it('names a solo entry after its player and trims names', () => {
    expect(cleanEntries([{ name: 'x', tag: 'ab', color: '#9b7bff', players: [{ name: '  Mia   K. ' }] }], 1)).toEqual([
      { name: 'Mia K.', tag: null, color: null, players: [{ name: 'Mia K.' }] },
    ])
  })

  it('cleans a team tag to capitals', () => {
    expect(cleanEntries([{ ...team(' Bar  Flies ', 'Sven'), tag: 'bf' }], 2)[0]).toMatchObject({ name: 'Bar Flies', tag: 'BF' })
  })
})

describe('participantProblems', () => {
  it('accepts a clean list', () => {
    expect(participantProblems(solo('Anna', 'Jonas'), { teamSize: 1, maxEntries: 8 })).toEqual([])
  })

  it('caps the list at the tournament size', () => {
    expect(participantProblems(solo('A', 'B', 'C'), { teamSize: 1, maxEntries: 2 })).toEqual([
      { path: 'body/entries', message: 'at most 2 players' },
    ])
  })

  it('refuses the same player name twice, ignoring case', () => {
    expect(participantProblems(solo('Tom', 'tom'), { teamSize: 1, maxEntries: 8 })).toEqual([
      { path: 'body/entries/1/players/0/name', message: 'two players have this name' },
    ])
  })

  it('refuses a team over its size, a bad tag and a short name', () => {
    const t = { ...team('TT', 'A', 'B', 'C'), tag: 'T1' }
    expect(participantProblems([t], { teamSize: 2, maxEntries: 8 }).map(p => p.path)).toEqual([
      'body/entries/0/players',
      'body/entries/0/name',
      'body/entries/0/tag',
    ])
  })

  it('refuses an id listed twice', () => {
    const list = [
      {
        ...team('Owls'),
        players: [
          { id: 'p1', name: 'A' },
          { id: 'p1', name: 'B' },
        ],
      },
    ]
    expect(participantProblems(list, { teamSize: 2, maxEntries: 8 })).toEqual([
      { path: 'body/entries/0/players/1', message: 'listed twice' },
    ])
  })
})

describe('startBlocker', () => {
  it('needs two entries', () => {
    expect(startBlocker(solo('Anna'), 1)).toBe('Add at least 2 players before you can start.')
  })

  it('names the one team with an empty spot', () => {
    expect(startBlocker([team('Treble Trouble', 'A', 'B', 'C'), team('Bar Flies', 'S', 'L')], 3)).toBe(
      'Bar Flies still needs a 3rd player before you can start.',
    )
  })

  it('counts the empty spots of several teams', () => {
    expect(startBlocker([team('Owls', 'A', 'B', 'C'), team('Flies', 'S', 'L'), team('Dutch')], 4)).toBe(
      'Every team needs 4 players before you can start. 7 spots are still empty.',
    )
  })

  it('lets full teams start', () => {
    expect(startBlocker([team('Owls', 'A', 'B'), team('Flies', 'S', 'L')], 2)).toBeNull()
  })
})
