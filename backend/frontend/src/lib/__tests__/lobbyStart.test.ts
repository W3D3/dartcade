import { describe, it, expect } from 'vitest'
import { initialGameSelection, shouldOpenGame, startOutcome } from '../lobby/start.js'

describe('startOutcome', () => {
  it('started: the new game', () => {
    expect(startOutcome({ sessionId: 's1' }, undefined)).toEqual({ kind: 'started', sessionId: 's1' })
  })

  it('an offline board: the dialog names it, straight from the code', () => {
    expect(startOutcome(undefined, { error: 'x', code: 'board_offline', offlineBoards: ['Garage'] }))
      .toEqual({ kind: 'problem', code: 'board_offline', offlineBoards: ['Garage'] })
  })

  it("people who play aren't ready: ask before starting anyway", () => {
    expect(startOutcome(undefined, { error: 'x', code: 'not_ready', notReady: [{ personId: 'l', name: 'Lena' }] }))
      .toEqual({ kind: 'problem', code: 'not_ready', notReady: ['Lena'] })
  })

  it('any other refusal: the whole refusal, for the dialog to describe', () => {
    const refusal = { error: 'Lena already has a game running', code: 'active_session' as const, sessionId: 's9' }
    expect(startOutcome(undefined, refusal)).toEqual({ kind: 'problem', code: 'other', refusal })
    expect(startOutcome(undefined, undefined)).toEqual({ kind: 'problem', code: 'other', refusal: { error: 'Could not start the game' } })
  })
})

describe('shouldOpenGame', () => {
  it('only on the change from no game to a game, and only for someone who plays', () => {
    expect(shouldOpenGame(null, 's1', true)).toBe(true)
    expect(shouldOpenGame(null, 's1', false)).toBe(false)
    // The first snapshot after opening the page (or coming Back from the game): stay
    expect(shouldOpenGame(undefined, 's1', true)).toBe(false)
    expect(shouldOpenGame('s1', 's1', true)).toBe(false)
    expect(shouldOpenGame('s1', null, true)).toBe(false)
  })
})

describe('initialGameSelection', () => {
  const fallback = { mode: 'atc', config: { finishOn: 'twenty' } }
  const defaultsFor = (mode: string): Record<string, unknown> | undefined =>
    ({ x01: { startScore: 501, inMode: 'straight', outMode: 'double', bullOff: 'off', bullValue: '25_50', maxRounds: 50, firstTo: 3 } })[mode]

  it('no next game yet: the fallback (the remembered mode and settings)', () => {
    expect(initialGameSelection(null, fallback, defaultsFor)).toEqual(fallback)
  })

  it("the lobby's next game, merged over that mode's defaults so every field the form reads exists", () => {
    expect(initialGameSelection({ gameId: 'x01', config: { startScore: 301, outMode: 'straight', firstTo: 5 } }, fallback, defaultsFor))
      .toEqual({ mode: 'x01', config: { startScore: 301, inMode: 'straight', outMode: 'straight', bullOff: 'off', bullValue: '25_50', maxRounds: 50, firstTo: 5 } })
  })

  it('a mode with no known defaults: the next game config as is', () => {
    expect(initialGameSelection({ gameId: 'atc', config: { finishOn: 'bull' } }, fallback, defaultsFor))
      .toEqual({ mode: 'atc', config: { finishOn: 'bull' } })
  })
})
