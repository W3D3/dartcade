// What people type on the lobby screens, and what the server's refusals mean for them.
import type { components } from '../api/schema'

type LobbyConflict = components['schemas']['LobbyConflict']

/** The longest guest name the server takes (AddGuestRequest in schema/api-v1.yaml). */
export const GUEST_NAME_MAX = 32

export type AddInput = { kind: 'guest'; name: string } | { kind: 'invite'; query: string } | { kind: 'invalid'; hint: string }

/** "Name or @username": a plain name adds a guest at your board, @ invites an account. */
export function parseAddInput(raw: string): AddInput {
  const s = raw.trim()
  if (s === '') return { kind: 'invalid', hint: 'Type a name, or @ and a username' }
  if (s.startsWith('@')) {
    const query = s.slice(1).trim()
    return query ? { kind: 'invite', query } : { kind: 'invalid', hint: 'Type a username after the @' }
  }
  if (s.length > GUEST_NAME_MAX) return { kind: 'invalid', hint: `Names can be ${GUEST_NAME_MAX} characters at most` }
  return { kind: 'guest', name: s }
}

/** Case, dashes and spaces don't matter (the server does the same: backend src/lobby/code.ts). */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** An error body from the lobby API: a plain `{ error }`, or a 409 with its code. */
export type Refusal = Pick<LobbyConflict, 'error'> &
  Partial<Pick<LobbyConflict, 'code' | 'notReady' | 'offlineBoards' | 'sessionId' | 'lobbyId'>>

/** One line for the screen. */
export function describeConflict(body: Refusal): string {
  switch (body.code) {
    case 'not_ready':
      return `Not ready yet: ${(body.notReady ?? []).map(p => p.name).join(', ')}`
    case 'board_offline':
      return `Board offline: ${(body.offlineBoards ?? []).join(', ')}`
    case 'in_lobby':
      return "You're in another lobby. Leave it first."
    case 'game_running':
      return 'A game is running in this lobby'
    case 'already_member':
      return "They're already in the lobby"
    case 'already_invited':
      return "They're already invited"
    case 'board_busy':
      return 'A board is in another game'
    // The server sends the game's id only when it's yours; otherwise its text names the player
    case 'active_session':
      return body.sessionId ? 'You already have a game running' : body.error
    default:
      return body.error
  }
}
