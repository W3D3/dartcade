import { describe, it, expect } from 'vitest'
import { dartEvent, type EventGame, dartSound, snapshotEvent } from '../dartEvents.js'
import type { Snapshot } from '../api/game-ws.js'
import { SOUND_PACKS } from '../soundPacks.js'
import { PERKS } from '$shared/progression.js'

const BEDS = { 0: 'Outside', 1: 'Single', 2: 'Double', 3: 'Triple' } as const
const dart = (number: number, multiplier: 0 | 1 | 2 | 3) => ({
  segment: { name: `${multiplier}x${number}`, number, bed: BEDS[multiplier], multiplier },
  score: number * multiplier,
})
const game = (o: Partial<EventGame> = {}): EventGame => ({ currentPlayer: 1, currentVisitDarts: [], ...o })

describe('dartEvent', () => {
  it('marks a landing dart for its thrower: hit, double, treble, miss', () => {
    expect(dartEvent(game(), game({ currentVisitDarts: [dart(20, 1)] }))).toEqual({ kind: 'hit', seat: 1 })
    expect(dartEvent(game(), game({ currentVisitDarts: [dart(16, 2)] }))).toEqual({ kind: 'double', seat: 1 })
    const one = game({ currentVisitDarts: [dart(20, 1)] })
    expect(dartEvent(one, game({ currentVisitDarts: [dart(20, 1), dart(19, 3)] }))).toEqual({ kind: 'treble', seat: 1, number: 19 })
    expect(dartEvent(game(), game({ currentVisitDarts: [dart(0, 0)] }))).toEqual({ kind: 'miss', seat: 1 })
  })

  it('counts a dart off the target as a miss in Around the Clock, whatever the bed', () => {
    const after = game({ currentVisitDarts: [dart(5, 3)], currentVisitHits: [false] })
    expect(dartEvent(game({ currentVisitHits: [] }), after)).toEqual({ kind: 'miss', seat: 1 })
  })

  it('marks a bust once, over the dart that busted', () => {
    const bust = game({ currentVisitDarts: [dart(20, 3)], bust: 1 })
    expect(dartEvent(game({ bust: null }), bust)).toEqual({ kind: 'bust', seat: 1 })
    expect(dartEvent(bust, bust)).toBeNull()
  })

  it('marks the turn moving on, and nothing for a correction or takeout', () => {
    expect(dartEvent(game({ currentPlayer: 0, currentVisitDarts: [dart(1, 1)] }), game())).toEqual({ kind: 'switch', seat: 1 })
    const two = game({ currentVisitDarts: [dart(1, 1), dart(1, 1)] })
    expect(dartEvent(two, game({ currentVisitDarts: [dart(1, 1)] }))).toBeNull()
  })
})

// Only the fields the sounds read; the rest of a snapshot doesn't matter to them
const snap = (gameId: Snapshot['gameId'], g: Record<string, unknown>) =>
  ({ gameId, game: { currentPlayer: 0, currentVisitDarts: [], ...g } }) as unknown as Snapshot

describe('snapshotEvent', () => {
  it('sounds the darts of every game mode, not only X01 and Around the Clock', () => {
    const thrown = { currentVisitDarts: [dart(20, 3)] }
    for (const id of ['x01', 'p121', 'hilo'] as const) {
      expect(snapshotEvent(snap(id, {}), snap(id, thrown))).toEqual({ kind: 'treble', seat: 0, number: 20 })
    }
    expect(snapshotEvent(snap('atc', { currentVisitHits: [] }), snap('atc', { ...thrown, currentVisitHits: [true] }))).toEqual({
      kind: 'treble',
      seat: 0,
      number: 20,
    })
    // Minigolf: every dart is a putt, so it only ever hits
    expect(snapshotEvent(snap('minigolf', {}), snap('minigolf', { currentVisitDarts: [dart(0, 0)] }))).toEqual({ kind: 'hit', seat: 0 })
    // Cricket: a dart off the targets is a miss, a bullseye (50) and a treble on a target hit
    const targets = [20, 19, 18, 17, 16, 15, 25]
    const cricket = (d: ReturnType<typeof dart>) =>
      snapshotEvent(snap('cricket', { targets }), snap('cricket', { targets, currentVisitDarts: [d] }))
    expect(cricket(dart(14, 3))).toEqual({ kind: 'miss', seat: 0 })
    expect(cricket(dart(20, 3))).toEqual({ kind: 'treble', seat: 0, number: 20 })
    expect(cricket(dart(50, 1))).toEqual({ kind: 'hit', seat: 0 })
  })

  it('busts a 121 Checkout visit and a lost Higher Lower life, for the seat that threw it', () => {
    expect(snapshotEvent(snap('p121', { bust: false }), snap('p121', { bust: true }))).toEqual({ kind: 'bust', seat: 0 })
    const lost = { currentPlayer: 1, lastResult: { seat: 0, outcome: 'between' } }
    expect(snapshotEvent(snap('hilo', { lastResult: null }), snap('hilo', lost))).toEqual({ kind: 'bust', seat: 0 })
    const kept = { currentPlayer: 1, lastResult: { seat: 0, outcome: 'high' } }
    expect(snapshotEvent(snap('hilo', { lastResult: null }), snap('hilo', kept))).toEqual({ kind: 'switch', seat: 1 })
  })

  it('stays silent across two different games', () => {
    expect(snapshotEvent(snap('x01', {}), snap('hilo', { currentVisitDarts: [dart(1, 1)] }))).toBeNull()
  })
})

describe('sound packs', () => {
  it('has a recipe for every pack but none', () => {
    const packs = PERKS.filter(p => p.kind === 'sound' && p.id !== 'sound.none').map(p => p.id)
    expect(Object.keys(SOUND_PACKS).sort()).toEqual(packs.sort())
  })
})

describe('dartSound', () => {
  const all = { soundHit: true, soundTreble: true, trebleAbove: 0, soundMiss: true, soundBust: true }
  it('gives a treble its own sound while trebles have one', () => {
    expect(dartSound('treble', all, 20)).toBe('treble')
  })
  it('gives every treble the treble sound with the threshold at 0', () => {
    for (const n of [1, 6, 7, 20]) expect(dartSound('treble', all, n)).toBe('treble')
  })
  it('plays a treble of a number not above the threshold as a hit', () => {
    const above6 = { ...all, trebleAbove: 6 }
    expect(dartSound('treble', above6, 6)).toBe('hit')
    expect(dartSound('treble', above6, 7)).toBe('treble')
    expect(dartSound('treble', { ...all, trebleAbove: 19 }, 20)).toBe('treble')
    expect(dartSound('treble', { ...all, trebleAbove: 19 }, 19)).toBe('hit')
    expect(dartSound('treble', { ...above6, soundHit: false }, 6)).toBeNull()
  })
  it('falls back to the hit for a treble with the treble sound off, and to nothing with the hit off too', () => {
    expect(dartSound('treble', { ...all, soundTreble: false }, 20)).toBe('hit')
    expect(dartSound('treble', { ...all, soundTreble: false, soundHit: false })).toBeNull()
  })
  it('follows each switch', () => {
    expect(dartSound('double', all)).toBe('double')
    expect(dartSound('hit', { ...all, soundHit: false })).toBeNull()
    expect(dartSound('miss', { ...all, soundMiss: false })).toBeNull()
    expect(dartSound('bust', { ...all, soundBust: false })).toBeNull()
  })
})
