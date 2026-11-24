import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS, apiQuery, csvHref, filtersToQuery, isFiltered, pageCount, parseFilters, rangeBounds } from './activityGames'

const NOW = Date.UTC(2026, 10, 15, 12)

describe('the filters in the URL', () => {
  it('writes nothing for the defaults', () => {
    expect(filtersToQuery(DEFAULT_FILTERS)).toBe('')
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false)
    expect(isFiltered({ ...DEFAULT_FILTERS, page: 3 })).toBe(false)
  })

  it('reads back what it wrote', () => {
    const f = {
      ...DEFAULT_FILTERS,
      users: [
        { id: 'u1', side: 'in' as const },
        { id: 'u2', side: 'out' as const },
      ],
      countries: [
        { id: 'AT', side: 'in' as const },
        { id: 'none', side: 'out' as const },
      ],
      countryMatch: 'all' as const,
      players: '3-4' as const,
      modes: ['x01', 'cricket'],
      kind: 'ranked' as const,
      status: 'all' as const,
      range: 'custom' as const,
      from: '2026-10-01',
      to: '2026-10-31',
      invalidated: true,
      page: 4,
    }
    expect(parseFilters(filtersToQuery(f))).toEqual(f)
  })

  it('falls back to the defaults for nonsense', () => {
    expect(parseFilters('kind=zzz&players=9&range=x&page=-2&from=nope&users=garbage,i:')).toEqual(DEFAULT_FILTERS)
  })
})

describe('the request', () => {
  it('splits users and countries by side and maps player counts', () => {
    const q = apiQuery(
      {
        ...DEFAULT_FILTERS,
        users: [
          { id: 'a', side: 'in' },
          { id: 'b', side: 'in' },
          { id: 'c', side: 'out' },
        ],
        players: '5+',
        range: 'all',
      },
      NOW,
    )
    expect(q).toMatchObject({
      usersIn: 'a,b',
      usersOut: 'c',
      countriesIn: undefined,
      minPlayers: 5,
      maxPlayers: undefined,
      includeInvalidated: false,
    })
    expect(q.from).toBeUndefined()
  })

  it('counts a preset back from today and makes a custom end inclusive', () => {
    expect(rangeBounds({ ...DEFAULT_FILTERS, range: '7' }, NOW)).toEqual({
      from: new Date('2026-11-09T00:00:00Z'),
      to: new Date('2026-11-16T00:00:00Z'),
    })
    expect(rangeBounds({ ...DEFAULT_FILTERS, range: 'custom', from: '2026-10-01', to: '2026-10-31' }, NOW)).toEqual({
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-11-01T00:00:00Z'),
    })
  })

  it('links the CSV with the same filters and no page', () => {
    const href = csvHref({ ...DEFAULT_FILTERS, kind: 'ranked', range: 'all', page: 3 }, NOW)
    expect(href).toContain('/api/admin/activity/games.csv?')
    expect(href).toContain('kind=ranked')
    expect(href).not.toContain('page')
  })
})

it('counts pages, at least one', () => {
  expect(pageCount(0, 25)).toBe(1)
  expect(pageCount(51, 25)).toBe(3)
})
