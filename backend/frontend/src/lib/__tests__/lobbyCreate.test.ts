import { describe, it, expect } from 'vitest'
import { createOutcome } from '../lobby/create.js'

describe('createOutcome', () => {
  it('the new lobby', () => {
    expect(createOutcome({ id: 'l1' }, undefined)).toEqual({ ok: true, lobbyId: 'l1' })
  })

  it('a refusal, in words for the screen', () => {
    expect(createOutcome(undefined, { error: 'x', code: 'game_running' })).toEqual({
      ok: false,
      message: 'A game is running in this lobby',
      inLobby: false,
    })
    expect(createOutcome(undefined, undefined)).toEqual({ ok: false, message: 'Could not create the lobby', inLobby: false })
  })

  it('tells "you already have a lobby" apart, so a second tab opening one at the same time can ignore it', () => {
    expect(createOutcome(undefined, { error: 'x', code: 'in_lobby' })).toEqual({
      ok: false,
      message: "You're in another lobby. Leave it first.",
      inLobby: true,
    })
  })
})
