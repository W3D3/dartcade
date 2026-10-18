import { describe, it, expect } from 'vitest'
import { decideCleanupAction } from './cleanup.js'
import { newSession } from '../session/replay.js'
import { x01Module } from '../games/x01.js'
import type { Seat } from '../session/types.js'

const seat = (name: string, controllerUserId: string): Seat => ({
  name,
  userId: controllerUserId,
  controllerUserId,
  boardId: null,
  boardName: null,
  bot: null,
})

function game(seats: Seat[], owner = 'host') {
  return newSession({
    id: 's1',
    ownerUserId: owner,
    boardId: null,
    module: x01Module,
    config: x01Module.defaultConfig,
    seats,
    seed: 1,
    createdAt: new Date(),
  })
}

describe('decideCleanupAction', () => {
  it('forfeits when the user holds a live seat and someone else is still left to play', () => {
    const s = game([seat('Host', 'host'), seat('Lena', 'lena')])
    expect(decideCleanupAction(s, 'host')).toBe('forfeit')
  })

  it('aborts when the user holds every live seat (or every live team): nobody would be left', () => {
    const s = game([seat('A', 'host'), seat('B', 'host')])
    expect(decideCleanupAction(s, 'host')).toBe('abort')
  })

  it('does nothing for a non-playing owner: the host running the game for others keeps no live seat', () => {
    const s = game([seat('Lena', 'lena'), seat('Max', 'max')], 'host')
    expect(decideCleanupAction(s, 'host')).toBe('none')
  })

  it('does nothing for a stranger who controls no seat', () => {
    const s = game([seat('Host', 'host'), seat('Lena', 'lena')])
    expect(decideCleanupAction(s, 'stranger')).toBe('none')
  })

  it('forfeits only the seats the user still controls, ignoring already-forfeited ones', () => {
    const s = game([seat('Host', 'host'), seat('Lena', 'lena'), seat('Guest', 'host')])
    s.forfeited.push(2)
    expect(decideCleanupAction(s, 'host')).toBe('forfeit')
  })
})
