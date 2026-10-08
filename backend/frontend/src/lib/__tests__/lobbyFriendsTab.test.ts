import { describe, it, expect } from 'vitest'
import type { Friend } from '../api/lobby-ws'
import { lobbyFriendRows } from '../lobby/friendsTab.js'

const f = (name: string, kind: 'online' | 'offline' | 'playing', extra: Partial<Friend> = {}): Friend => ({
  id: name.toLowerCase(),
  name,
  friendsSince: '2026-10-01T10:00:00.000Z',
  status: kind === 'playing' ? { kind, gameId: 'atc' } : { kind },
  inYourLobby: false,
  invited: false,
  ...extra,
})

describe('lobbyFriendRows', () => {
  it('friends to invite first, then invites waiting, then those in the lobby, then offline', () => {
    const rows = lobbyFriendRows([
      f('Sophie', 'offline'),
      f('Max', 'online', { inYourLobby: true, status: { kind: 'lobby', lobbyId: 'l', lobbyName: 'Friday darts', joinable: true } }),
      f('Tom', 'playing'),
      f('Pia', 'online', { invited: true }),
      f('Mara', 'online'),
    ])
    expect(rows.map(r => [r.friend.name, r.state])).toEqual([
      ['Mara', 'invite'],
      ['Tom', 'invite'],
      ['Pia', 'invited'],
      ['Max', 'in-lobby'],
      ['Sophie', 'invite'],
    ])
  })

  it('words each row', () => {
    const rows = lobbyFriendRows([f('Tom', 'playing'), f('Pia', 'online', { invited: true }), f('Sophie', 'offline')])
    expect(rows.map(r => [r.line, r.tone])).toEqual([
      ['Playing Around the Clock', 'playing'],
      ['Invite sent · waiting for Pia', 'ink'],
      ['Offline · sees the invite next time', 'muted'],
    ])
  })
})
