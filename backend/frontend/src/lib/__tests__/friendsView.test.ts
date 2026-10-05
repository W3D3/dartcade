import { describe, it, expect } from 'vitest'
import type { Friend } from '../api/lobby-ws'
import {
  incomingMeta,
  joinRefusal,
  tabAfterKey,
  outgoingMeta,
  parseFriendName,
  rowAction,
  sendOutcome,
  splitOnline,
  statusLine,
  tabCounts,
} from '../friends/view.js'

const friend = (f: Partial<Friend> = {}): Friend => ({
  id: 'lena',
  name: 'Lena',
  friendsSince: '2026-10-01T10:00:00.000Z',
  status: { kind: 'online' },
  inYourLobby: false,
  invited: false,
  ...f,
})
const now = new Date('2026-10-04T20:00:00')

describe('statusLine', () => {
  it('says what they do, coloured by kind', () => {
    expect(statusLine(friend())).toEqual({ text: 'Online', tone: 'ink' })
    expect(statusLine(friend({ status: { kind: 'lobby', lobbyId: 'l1', lobbyName: 'Friday darts', joinable: true } }))).toEqual({
      text: 'In Friday darts',
      tone: 'ink',
    })
    expect(
      statusLine(friend({ inYourLobby: true, status: { kind: 'lobby', lobbyId: 'l1', lobbyName: 'Friday darts', joinable: false } })),
    ).toEqual({ text: 'In your lobby · Friday darts', tone: 'ink' })
    expect(statusLine(friend({ status: { kind: 'playing', gameId: 'x01' } }))).toEqual({ text: 'Playing X01', tone: 'playing' })
    expect(statusLine(friend({ status: { kind: 'offline' } }))).toEqual({ text: 'Offline', tone: 'muted' })
  })
})

describe('rowAction', () => {
  const lobby = { kind: 'lobby' as const, lobbyId: 'l1', lobbyName: 'Friday darts', joinable: true }
  it('in your lobby, then join, then invite (when you are in a lobby), then invited', () => {
    expect(rowAction(friend({ inYourLobby: true, status: lobby }), true)).toBe('in-lobby')
    expect(rowAction(friend({ status: lobby }), true)).toBe('join')
    expect(rowAction(friend(), true)).toBe('invite')
    expect(rowAction(friend({ invited: true }), true)).toBe('invited')
    expect(rowAction(friend(), false)).toBeNull()
    expect(rowAction(friend({ status: { kind: 'offline' } }), true)).toBe('invite')
  })
})

describe('lists and counts', () => {
  it('splits online from offline and counts the tabs', () => {
    const list = {
      friends: [friend(), friend({ id: 'max', status: { kind: 'offline' } })],
      incoming: [{ id: 'f1', from: { id: 'sam', name: 'sam.180' }, mutualFriends: 3, createdAt: '2026-10-04T19:50:00' }],
      outgoing: [],
    }
    expect(splitOnline(list.friends)).toEqual({ online: [list.friends[0]], offline: [list.friends[1]] })
    expect(tabCounts(list)).toEqual({ all: 2, online: 1, requests: 1 })
    expect(incomingMeta(list.incoming[0], now)).toBe('3 friends in common · 10 min ago')
    expect(incomingMeta({ ...list.incoming[0], mutualFriends: 1 }, now)).toBe('1 friend in common · 10 min ago')
    expect(incomingMeta({ ...list.incoming[0], mutualFriends: 0 }, now)).toBe('10 min ago')
    expect(outgoingMeta({ id: 'f2', to: { id: 'nina', name: 'nina_darts' }, createdAt: '2026-10-03T18:40:00' }, now)).toBe(
      'Sent yesterday, 18:40',
    )
  })
})

describe('adding a friend', () => {
  it('takes a name with or without @', () => {
    expect(parseFriendName('  @sam.180 ')).toBe('sam.180')
  })
  it('says how it went, in the design copy', () => {
    expect(sendOutcome(201, undefined, 'sam.180')).toEqual({ ok: true, text: 'Request sent to @sam.180' })
    expect(sendOutcome(200, undefined, 'sam.180')).toEqual({ ok: true, text: "They asked you first — you're friends now" })
    expect(sendOutcome(404, { error: 'No player called sam' }, 'sam')).toEqual({ ok: false, text: 'No player called sam' })
    expect(sendOutcome(409, { error: 'x', code: 'already_friends' }, 'lena')).toEqual({ ok: false, text: "You're already friends" })
    expect(sendOutcome(409, { error: 'x', code: 'already_requested' }, 'lena')).toEqual({ ok: false, text: 'Request already sent' })
    expect(sendOutcome(400, { error: "You can't add yourself" }, 'me')).toEqual({ ok: false, text: "You can't add yourself" })
  })
})

describe('joinRefusal', () => {
  it('explains a refused join', () => {
    expect(joinRefusal(403, { error: 'x' })).toBe("You can't join that lobby without its code any more")
    expect(joinRefusal(404, { error: 'x' })).toBe('That lobby has closed')
    expect(joinRefusal(409, { error: 'x', code: 'active_session', sessionId: 's1' })).toBe('You already have a game running')
  })
})

describe('tabAfterKey', () => {
  it('moves along the tabs with the arrows, wrapping, and jumps with Home and End', () => {
    expect(tabAfterKey('ArrowRight', 'all')).toBe('online')
    expect(tabAfterKey('ArrowRight', 'requests')).toBe('all')
    expect(tabAfterKey('ArrowLeft', 'all')).toBe('requests')
    expect(tabAfterKey('ArrowLeft', 'online')).toBe('all')
    expect(tabAfterKey('Home', 'requests')).toBe('all')
    expect(tabAfterKey('End', 'all')).toBe('requests')
  })
  it('ignores other keys', () => {
    expect(tabAfterKey('Enter', 'all')).toBeNull()
    expect(tabAfterKey('ArrowDown', 'online')).toBeNull()
  })
})
