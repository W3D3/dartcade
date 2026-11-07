import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import LockedStatus from '../components/lobby/LockedStatus.svelte'
import PersonControls from '../components/lobby/PersonControls.svelte'
import type { Lobby, LobbyPerson } from '../api/lobby-ws'

const person = (over: Partial<LobbyPerson>): LobbyPerson => ({
  id: 'p',
  userId: 'u',
  addedByUserId: 'u',
  name: 'Lena',
  boardId: null,
  boardName: null,
  boardOwnerUserId: null,
  boardOnline: false,
  boardMovedBy: null,
  usualBoardName: null,
  plays: true,
  ready: true,
  team: null,
  presence: null,
  bot: null,
  avatar: { kind: 'none' },
  ...over,
})
const body = (p: LobbyPerson) => render(LockedStatus, { props: { person: p } }).body

describe('LockedStatus', () => {
  it('shows a ready player as Ready with a tick and a lock', () => {
    const out = body(person({}))
    expect(out).toContain('Ready')
    expect(out).toContain('Locked while you search')
    expect(out).toContain('lucide-check')
  })
  it('says what a player who is not ready, or sits out, is', () => {
    expect(body(person({ ready: false }))).toContain('Not ready')
    expect(body(person({ plays: false }))).toContain('Sits out')
    expect(body(person({ ready: false }))).not.toContain('lucide-check')
  })
})

describe("a person's controls while the duo searches", () => {
  const host = person({ id: 'h', userId: 'chris', name: 'Christoph' })
  const partner = person({ id: 'p', userId: 'lena', name: 'Lena' })
  const lobby: Lobby = {
    id: 'l1',
    name: 'Ranked duo',
    code: 'K7Q4MD',
    hostUserId: 'chris',
    hostName: 'Christoph',
    throwOrder: 'lobby',
    access: 'friends',
    nextGame: null,
    currentSessionId: null,
    createdAt: '2026-10-02T19:40:00.000Z',
    people: [host, partner],
    invites: [],
    activity: [],
    solo: false,
    nextHostName: 'Lena',
  }
  const body = (p: LobbyPerson, viewerId: string) =>
    render(PersonControls, {
      props: {
        lobby,
        person: p,
        index: 0,
        viewerId,
        onupdate: () => Promise.resolve(true),
        onremove: () => Promise.resolve(true),
        locked: true,
      },
    }).body

  it("keeps your own Ready, the partner's way out of the queue", () => {
    const out = body(partner, 'lena')
    expect(out).toContain('Lena is ready. Mark as not ready')
    expect(out).not.toContain('Locked while you search')
  })
  it("locks everyone else's row, and has no menu or In chip", () => {
    const out = body(host, 'lena')
    expect(out).toContain('Locked while you search')
    expect(out).not.toContain('sits out')
    expect(out).not.toContain('More')
  })
})
