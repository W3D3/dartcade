import { describe, it, expect } from 'vitest'
import { createOutcome } from '../lobby/create.js'

describe('createOutcome', () => {
  it('the new lobby', () => {
    expect(createOutcome({ id: 'l1' }, undefined)).toEqual({ ok: true, lobbyId: 'l1' })
  })

  it('a refusal, in words for the screen', () => {
    expect(createOutcome(undefined, { error: 'x', code: 'in_lobby' })).toEqual({ ok: false, message: "You're in another lobby. Leave it first." })
    expect(createOutcome(undefined, undefined)).toEqual({ ok: false, message: 'Could not create the lobby' })
  })
})
