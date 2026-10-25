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
    expect(dartEvent(one, game({ currentVisitDarts: [dart(20, 1), dart(19, 3)] }))).toEqual({ kind: 'treble', seat: 1 })
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
      expect(snapshotEvent(snap(id, {}), snap(id, thrown))).toEqual({ kind: 'treble', seat: 0 })
    }
    expect(snapshotEvent(snap('atc', { currentVisitHits: [] }), snap('atc', { ...thrown, currentVisitHits: [true] }))).toEqual({
      kind: 'treble',
      seat: 0,
    })
    // Minigolf: every dart is a putt, so it only ever hits
    expect(snapshotEvent(snap('minigolf', {}), snap('minigolf', { currentVisitDarts: [dart(0, 0)] }))).toEqual({ kind: 'hit', seat: 0 })
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
  const all = { soundHit: true, soundTreble: true, soundMiss: true, soundBust: true }
  it('gives a treble its own sound while trebles have one', () => {
    expect(dartSound('treble', all)).toBe('treble')
  })
  it('falls back to the hit for a treble with the treble sound off, and to nothing with the hit off too', () => {
    expect(dartSound('treble', { ...all, soundTreble: false })).toBe('hit')
    expect(dartSound('treble', { ...all, soundTreble: false, soundHit: false })).toBeNull()
  })
  it('follows each switch', () => {
    expect(dartSound('double', all)).toBe('double')
    expect(dartSound('hit', { ...all, soundHit: false })).toBeNull()
    expect(dartSound('miss', { ...all, soundMiss: false })).toBeNull()
    expect(dartSound('bust', { ...all, soundBust: false })).toBeNull()
  })
})
