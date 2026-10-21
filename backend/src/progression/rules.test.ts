import { describe, expect, it } from 'vitest'
import { gameAwards, reachedPerks, type DayTally, type PlayerGame } from './rules.js'

const fresh: DayTally = { games: 0, manualGames: 0, dartXp: 0 }
const game = (over: Partial<PlayerGame> = {}): PlayerGame => ({
  gameId: 'x01',
  ranked: false,
  placement: 1,
  forfeited: false,
  stats: {},
  opponents: ['human'],
  darts: { total: 42, camera: 42, oneEighties: 0 },
  previousBest: null,
  ...over,
})
const kinds = (g: PlayerGame, day = fresh) => Object.fromEntries(gameAwards(g, day).map(w => [`${w.kind}:${w.sourceType}`, w.amount]))

describe('gameAwards', () => {
  it('pays darts, the game and a win against a human', () => {
    expect(kinds(game())).toEqual({ 'dart:game': 42, 'game:game': 50, 'win:game': 100 })
  })

  it('pays 25 for a win against bots only, none solo, none for a loss', () => {
    expect(kinds(game({ opponents: ['bot'] }))['win:game']).toBe(25)
    expect(kinds(game({ opponents: [] }))['win:game']).toBeUndefined()
    expect(kinds(game({ placement: 2 }))).toEqual({ 'dart:game': 42, 'game:game': 50 })
  })

  it('pays nothing but darts for fewer than 9 darts or a forfeit', () => {
    expect(kinds(game({ darts: { total: 8, camera: 8, oneEighties: 0 } }))).toEqual({ 'dart:game': 8 })
    expect(kinds(game({ forfeited: true }))).toEqual({ 'dart:game': 42 })
  })

  it('caps dart XP at 500 a day', () => {
    expect(kinds(game(), { ...fresh, dartXp: 480 })['dart:game']).toBe(20)
    expect(kinds(game(), { ...fresh, dartXp: 500 })['dart:game']).toBeUndefined()
  })

  it('shrinks game and win XP after 8 and 16 games a day', () => {
    expect(kinds(game(), { ...fresh, games: 8 })).toMatchObject({ 'game:game': 25, 'win:game': 50 })
    expect(kinds(game(), { ...fresh, games: 16 })).toMatchObject({ 'game:game': 5, 'win:game': 10 })
  })

  it('pays a manual game no dart XP and half game XP, four a day', () => {
    const manual = game({ darts: { total: 30, camera: 3, oneEighties: 1 } })
    expect(kinds(manual)).toEqual({ 'game:game': 25, 'win:game': 100 })
    // The fifth still writes its game row (it counts for the day), worth nothing
    expect(kinds(manual, { ...fresh, manualGames: 4 })).toEqual({ 'game:game': 0 })
  })

  it('does not treat a ranked game as manual and adds the ranked bonus', () => {
    const ranked = game({ ranked: true, darts: { total: 30, camera: 0, oneEighties: 0 } })
    expect(kinds(ranked)).toEqual({ 'game:game': 50, 'win:game': 100, 'ranked:game': 75 })
    expect(kinds({ ...ranked, placement: 2 })['ranked:game']).toBe(25)
  })

  it('pays highlights: 180s, a 100+ checkout, a beaten personal best', () => {
    const g = game({ stats: { bestCheckout: 121, average: 60 }, darts: { total: 42, camera: 42, oneEighties: 2 }, previousBest: 55 })
    expect(kinds(g)).toMatchObject({ 'highlight:game:180': 50, 'highlight:game:checkout': 15, 'highlight:game:best': 50 })
    // The first game of a mode is no personal best; a lower-is-better stat must go down
    expect(kinds({ ...g, previousBest: null })['highlight:game:best']).toBeUndefined()
    expect(kinds(game({ gameId: 'atc', stats: { dartsToFinish: 40 }, previousBest: 38 }))['highlight:game:best']).toBeUndefined()
    expect(kinds(game({ gameId: 'atc', stats: { dartsToFinish: 36 }, previousBest: 38 }))['highlight:game:best']).toBe(50)
  })

  it('backfills game, win and dart XP only', () => {
    const g = game({ ranked: true, stats: { bestCheckout: 121 }, darts: { total: 42, camera: 42, oneEighties: 1 }, backfill: true })
    expect(Object.keys(kinds(g))).toEqual(['dart:game', 'game:game', 'win:game'])
  })
})

describe('reachedPerks', () => {
  const none = { wins: 0, bestRank: null }
  it('reaches level and streak perks, never the level 1 ones (they need no row)', () => {
    const ids = reachedPerks({ level: 15, streak: 7, ranked: none }).map(p => p.id)
    expect(ids.sort()).toEqual(['banner.chalk', 'colors.chalk', 'colors.night', 'picture.dart', 'picture.flame', 'title.oche-regular'])
  })
  it('reaches ranked deeds: 10 wins and Gold', () => {
    expect(reachedPerks({ level: 1, streak: 0, ranked: none })).toEqual([])
    expect(reachedPerks({ level: 1, streak: 0, ranked: { wins: 10, bestRank: 15 } }).map(p => p.id)).toEqual([
      'colors.oche-red',
      'picture.shield',
    ])
  })
})
