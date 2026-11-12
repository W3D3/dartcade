import { describe, expect, it, vi } from 'vitest'
import { api } from '$lib/api'
import { byLine, friendsInLine, loadBrowse, gameLine, gamePill, matches, spots, type BrowseFilter, type Chip } from './browse'

const cup = {
  kind: 'community',
  status: 'open',
  teamSize: 1,
  gameId: 'x01',
  name: 'Pub Pairs Showdown',
  owner: { id: 'n', name: 'Nico' },
} as const
const filter = (chips: Chip[] = [], rest: Partial<BrowseFilter> = {}): BrowseFilter => ({
  kind: 'all',
  chips: new Set(chips),
  query: '',
  ...rest,
})

describe('matches', () => {
  it('keeps everything with no filter on', () => {
    expect(matches(cup, filter())).toBe(true)
  })

  it('filters by kind', () => {
    expect(matches(cup, filter([], { kind: 'official' }))).toBe(false)
    expect(matches(cup, filter([], { kind: 'community' }))).toBe(true)
  })

  it('widens within a group and narrows across groups', () => {
    expect(matches(cup, filter(['teams']))).toBe(false)
    expect(matches(cup, filter(['solo', 'teams']))).toBe(true)
    expect(matches(cup, filter(['solo', 'cricket']))).toBe(false)
    expect(matches(cup, filter(['solo', 'cricket', 'x01']))).toBe(true)
  })

  it('keeps open now to tournaments taking registrations', () => {
    expect(matches(cup, filter(['open']))).toBe(true)
    expect(matches({ ...cup, status: 'running' }, filter(['open']))).toBe(false)
  })

  it('searches the name and the organizer', () => {
    expect(matches(cup, filter([], { query: ' pairs ' }))).toBe(true)
    expect(matches(cup, filter([], { query: 'nico' }))).toBe(true)
    expect(matches(cup, filter([], { query: 'cricket' }))).toBe(false)
  })
})

it('friendsInLine names two friends and counts the rest', () => {
  expect(friendsInLine([])).toBe('')
  expect(friendsInLine(['Lena'])).toBe('Lena is in')
  expect(friendsInLine(['Lena', 'Max'])).toBe('Lena and Max are in')
  expect(friendsInLine(['Lena', 'Max', 'Anna'])).toBe('Lena, Max and 1 friend are in')
  expect(friendsInLine(['Lena', 'Max', 'Anna', 'Tom'])).toBe('Lena, Max and 2 friends are in')
})

it('spots counts what is left and says Full', () => {
  expect(spots({ entries: 27, maxEntries: 32 })).toEqual({ left: '5 spots left', full: false, percent: 84 })
  expect(spots({ entries: 7, maxEntries: 8 }).left).toBe('1 spot left')
  expect(spots({ entries: 8, maxEntries: 8 })).toEqual({ left: 'Full', full: true, percent: 100 })
})

it('describes the game and the organizer', () => {
  expect(gamePill('x01', { startScore: 501 })).toBe('X01 501')
  expect(gamePill('cricket', { mode: 'cutthroat' })).toBe('Cricket · cut-throat')
  expect(gameLine('x01', { startScore: 501, outMode: 'double' }, 3)).toBe('X01 501 · double out · first to 3')
  expect(byLine({ kind: 'community', owner: { id: 'l', name: 'Lena' }, access: 'friends' })).toBe('by Lena · friends')
  expect(byLine({ kind: 'official', owner: null, access: 'public' })).toBe('Official')
})

it('loadBrowse answers null when the request fails, so the page says it could not load', async () => {
  const spy = vi.spyOn(api, 'GET').mockRejectedValueOnce(new TypeError('Failed to fetch'))
  await expect(loadBrowse()).resolves.toBeNull()
  spy.mockRestore()
})
