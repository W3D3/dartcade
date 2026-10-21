import { describe, it, expect } from 'vitest'
import { formatWhen, rulesLine, playerBadges, resultLabel, historyStat, statTiles } from '../history.js'
import type { GameSummary, GameStats } from '../api'

const game = (o: Partial<GameSummary> = {}): GameSummary => ({
  id: 'g1',
  mode: 'x01',
  config: { startScore: 501, inMode: 'straight', outMode: 'double', firstTo: 3 },
  createdAt: '2026-10-01T19:00:00.000Z',
  finishedAt: '2026-10-01T19:30:00.000Z',
  board: null,
  mySeat: 0,
  invalidated: false,
  players: [
    {
      seat: 0,
      name: 'Christoph',
      userId: 'u1',
      bot: null,
      placement: 1,
      throwPosition: 0,
      stats: { average: 83.94, legsWon: 3, dartsThrown: 66 },
      forfeited: false,
    },
    {
      seat: 1,
      name: 'Guest 1',
      userId: null,
      bot: null,
      placement: 2,
      throwPosition: 1,
      stats: { average: 71.6, legsWon: 1, dartsThrown: 65 },
      forfeited: false,
    },
  ],
  ...o,
})

describe('formatWhen', () => {
  const now = new Date(2026, 9, 1, 22, 0)
  it('Today, Yesterday, then the date', () => {
    expect(formatWhen(new Date(2026, 9, 1, 21, 14).toISOString(), now)).toEqual({ day: 'Today', time: '21:14' })
    expect(formatWhen(new Date(2026, 8, 30, 8, 5).toISOString(), now)).toEqual({ day: 'Yesterday', time: '08:05' })
    expect(formatWhen(new Date(2026, 8, 24, 20, 40).toISOString(), now)).toEqual({ day: '24 Sep', time: '20:40' })
  })
})

describe('rulesLine', () => {
  it('per mode from the config', () => {
    expect(rulesLine(game())).toBe('501 · Double out · First to 3 legs')
    expect(
      rulesLine(game({ mode: 'atc', config: { order: 'asc', finishOn: 'bull', multiplierAdvances: false }, players: [game().players[0]] })),
    ).toBe('1–20, then Bull · Practice')
    expect(
      rulesLine(game({ mode: 'p121', config: { startTarget: 121, tries: 10, dartsPerTry: 9, outMode: 'double', missRule: 'reset' } })),
    ).toBe('121 · 10 tries · 9 darts · Double out')
    expect(rulesLine(game({ mode: 'hilo', config: { startHigh: 41, startLow: 21, lives: 3, t1Zero: false, matchExtremes: true } }))).toBe(
      '41 / 21 · 3 lives',
    )
  })
  it('names the course for Minigolf', () => {
    expect(rulesLine(game({ mode: 'minigolf', config: { course: 'test', tries: 3, ballContact: false } }))).toBe(
      'Test · 4 holes · 3 tries per stroke',
    )
    expect(rulesLine(game({ mode: 'minigolf', config: { course: 'mixed', tries: 1, ballContact: true } }))).toBe(
      'Mixed course · 9 holes · 1 dart per stroke · ball contact',
    )
    // A game started from a published course carries its name and holes
    const config = { course: '01J9', courseName: 'Canal Street', holes: [{}, {}, {}], tries: 3, ballContact: false }
    expect(rulesLine(game({ mode: 'minigolf', config }))).toBe('Canal Street · 3 holes · 3 tries per stroke')
  })
  it('empty for an unknown mode or an unreadable config', () => {
    expect(rulesLine(game({ mode: 'soccer' }))).toBe('')
    expect(rulesLine(game({ config: {} }))).toBe('')
  })
})

describe('players and result', () => {
  it('two players: both names with mine marked, won/lost with legs for X01', () => {
    expect(playerBadges(game())).toEqual([
      { n: 1, name: 'Christoph', me: true },
      { n: 2, name: 'Guest 1', me: false },
    ])
    expect(playerBadges(game({ mySeat: 1 })).map(p => p.me)).toEqual([false, true])
    expect(resultLabel(game())).toEqual({ text: 'Won 3–1', won: true })
    expect(resultLabel(game({ mySeat: 1 }))).toEqual({ text: 'Lost 1–3', won: false })
    expect(resultLabel(game({ mode: 'atc' }))).toEqual({ text: 'Won', won: true })
  })
  it('three or more: placement of n', () => {
    const party = game({
      players: [
        ...game().players,
        { seat: 2, name: 'Lena', userId: null, bot: null, placement: 3, throwPosition: 2, stats: {}, forfeited: false },
      ],
    })
    expect(playerBadges(party).map(p => p.name)).toEqual(['Christoph', 'Guest 1', 'Lena'])
    expect(resultLabel({ ...party, mySeat: 1 })).toEqual({ text: '2nd of 3', won: false })
    expect(resultLabel(party)).toEqual({ text: '1st of 3', won: true })
  })
  it('solo', () => {
    const solo = game({ players: [game().players[0]] })
    expect(playerBadges(solo)).toEqual([{ n: 1, name: 'Christoph', me: true }])
    expect(resultLabel(solo)).toEqual({ text: 'Finished', won: false })
  })
})

describe('historyStat', () => {
  it('X01 average, ATC darts', () => {
    expect(historyStat(game())).toEqual({ value: '83.9', label: '3-dart avg' })
    expect(historyStat(game({ mode: 'atc', players: [{ ...game().players[0], stats: { dartsThrown: 52, targetsHit: 21 } }] }))).toEqual({
      value: '52',
      label: 'darts to finish',
    })
    const p121 = (stats: Record<string, number>) => game({ mode: 'p121', players: [{ ...game().players[0], stats }] })
    expect(historyStat(p121({ highestMade: 124, checkouts: 4, tries: 10, dartsThrown: 70 }))).toEqual({
      value: '124',
      label: 'highest made',
    })
    expect(historyStat(p121({ checkouts: 0, tries: 10, dartsThrown: 90 }))).toBeNull()
    expect(historyStat(game({ mode: 'soccer' }))).toBeNull()
  })

  it('Higher Lower: lives left, as a number with its own unit (singular at 1)', () => {
    const hilo = (stats: Record<string, number>) => game({ mode: 'hilo', players: [{ ...game().players[0], stats }] })
    // A winner with lives still to spare
    expect(historyStat(hilo({ livesLeft: 2, dartsThrown: 30 }))).toEqual({ value: '2', label: 'lives left' })
    // Went out: 0 lives left (outRound doesn't change what's shown — placement/resultLabel say won/lost)
    expect(historyStat(hilo({ livesLeft: 0, outRound: 4, dartsThrown: 20 }))).toEqual({ value: '0', label: 'lives left' })
    expect(historyStat(hilo({ livesLeft: 1, dartsThrown: 25 }))).toEqual({ value: '1', label: 'life left' })
  })

  it("Higher Lower: a forfeit tie at placement 1 shows each seat's own lives left, never the word Winner", () => {
    const tied = game({
      mode: 'hilo',
      players: [
        { ...game().players[0], placement: 1, stats: { livesLeft: 2, dartsThrown: 20 } },
        { ...game().players[1], placement: 1, stats: { livesLeft: 1, dartsThrown: 18 } },
      ],
    })
    expect(historyStat(tied)).toEqual({ value: '2', label: 'lives left' })
    expect(historyStat({ ...tied, mySeat: 1 })).toEqual({ value: '1', label: 'life left' })
  })
})

describe('playerBadges', () => {
  it('numbers players in throw order, not seat order', () => {
    const g = game({
      players: [
        { seat: 0, name: 'Christoph', userId: 'u1', bot: null, placement: 1, throwPosition: 1, stats: {}, forfeited: false },
        { seat: 1, name: 'Guest 1', userId: null, bot: null, placement: 2, throwPosition: 0, stats: {}, forfeited: false },
      ],
    })
    expect(playerBadges(g)).toEqual([
      { n: 1, name: 'Guest 1', me: false },
      { n: 2, name: 'Christoph', me: true },
    ])
  })
  it('falls back to seat order without a throw position', () => {
    const g = game({ players: game().players.map(p => ({ ...p, throwPosition: null })) })
    expect(playerBadges(g).map(p => p.name)).toEqual(['Christoph', 'Guest 1'])
  })
})

describe('statTiles', () => {
  const title = (m: string) => ({ x01: 'X01', atc: 'ATC' })[m] ?? m
  const agg = (avg: number, min: number, max: number, sum: number, previousAvg: number | null = null) => ({
    avg,
    min,
    max,
    sum,
    previousAvg,
  })
  const stats = (o: Partial<GameStats> = {}): GameStats => ({
    days: 30,
    matches: 23,
    wins: 14,
    contested: 22,
    modes: {
      x01: {
        matches: 12,
        wins: 7,
        contested: 12,
        stats: { average: agg(72.64, 50, 90, 871.7, 69.5), bestCheckout: agg(80, 40, 121, 400), dartsThrown: agg(200, 100, 300, 2400) },
      },
      atc: { matches: 6, wins: 4, contested: 6, stats: { dartsToFinish: agg(58.4, 52, 70, 292), dartsThrown: agg(170, 52, 300, 1012) } },
      p121: {
        matches: 2,
        wins: 0,
        contested: 0,
        stats: { highestMade: agg(123, 122, 124, 246), checkouts: agg(3, 2, 4, 6), dartsThrown: agg(80, 70, 90, 160) },
      },
      hilo: {
        matches: 2,
        wins: 1,
        contested: 2,
        stats: { highestSet: agg(65, 60, 70, 130), lowestSet: agg(10, 5, 15, 20), dartsThrown: agg(30, 25, 35, 60) },
      },
    },
    ...o,
  })

  it('all: matches, won, darts thrown, most played', () => {
    expect(statTiles(stats(), null, title)).toEqual([
      { label: 'Matches · 30 days', value: '23', note: null, trend: null },
      { label: 'Won', value: '14', note: '64%', trend: null },
      { label: 'Darts thrown', value: '3,632', note: null, trend: null },
      { label: 'Most played', value: 'X01', note: '12 matches', trend: null },
    ])
  })
  it('X01: its matches, won, 3-dart average vs last month, best checkout', () => {
    expect(statTiles(stats(), 'x01', title)).toEqual([
      { label: 'X01 matches · 30 days', value: '12', note: null, trend: null },
      { label: 'Won', value: '7', note: '58%', trend: null },
      { label: '3-dart average', value: '72.6', note: '▲ 3.1 vs last month', trend: 'up' },
      { label: 'Best checkout', value: '121', note: null, trend: null },
    ])
  })
  it('ATC: its matches, won, best and average finish', () => {
    expect(statTiles(stats(), 'atc', title)).toEqual([
      { label: 'ATC matches · 30 days', value: '6', note: null, trend: null },
      { label: 'Won', value: '4', note: '67%', trend: null },
      { label: 'Best finish', value: '52', note: 'darts', trend: null },
      { label: 'Average finish', value: '58', note: 'darts', trend: null },
    ])
  })
  it('121: its matches, won, highest made, checkouts', () => {
    expect(statTiles(stats(), 'p121', title)).toEqual([
      { label: 'p121 matches · 30 days', value: '2', note: null, trend: null },
      { label: 'Won', value: '–', note: null, trend: null },
      { label: 'Highest made', value: '124', note: null, trend: null },
      { label: 'Checkouts', value: '6', note: null, trend: null },
    ])
  })
  it('Higher Lower: its matches, won, highest and lowest set', () => {
    expect(statTiles(stats(), 'hilo', title)).toEqual([
      { label: 'hilo matches · 30 days', value: '2', note: null, trend: null },
      { label: 'Won', value: '1', note: '50%', trend: null },
      { label: 'Highest set', value: '70', note: null, trend: null },
      { label: 'Lowest set', value: '5', note: null, trend: null },
    ])
  })
  it('shows – without data, and only matches and won for an unknown mode', () => {
    const empty = stats({ matches: 0, wins: 0, contested: 0, modes: {} })
    expect(statTiles(empty, null, title).map(t => t.value)).toEqual(['0', '–', '–', '–'])
    expect(statTiles(empty, 'x01', title).map(t => t.value)).toEqual(['0', '–', '–', '–'])
    expect(statTiles(empty, 'soccer', title).map(t => t.label)).toEqual(['soccer matches · 30 days', 'Won'])
  })
  it('a falling average', () => {
    const t = statTiles(
      stats({ modes: { x01: { matches: 1, wins: 0, contested: 1, stats: { average: agg(60, 60, 60, 60, 65) } } } }),
      'x01',
      title,
    )[2]
    expect([t.note, t.trend]).toEqual(['▼ 5.0 vs last month', 'down'])
  })
})
