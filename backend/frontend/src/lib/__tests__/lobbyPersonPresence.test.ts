// A lobby row shows presence the way friends do: a ring around the avatar, not a corner dot.
import { describe, it, expect } from 'vitest'
import { createRawSnippet } from 'svelte'
import { render } from 'svelte/server'
import type { Lobby, LobbyPerson } from '../api/lobby-ws'
import PersonRow from '../components/lobby/PersonRow.svelte'

const person = (over: Partial<LobbyPerson>): LobbyPerson => ({
  id: 'p',
  userId: 'chris',
  addedByUserId: 'chris',
  name: 'Christoph',
  boardId: null,
  boardName: null,
  boardOwnerUserId: null,
  boardOnline: false,
  boardMovedBy: null,
  usualBoardName: null,
  plays: true,
  ready: false,
  team: null,
  presence: null,
  bot: null,
  avatar: { kind: 'preset', foreground: 'classic', background: 'classic' },
  ...over,
})

const lobby: Lobby = {
  id: 'l1',
  name: 'Friday darts',
  code: 'K7Q4MD',
  hostUserId: 'chris',
  hostName: 'Christoph',
  throwOrder: 'lobby',
  access: 'friends',
  currentSessionId: null,
  createdAt: '2026-10-02T19:40:00.000Z',
  invites: [],
  activity: [],
  solo: false,
  nextHostName: null,
  people: [],
  nextGame: null,
}

const empty = createRawSnippet(() => ({ render: () => '<span></span>' }))
const row = (p: LobbyPerson) =>
  render(PersonRow, { props: { person: p, index: 0, lobby: { ...lobby, people: [p] }, viewerId: 'chris', board: empty, controls: empty } })
    .body
// StatusRing's own classes: a 2.5px ring just outside the avatar
const ring = (html: string) => /-inset-1 rounded-full border-\[2.5px\][^"]*border-(accent|text-dim)/.exec(html)?.[1] ?? null

describe('PersonRow presence', () => {
  it('rings a member who has the lobby open in lime, and one who is away in grey', () => {
    expect(ring(row(person({ presence: 'online' })))).toBe('accent')
    expect(ring(row(person({ presence: 'away' })))).toBe('text-dim')
  })

  it('draws no ring for a guest or a bot, who have no presence', () => {
    expect(ring(row(person({ userId: null, presence: null, avatar: { kind: 'none' } })))).toBeNull()
    expect(ring(row(person({ userId: null, presence: null, bot: { level: 3 } })))).toBeNull()
  })

  it('has no corner dot on the avatar', () => {
    expect(row(person({ presence: 'online' }))).not.toMatch(/-bottom-px/)
  })
})
