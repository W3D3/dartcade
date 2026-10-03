import { describe, it, expect } from 'vitest'
import { describeConflict, normalizeCode, parseAddInput } from '../lobby/input.js'

describe('the "name or @username" field', () => {
  it('a plain name adds a guest; @ invites an account', () => {
    expect(parseAddInput('  Pia ')).toEqual({ kind: 'guest', name: 'Pia' })
    expect(parseAddInput('@lena')).toEqual({ kind: 'invite', query: 'lena' })
    expect(parseAddInput('@ lena ')).toEqual({ kind: 'invite', query: 'lena' })
  })

  it('refuses empty input, a bare @ and over-long names with a hint', () => {
    expect(parseAddInput('   ')).toEqual({ kind: 'invalid', hint: 'Type a name, or @ and a username' })
    expect(parseAddInput('@')).toEqual({ kind: 'invalid', hint: 'Type a username after the @' })
    expect(parseAddInput('x'.repeat(33))).toEqual({ kind: 'invalid', hint: 'Names can be 32 characters at most' })
    expect(parseAddInput('x'.repeat(32))).toEqual({ kind: 'guest', name: 'x'.repeat(32) })
  })
})

describe('lobby codes as people type them', () => {
  it('ignores case, dashes and spaces', () => {
    expect(normalizeCode('k7q4-md')).toBe('K7Q4MD')
    expect(normalizeCode(' K7Q4 MD ')).toBe('K7Q4MD')
  })
})

describe('what a refusal means', () => {
  it('names who isn\'t ready and which boards are offline', () => {
    expect(describeConflict({ error: 'x', code: 'not_ready', notReady: [{ personId: 'l', name: 'Lena' }, { personId: 'm', name: 'Max' }] }))
      .toBe('Not ready yet: Lena, Max')
    expect(describeConflict({ error: 'x', code: 'board_offline', offlineBoards: ["Lena's place"] })).toBe("Board offline: Lena's place")
  })

  it('explains the lobby states', () => {
    expect(describeConflict({ error: 'x', code: 'in_lobby' })).toBe("You're in another lobby. Leave it first.")
    expect(describeConflict({ error: 'x', code: 'game_running' })).toBe('A game is running in this lobby')
    expect(describeConflict({ error: 'x', code: 'already_member' })).toBe("They're already in the lobby")
    expect(describeConflict({ error: 'x', code: 'already_invited' })).toBe("They're already invited")
  })

  it('passes the server\'s own words through otherwise', () => {
    expect(describeConflict({ error: 'Lena already has a game running', code: 'active_session' })).toBe('Lena already has a game running')
    expect(describeConflict({ error: 'board busy', code: 'board_busy' })).toBe('board busy')
    expect(describeConflict({ error: 'lobby not found' })).toBe('lobby not found')
  })
})
