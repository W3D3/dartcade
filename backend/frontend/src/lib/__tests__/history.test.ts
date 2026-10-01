import { describe, it, expect } from 'vitest'
import { formatWhen, rulesLine, playerNames, resultLabel, historyStat, statTiles } from '../history.js'
import type { GameSummary, GameStats } from '../api'

const game = (o: Partial<GameSummary> = {}): GameSummary => ({
  id: 'g1', mode: 'x01', config: { startScore: 501, inMode: 'straight', outMode: 'double', firstTo: 3 },
  createdAt: '2026-10-01T19:00:00.000Z', finishedAt: '2026-10-01T19:30:00.000Z', board: null, mySeat: 0,
  players: [
    { seat: 0, name: 'Christoph', userId: 'u1', placement: 1, stats: { average: 83.94, legsWon: 3, dartsThrown: 66 } },
    { seat: 1, name: 'Guest 1', userId: null, placement: 2, stats: { average: 71.6, legsWon: 1, dartsThrown: 65 } },
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
    expect(rulesLine(game({ mode: 'atc', config: { order: 'asc', finishOn: 'bull', multiplierAdvances: false }, players: [game().players[0]] }))).toBe('1–20, then Bull · Practice')
  })
  it('empty for an unknown mode or an unreadable config', () => {
    expect(rulesLine(game({ mode: 'soccer' }))).toBe('')
    expect(rulesLine(game({ config: {} }))).toBe('')
  })
})

describe('players and result', () => {
  it('two players: both names with mine marked, won/lost with legs for X01', () => {
    expect(playerNames(game())).toEqual([{ name: 'Christoph', me: true }, { name: 'Guest 1', me: false }])
    expect(playerNames(game({ mySeat: 1 })).map(p => p.me)).toEqual([false, true])
    expect(resultLabel(game())).toEqual({ text: 'Won 3–1', won: true })
    expect(resultLabel(game({ mySeat: 1 }))).toEqual({ text: 'Lost 1–3', won: false })
    expect(resultLabel(game({ mode: 'atc' }))).toEqual({ text: 'Won', won: true })
  })
  it('three or more: placement of n', () => {
    const party = game({ players: [...game().players, { seat: 2, name: 'Lena', userId: null, placement: 3, stats: {} }] })
    expect(playerNames(party).map(p => p.name)).toEqual(['Christoph', 'Guest 1', 'Lena'])
    expect(resultLabel({ ...party, mySeat: 1 })).toEqual({ text: '2nd of 3', won: false })
    expect(resultLabel(party)).toEqual({ text: '1st of 3', won: true })
  })
  it('solo', () => {
    const solo = game({ players: [game().players[0]] })
    expect(playerNames(solo)).toEqual([{ name: 'Christoph', me: true }])
    expect(resultLabel(solo)).toEqual({ text: 'Finished', won: false })
  })
})

describe('historyStat', () => {
  it('X01 average, ATC darts', () => {
    expect(historyStat(game())).toEqual({ value: '83.9', label: '3-dart avg' })
    expect(historyStat(game({ mode: 'atc', players: [{ ...game().players[0], stats: { dartsThrown: 52, targetsHit: 21 } }] }))).toEqual({ value: '52', label: 'darts to finish' })
    expect(historyStat(game({ mode: 'soccer' }))).toBeNull()
  })
})

describe('statTiles', () => {
  const stats = (o: Partial<GameStats> = {}): GameStats => ({ days: 30, matches: 23, wins: 14, contested: 22, modes: {}, ...o })
  it('fills all four tiles', () => {
    const tiles = statTiles(stats({ modes: {
      x01: { matches: 10, wins: 6, contested: 10, stats: { average: { avg: 72.64, min: 50, max: 90, previousAvg: 69.5 } } },
      atc: { matches: 5, wins: 2, contested: 3, stats: { dartsThrown: { avg: 60, min: 52, max: 70, previousAvg: null } } },
    } }))
    expect(tiles).toEqual([
      { label: 'Matches · 30 days', value: '23', note: null, trend: null },
      { label: 'Won', value: '14', note: '64%', trend: null },
      { label: 'X01 3-dart average', value: '72.6', note: '▲ 3.1 vs previous 30 days', trend: 'up' },
      { label: 'Around the Clock best', value: '52', note: 'darts', trend: null },
    ])
  })
  it('shows – without data', () => {
    const tiles = statTiles(stats({ matches: 1, wins: 0, contested: 0 }))
    expect(tiles.map(t => t.value)).toEqual(['1', '–', '–', '–'])
    expect(tiles[2].note).toBeNull()
  })
  it('a falling average', () => {
    const t = statTiles(stats({ modes: { x01: { matches: 1, wins: 0, contested: 1, stats: { average: { avg: 60, min: 60, max: 60, previousAvg: 65 } } } } }))[2]
    expect([t.note, t.trend]).toEqual(['▼ 5.0 vs previous 30 days', 'down'])
  })
})
