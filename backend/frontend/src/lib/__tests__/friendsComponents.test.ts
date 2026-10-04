import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import FriendRow from '../components/friends/FriendRow.svelte'
import RequestsPanel from '../components/friends/RequestsPanel.svelte'
import AddFriendCard from '../components/friends/AddFriendCard.svelte'
import StatusDot from '../components/friends/StatusDot.svelte'
import FriendsTabs from '../components/friends/FriendsTabs.svelte'

const lena = { id: 'lena', name: 'Lena', friendsSince: '2026-10-01T10:00:00.000Z', status: { kind: 'lobby' as const, lobbyId: 'l1', lobbyName: 'Friday darts', joinable: true }, inYourLobby: false, invited: false }
const noop = () => {}

describe('FriendRow', () => {
  it('shows name, @handle, the status line and Join for a joinable lobby', () => {
    const out = render(FriendRow, { props: { friend: lena, action: 'join', busy: false, oninvite: noop, onjoin: noop, onremove: noop } }).body
    expect(out).toContain('>Lena<')
    expect(out).toContain('@Lena')
    expect(out).toContain('In Friday darts')
    expect(out).toContain('Join')
    expect(out).not.toContain('Invite to lobby')
    expect(out).toContain('aria-label="More for Lena"')
  })

  it('Invite to lobby, then Invited; the pill when they are in your lobby', () => {
    const row = (action: 'invite' | 'invited' | 'in-lobby') => render(FriendRow, { props: { friend: lena, action, busy: false, oninvite: noop, onjoin: noop, onremove: noop } }).body
    expect(row('invite')).toContain('Invite to lobby')
    expect(row('invited')).toContain('Invited')
    expect(row('in-lobby')).toContain('In your lobby')
  })
})

describe('RequestsPanel', () => {
  it('lists requests for you and sent by you, or says there are none', () => {
    const empty = render(RequestsPanel, { props: { incoming: [], outgoing: [], now: new Date(), emptyText: 'No open requests.', busy: false, onanswer: noop, oncancel: noop } }).body
    expect(empty).toContain('No open requests.')
    const out = render(RequestsPanel, { props: {
      incoming: [{ id: 'f1', from: { id: 'felix', name: 'Felix' }, mutualFriends: 3, createdAt: new Date().toISOString() }],
      outgoing: [{ id: 'f2', to: { id: 'nina', name: 'nina_darts' }, createdAt: new Date().toISOString() }],
      now: new Date(), emptyText: 'No open requests.', busy: false, onanswer: noop, oncancel: noop,
    } }).body
    expect(out).toContain('Requests for you · 1')
    expect(out).toContain('3 friends in common')
    expect(out).toContain('Accept')
    expect(out).toContain('Decline')
    expect(out).toContain('Sent by you · 1')
    expect(out).toContain('@nina_darts')
    expect(out).toContain('Cancel')
  })
})

describe('AddFriendCard', () => {
  it('has the field, the button and the helper copy', () => {
    const out = render(AddFriendCard, { props: {} }).body
    expect(out).toContain('placeholder="@username"')
    expect(out).toContain('Send request')
    expect(out).toContain("They'll see it in Friends and on their badge. Once they accept, you see each other's status.")
  })
})

describe('StatusDot', () => {
  it('is a hollow grey ring when offline, red while playing', () => {
    expect(render(StatusDot, { props: { kind: 'offline' } }).body).toContain('border-text-dim')
    expect(render(StatusDot, { props: { kind: 'playing' } }).body).toContain('bg-live')
  })
})

describe('FriendsTabs', () => {
  it('controls the panel, with only the selected tab in the tab order', () => {
    const out = render(FriendsTabs, { props: { tab: 'online', counts: { all: 3, online: 2, requests: 1 }, panelId: 'p' } }).body
    expect(out.match(/aria-controls="p"/g)).toHaveLength(3)
    expect(out).toMatch(/id="friends-tab-online"[^>]*aria-selected="true"[^>]*tabindex="0"/)
    expect(out).toMatch(/id="friends-tab-all"[^>]*aria-selected="false"[^>]*tabindex="-1"/)
  })
})
