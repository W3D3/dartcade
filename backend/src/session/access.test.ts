import { describe, it, expect } from 'vitest'
import { authorizeAction, canAccessSession, isHost } from './access.js'
import { newSession } from './replay.js'
import { x01Module } from '../games/x01.js'
import type { Seat } from './types.js'

const seat = (name: string, controllerUserId: string, boardId: string | null): Seat =>
  ({ name, userId: controllerUserId, controllerUserId, boardId, boardName: null })

function game(seats: Seat[], owner = 'host') {
  return newSession({ id: 's1', ownerUserId: owner, boardId: null, module: x01Module, config: x01Module.defaultConfig, seats, seed: 1, createdAt: new Date() })
}

const seg = { name: 'S1', number: 1, bed: 'SingleOuter', multiplier: 1 } as const

describe('authorizeAction', () => {
  const s = game([seat('Host', 'host', 'a'), seat('Lena', 'lena', 'b'), seat('Guest', 'host', 'a')])

  it('lets only the controller of the seat that is up throw, undo, correct or take out', () => {
    for (const action of [{ type: 'add_dart', segment: seg }, { type: 'undo_dart' }, { type: 'takeout' }, { type: 'correct_dart', visitIndex: 0, segment: seg }, { type: 'bulloff_skip' }] as const) {
      expect(authorizeAction(s, 'host', action)).toEqual(action)
      expect(authorizeAction(s, 'lena', action)).toBeNull()
    }
  })

  it('leaves bull off start/rethrow and unknown game actions to the host', () => {
    expect(authorizeAction(s, 'host', { type: 'bulloff_start' })).toEqual({ type: 'bulloff_start' })
    expect(authorizeAction(s, 'lena', { type: 'bulloff_start' })).toBeNull()
    expect(authorizeAction(s, 'lena', { type: 'bulloff_rethrow' })).toBeNull()
  })

  it('fills a forfeit in with every seat the sender controls', () => {
    expect(authorizeAction(s, 'host', { type: 'forfeit' })).toEqual({ type: 'forfeit', seats: [0, 2] })
    expect(authorizeAction(s, 'lena', { type: 'forfeit', seats: [0] })).toEqual({ type: 'forfeit', seats: [1] })
  })

  it('refuses a forfeit with nobody left to lose to, or from someone without seats', () => {
    expect(authorizeAction(game([seat('A', 'host', 'a'), seat('B', 'host', 'a')]), 'host', { type: 'forfeit' })).toBeNull()
    expect(authorizeAction(s, 'stranger', { type: 'forfeit' })).toBeNull()
  })
})

describe('canAccessSession / isHost', () => {
  const s = game([seat('Host', 'host', 'a'), seat('Lena', 'lena', 'b')])
  it('lets the host and every controller in, nobody else', () => {
    expect(canAccessSession('host', s)).toBe(true)
    expect(canAccessSession('lena', s)).toBe(true)
    expect(canAccessSession('max', s)).toBe(false)
  })
  it('knows the host', () => {
    expect(isHost('host', s)).toBe(true)
    expect(isHost('lena', s)).toBe(false)
  })
})
