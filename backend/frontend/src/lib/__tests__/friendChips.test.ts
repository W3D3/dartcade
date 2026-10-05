import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import type { Friend } from '../api/lobby-ws'
import { friendChips, friendMatches } from '../lobby/friendChips.js'
import FriendChips from '../components/lobby/FriendChips.svelte'

const f = (id: string, name: string, kind: 'online' | 'offline' | 'playing'): Friend => ({
  id,
  name,
  friendsSince: '2026-10-01T10:00:00.000Z',
  status: kind === 'playing' ? { kind, gameId: 'x01' } : { kind },
  inYourLobby: false,
  invited: false,
})
const friends = [f('max', 'Max', 'offline'), f('lena', 'Lena', 'online'), f('jonas', 'Jonas', 'playing'), f('ana', 'Ana', 'offline')]

describe('friendChips', () => {
  it('online first, then by name; not those in the lobby or invited; at most six', () => {
    expect(friendChips(friends, ['jonas']).map(c => [c.name, c.online])).toEqual([
      ['Lena', true],
      ['Ana', false],
      ['Max', false],
    ])
    expect(friendChips(friends, [])[0].aria).toBe('Add your friend Jonas, online now')
    expect(
      friendChips(
        Array.from({ length: 9 }, (_, i) => f(`u${i}`, `P${i}`, 'online')),
        [],
      ),
    ).toHaveLength(6)
  })
})

describe('friendMatches', () => {
  it('friends whose name starts with what is typed, any case', () => {
    expect(friendMatches(friends, 'ma', []).map(x => x.name)).toEqual(['Max'])
    expect(friendMatches(friends, 'L', ['lena'])).toEqual([])
  })
})

describe('FriendChips', () => {
  it('shows "Friends:", a + chip per friend and All friends', () => {
    const out = render(FriendChips, { props: { chips: friendChips(friends, []), onpick: () => {} } }).body
    expect(out).toContain('Friends:')
    expect(out).toContain('aria-label="Add your friend Lena, online now"')
    expect(out).toContain('+ Lena')
    expect(out).toContain('href="#/friends"')
    expect(render(FriendChips, { props: { chips: [], onpick: () => {} } }).body).not.toContain('Friends:')
  })
})
