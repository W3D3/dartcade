import { describe, it, expect } from 'vitest'
import type { GameStats, GameSummary } from '$lib/api'
import type { RankedGame } from '$lib/ranked/view'
import { NEWS, visibleNews } from './news'
import { visibleFeatured, type FeaturedSlide } from './featured'
import { activityText, formForm, greeting, lastFive, lobbyLine, longDate, rankProgress, recentRow, relativeTime, trend } from './view'

const at = (h: number, m = 0) => new Date(2026, 9, 27, h, m)

describe('greeting', () => {
  it.each([
    [at(4, 59), 'Good evening'],
    [at(5, 0), 'Good morning'],
    [at(11, 59), 'Good morning'],
    [at(12, 0), 'Good afternoon'],
    [at(17, 59), 'Good afternoon'],
    [at(18, 0), 'Good evening'],
    [at(0, 0), 'Good evening'],
  ])('at %s says %s', (time, text) => {
    expect(greeting(time)).toBe(text)
  })
})

describe('longDate', () => {
  it('writes the weekday, then the day and month', () => {
    expect(longDate(new Date(2026, 9, 16, 21, 0))).toBe('Friday, 16 October')
  })
})

describe('trend', () => {
  it('is up, down or flat with the size of the change to one decimal', () => {
    expect(trend(73, 70.94)).toEqual({ dir: 'up', delta: 2.1 })
    expect(trend(70, 72.5)).toEqual({ dir: 'down', delta: 2.5 })
    expect(trend(70, 70.01)).toEqual({ dir: 'flat', delta: 0 })
  })

  it('is absent without an earlier period to compare to', () => {
    expect(trend(73, null)).toBeNull()
    expect(trend(null, 70)).toBeNull()
  })
})

const stats = (modes: GameStats['modes'], matches = 0): GameStats => ({ days: 30, matches, wins: 0, contested: 0, modes })
const agg = (avg: number, previousAvg: number | null = null, sum = avg, max = avg, byDay: { day: string; avg: number }[] = []) => ({
  avg,
  sum,
  min: avg,
  max,
  previousAvg,
  byDay,
})

describe('formForm', () => {
  it('shows the X01 average with its trend, the checkout rate, best checkout and games over all modes', () => {
    const form = formForm(
      stats(
        {
          x01: {
            matches: 10,
            wins: 6,
            contested: 9,
            stats: {
              average: agg(73, 70.9),
              checkoutHits: agg(0, null, 5),
              checkoutAttempts: agg(0, null, 15),
              bestCheckout: agg(80, null, 80, 129),
            },
          },
        },
        42,
      ),
    )
    expect(form).toEqual({ avg: '73.0', trend: { dir: 'up', delta: 2.1 }, byDay: [], checkout: '33%', bestCheckout: '129', games: '42' })
  })

  it('hands on the average of each day as UTC midnights', () => {
    const byDay = [
      { day: '2026-10-25', avg: 50 },
      { day: '2026-10-26', avg: 70 },
    ]
    const form = formForm(stats({ x01: { matches: 2, wins: 1, contested: 2, stats: { average: agg(60, null, 120, 60, byDay) } } }, 2))
    expect(form.byDay).toEqual([
      { day: Date.UTC(2026, 9, 25), avg: 50 },
      { day: Date.UTC(2026, 9, 26), avg: 70 },
    ])
  })

  it('shows dashes, not zeros or NaN, without X01 games', () => {
    expect(formForm(stats({}, 0))).toEqual({ avg: '–', trend: null, byDay: [], checkout: '–', bestCheckout: '–', games: '0' })
    expect(formForm(stats({ atc: { matches: 3, wins: 1, contested: 2, stats: {} } }, 3)).avg).toBe('–')
  })

  it('shows a dash for the checkout rate when no tries were stored (games from before they were)', () => {
    const form = formForm(stats({ x01: { matches: 2, wins: 1, contested: 2, stats: { average: agg(50) } } }, 2))
    expect(form.checkout).toBe('–')
    expect(form.avg).toBe('50.0')
  })
})

const game = (won: boolean, mode: RankedGame['mode'] = '1v1'): RankedGame => ({
  sessionId: 's',
  mode,
  won,
  change: won ? 10 : -10,
  at: '2026-10-27T10:00:00Z',
  opponents: [],
})

describe('lastFive', () => {
  it('maps wins and losses, newest first, at most five', () => {
    const games = [true, true, false, true, false, true, true].map(w => game(w))
    expect(lastFive(games)).toEqual(['W', 'W', 'L', 'W', 'L'])
  })

  it('is empty without ranked games', () => {
    expect(lastFive([])).toEqual([])
  })
})

describe('rankProgress', () => {
  it('shows how far through the stage you are and what is missing to the next', () => {
    // Silver V (index 14) is 1250..1300 RP
    const p = rankProgress({ mode: '1v1', rating: 1284, rankIndex: 14, matches: 40, wins: 20, streak: 0, change30d: 0 })
    expect(p).toEqual({ pct: 68, line: '16 RP to Gold I', range: '1250–1300' })
  })

  it('is absent while placing and at the top rank', () => {
    expect(rankProgress({ mode: '1v1', rating: null, rankIndex: null, matches: 2, wins: 1, streak: 0, change30d: 0 })).toBeNull()
    expect(rankProgress({ mode: '1v1', rating: 2100, rankIndex: 29, matches: 90, wins: 50, streak: 0, change30d: 0 })).toBeNull()
  })
})

const base = { id: '1', userId: 'u', name: 'Lena', avatar: { kind: 'none' }, at: '2026-10-27T10:00:00Z' } as const

describe('activityText', () => {
  it('says a single 180 and several', () => {
    expect(activityText({ ...base, kind: 'one_eighty', payload: { count: 1 } })).toBe('hit a 180 in X01')
    expect(activityText({ ...base, kind: 'one_eighty', payload: { count: 3 } })).toBe('hit 3 180s in X01')
  })

  it('says the highest ton-plus out and, for more than one, how many', () => {
    expect(activityText({ ...base, kind: 'ton_out', payload: { count: 1, best: 129 } })).toBe('checked out 129 in X01')
    expect(activityText({ ...base, kind: 'ton_out', payload: { count: 2, best: 129 } })).toBe('checked out 129 in X01 (2 ton-plus outs)')
  })

  it('names the rank reached', () => {
    expect(activityText({ ...base, kind: 'rank_up', payload: { mode: '1v1', rankIndex: 15 } })).toBe('reached Gold I in ranked')
  })
})

describe('relativeTime', () => {
  const now = new Date(2026, 9, 27, 12, 0)
  const ago = (ms: number) => new Date(now.getTime() - ms)
  const MIN = 60_000
  const H = 60 * MIN

  it.each([
    [30_000, 'just now'],
    [2 * MIN, '2 min'],
    [59 * MIN, '59 min'],
    [60 * MIN, '1 h'],
    [5 * H, '5 h'],
  ])('%i ms ago is %s', (ms, text) => {
    expect(relativeTime(ago(ms), now)).toBe(text)
  })

  it('says yesterday for the day before, days within a week, then the date', () => {
    expect(relativeTime(new Date(2026, 9, 26, 9, 0), now)).toBe('yesterday')
    expect(relativeTime(new Date(2026, 9, 24, 9, 0), now)).toBe('3 d')
    expect(relativeTime(new Date(2026, 9, 10, 9, 0), now)).toBe('10 Oct')
  })
})

describe('lobbyLine', () => {
  it('joins the mode, settings, people and boards', () => {
    expect(lobbyLine({ mode: 'x01', startScore: 501, people: 3, boards: 2 })).toBe('X01 · 501 · 3 people · 2 boards')
  })

  it('leaves out what is empty and says one person', () => {
    expect(lobbyLine({ mode: 'minigolf', startScore: null, people: 1, boards: 0 })).toBe('Minigolf · 1 person')
    expect(lobbyLine({ mode: null, startScore: null, people: 2, boards: 1 })).toBe('2 people · 1 board')
  })
})

const summary = (over: Partial<GameSummary>): GameSummary => ({
  id: 'g1',
  mode: 'x01',
  config: { startScore: 501, inMode: 'straight', outMode: 'double', firstTo: 3 },
  createdAt: '2026-10-26T18:00:00Z',
  finishedAt: '2026-10-26T18:30:00Z',
  board: null,
  mySeat: 0,
  invalidated: false,
  players: [
    {
      seat: 0,
      name: 'Me',
      userId: 'me',
      bot: null,
      placement: 1,
      stats: { legsWon: 3 },
      throwPosition: 0,
      forfeited: false,
      avatar: { kind: 'none' },
    },
    {
      seat: 1,
      name: 'Guest 1',
      userId: null,
      bot: null,
      placement: 2,
      stats: { legsWon: 1 },
      throwPosition: 1,
      forfeited: false,
      avatar: { kind: 'none' },
    },
  ],
  ...over,
})

describe('recentRow', () => {
  // Local times, so "yesterday" does not depend on the time zone the tests run in
  const finishedAt = new Date(2026, 9, 26, 18, 30).toISOString()
  const now = new Date(2026, 9, 27, 12, 0)

  it('names the mode, the opponents, the result and when', () => {
    expect(recentRow(summary({ finishedAt }), now)).toEqual({
      id: 'g1',
      title: 'X01',
      line: 'vs Guest 1 · Won 3–1 · yesterday',
    })
  })

  it('says it was a solo game when nobody else played', () => {
    const solo = summary({ finishedAt, players: summary({}).players.slice(0, 1) })
    expect(recentRow(solo, now).line).toBe('Solo · Finished · yesterday')
  })
})

describe('visibleFeatured', () => {
  const slide = (id: string, flag?: string): FeaturedSlide => ({
    id,
    badge: 'NEW',
    title: id,
    text: '',
    primary: { label: 'Go', href: '#/play' },
    ...(flag ? { flag } : {}),
  })

  it('keeps slides without a flag and those whose flag is on, in order', () => {
    const slides = [slide('a', 'lights.enabled'), slide('b'), slide('c', 'gamemode.minigolf.enabled')]
    expect(visibleFeatured(slides, key => key === 'gamemode.minigolf.enabled').map(s => s.id)).toEqual(['b', 'c'])
  })

  it('is empty when nothing qualifies', () => {
    expect(visibleFeatured([slide('a', 'x')], () => false)).toEqual([])
  })
})

describe('news', () => {
  const item = (id: string, date: string, flag?: string) => ({ id, date, title: id, text: '', href: '#/', ...(flag ? { flag } : {}) })

  it('is listed newest first', () => {
    const dates = NEWS.map(n => n.date)
    expect(dates).toEqual([...dates].sort().reverse())
  })

  it('shows at most three, skipping items about features the player does not have', () => {
    const items = [item('a', '4', 'off'), item('b', '3'), item('c', '2'), item('d', '1'), item('e', '0')]
    expect(visibleNews(items, () => false).map(n => n.id)).toEqual(['b', 'c', 'd'])
  })
})
