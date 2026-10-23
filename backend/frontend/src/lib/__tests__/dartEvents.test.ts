import { describe, it, expect } from 'vitest'
import { dartEvent, type EventGame, dartSound } from '../dartEvents.js'
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
    const bust = game({ currentVisitDarts: [dart(20, 3)], bustThisVisit: true })
    expect(dartEvent(game({ bustThisVisit: false }), bust)).toEqual({ kind: 'bust', seat: 1 })
    expect(dartEvent(bust, bust)).toBeNull()
  })

  it('marks the turn moving on, and nothing for a correction or takeout', () => {
    expect(dartEvent(game({ currentPlayer: 0, currentVisitDarts: [dart(1, 1)] }), game())).toEqual({ kind: 'switch', seat: 1 })
    const two = game({ currentVisitDarts: [dart(1, 1), dart(1, 1)] })
    expect(dartEvent(two, game({ currentVisitDarts: [dart(1, 1)] }))).toBeNull()
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
