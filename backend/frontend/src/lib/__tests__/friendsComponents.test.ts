import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import FriendRow from '../components/friends/FriendRow.svelte'
import RequestsPanel from '../components/friends/RequestsPanel.svelte'
import FriendSearch from '../components/friends/FriendSearch.svelte'
import StatusDot from '../components/friends/StatusDot.svelte'
import FriendsTabsHarness from './fixtures/FriendsTabsHarness.svelte'

const lena = {
  id: 'lena',
  name: 'Lena',
  friendsSince: '2026-10-01T10:00:00.000Z',
  status: { kind: 'lobby' as const, lobbyId: 'l1', lobbyName: 'Friday darts', joinable: true },
  inYourLobby: false,
  invited: false,
  avatar: { kind: 'none' as const },
}
const noop = () => {}

describe('FriendRow', () => {
  it('shows name, @handle, the status line and Join for a joinable lobby', () => {
    const out = render(FriendRow, {
      props: { friend: lena, action: 'join', busy: false, oninvite: noop, onjoin: noop, onremove: noop },
    }).body
    expect(out).toContain('>Lena<')
    expect(out).toContain('@Lena')
    expect(out).toContain('In Friday darts')
    expect(out).toContain('Join')
    expect(out).not.toContain('Invite to lobby')
    expect(out).toContain('aria-label="More for Lena"')
  })

  it('Invite to lobby, then Invited; the pill when they are in your lobby', () => {
    const row = (action: 'invite' | 'invited' | 'in-lobby') =>
      render(FriendRow, { props: { friend: lena, action, busy: false, oninvite: noop, onjoin: noop, onremove: noop } }).body
    expect(row('invite')).toContain('Invite to lobby')
    expect(row('invited')).toContain('Invited')
    expect(row('in-lobby')).toContain('In your lobby')
  })
})

describe('FriendRow badges', () => {
  const row = (friend: typeof lena & { country?: string; average?: number }) =>
    render(FriendRow, { props: { friend, action: 'invite', busy: false, oninvite: noop, onjoin: noop, onremove: noop } }).body
  it('shows the flag and the average class next to the name', () => {
    const out = row({ ...lena, country: 'AT', average: 72.5 })
    expect(out).toContain('alt="Austria"')
    expect(out).toContain('class 70+')
  })
  it('draws neither without a country or an average', () => {
    const out = row(lena)
    expect(out).not.toContain('<img')
    expect(out).not.toContain('X01 average')
  })
})

describe('RequestsPanel', () => {
  it('lists requests for you and sent by you, or says there are none', () => {
    const empty = render(RequestsPanel, {
      props: { incoming: [], outgoing: [], now: new Date(), emptyText: 'No open requests.', busy: false, onanswer: noop, oncancel: noop },
    }).body
    expect(empty).toContain('No open requests.')
    const out = render(RequestsPanel, {
      props: {
        incoming: [
          {
            id: 'f1',
            from: { id: 'felix', name: 'Felix', avatar: { kind: 'none' as const } },
            mutualFriends: 3,
            createdAt: new Date().toISOString(),
          },
        ],
        outgoing: [
          { id: 'f2', to: { id: 'nina', name: 'nina_darts', avatar: { kind: 'none' as const } }, createdAt: new Date().toISOString() },
        ],
        now: new Date(),
        emptyText: 'No open requests.',
        busy: false,
        onanswer: noop,
        oncancel: noop,
      },
    }).body
    expect(out).toContain('Requests for you · 1')
    expect(out).toContain('3 friends in common')
    expect(out).toContain('Accept')
    expect(out).toContain('Decline')
    expect(out).toContain('Sent by you · 1')
    expect(out).toContain('@nina_darts')
    expect(out).toContain('Cancel')
  })
})

describe('request rows', () => {
  const finish = 'chrome'
  const felix = {
    id: 'felix',
    name: 'Felix',
    avatar: { kind: 'preset' as const, foreground: finish, background: finish },
    country: 'AT',
    average: 72.5,
  }
  const panel = (user: typeof felix | Omit<typeof felix, 'country' | 'average'>) =>
    render(RequestsPanel, {
      props: {
        incoming: [{ id: 'f1', from: user, mutualFriends: 0, createdAt: new Date().toISOString() }],
        outgoing: [{ id: 'f2', to: user, createdAt: new Date().toISOString() }],
        now: new Date(),
        emptyText: '',
        busy: false,
        onanswer: noop,
        oncancel: noop,
      },
    }).body
  it('shows the flag, the average class and the real picture, also on a request you sent', () => {
    const out = panel(felix)
    expect(out.match(/alt="Austria"/g)).toHaveLength(2)
    expect(out.match(/aria-label="X01 average 72.5 · class 70\+"/g)).toHaveLength(2)
    expect(out).not.toContain('border-dashed')
  })
  it('draws no badges without a country or an average', () => {
    const { country: _c, average: _a, ...bare } = felix
    const out = panel(bare)
    expect(out).not.toContain('<img')
    expect(out).not.toContain('X01 average')
  })
})

describe('FriendSearch', () => {
  it('is one labelled combobox with the rule line under it', () => {
    const out = render(FriendSearch, { props: { query: '', friends: [lena], outgoing: [], onquery: noop } }).body
    expect(out).toContain('role="combobox"')
    expect(out).toContain('aria-label="Search friends or find people"')
    expect(out).toContain('placeholder="Search friends, or find people by name or email"')
    expect(out).toContain('Names: type 3 or more letters. Email: exact address only.')
    expect(out).not.toContain('Clear search')
  })

  it('offers to clear what is typed', () => {
    const out = render(FriendSearch, { props: { query: 'len', friends: [lena], outgoing: [], onquery: noop } }).body
    expect(out).toContain('aria-label="Clear search"')
  })
})

describe('StatusDot', () => {
  it('is a hollow grey ring when offline, red while playing', () => {
    expect(render(StatusDot, { props: { kind: 'offline' } }).body).toContain('border-text-dim')
    expect(render(StatusDot, { props: { kind: 'playing' } }).body).toContain('border-live')
  })
})

describe('FriendsTabs', () => {
  // Server-rendered: bits-ui wires aria-controls and the roving tab order once it mounts
  it('marks the selected tab and renders the panel it controls', () => {
    const out = render(FriendsTabsHarness, { props: { tab: 'online', counts: { all: 3, online: 2, requests: 1 } } }).body
    expect(out.match(/role="tab"/g)).toHaveLength(3)
    expect(out).toMatch(/aria-selected="true"[^>]*>(<!---->)?Online · 2/)
    expect(out).toMatch(/aria-selected="false"[^>]*>(<!---->)?All · 3/)
    expect(out).toMatch(/id="p" role="tabpanel"/)
  })
})
