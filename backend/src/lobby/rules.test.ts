import { describe, it, expect } from 'vitest'
import type { LobbyPerson, LobbyState } from './types.js'
import { canMove, canRemove, canSetBoard, canSetPlays, canSetReady, isHost, isSolo, leavingWith, nextHost, reorder } from './rules.js'

const person = (over: Partial<LobbyPerson>): LobbyPerson => ({
  id: 'p', userId: null, addedByUserId: 'chris', name: 'X', boardId: null, boardName: null, boardOwnerUserId: null,
  position: 0, plays: true, ready: false, boardMovedBy: null, joinedAt: new Date(0), usualBoardName: null, ...over,
})
const lobbyOf = (people: LobbyPerson[], hostUserId: string | null = 'chris'): LobbyState => ({
  id: 'l', name: 'L', hostUserId, code: 'AAAAAA', throwOrder: 'lobby', nextGame: null, lastGame: null,
  createdAt: new Date(0), closedAt: null, people, invites: [], activity: [],
})

const chris = person({ id: 'c', userId: 'chris', addedByUserId: 'chris', name: 'Christoph', boardId: 'living', boardOwnerUserId: 'chris', position: 0 })
const lena = person({ id: 'l', userId: 'lena', addedByUserId: 'lena', name: 'Lena', boardId: 'lenas', boardOwnerUserId: 'lena', position: 1, joinedAt: new Date(1) })
const max = person({ id: 'm', userId: 'max', addedByUserId: 'max', name: 'Max', position: 2, joinedAt: new Date(2) })
const guest = person({ id: 'g', userId: null, addedByUserId: 'lena', name: 'Guest 1', boardId: 'lenas', boardOwnerUserId: 'lena', position: 3 })
const living = { boardId: 'living', ownerUserId: 'chris' }
const garage = { boardId: 'garage', ownerUserId: 'chris' }
const lenas = { boardId: 'lenas', ownerUserId: 'lena' }
const lobby = lobbyOf([chris, lena, max, guest])

describe('canSetBoard', () => {
  it('anyone gives a person on Manual one of their own boards', () => {
    expect(canSetBoard('chris', max, living)).toBe(true)
    expect(canSetBoard('lena', max, lenas)).toBe(true)
  })

  it('nobody gives out a board they don\'t own', () => {
    expect(canSetBoard('chris', max, lenas)).toBe(false)
    expect(canSetBoard('max', max, living)).toBe(false)
  })

  it('once someone has a board, only they (or a guest\'s adder) change it; the host has no extra rights', () => {
    expect(canSetBoard('chris', lena, living)).toBe(false)
    expect(canSetBoard('lena', lena, null)).toBe(true)
    expect(canSetBoard('lena', guest, lenas)).toBe(true)
    expect(canSetBoard('chris', guest, living)).toBe(false)
  })

  it('the board\'s owner takes it back to Manual, from anyone, but can\'t swap it for another', () => {
    const maxOnLiving = person({ id: 'x', userId: 'max', addedByUserId: 'max', boardId: 'living', boardOwnerUserId: 'chris' })
    expect(canSetBoard('chris', maxOnLiving, null)).toBe(true)
    expect(canSetBoard('lena', maxOnLiving, null)).toBe(false)
    expect(canSetBoard('chris', maxOnLiving, garage)).toBe(false)
  })

  it('only the person moves themselves from Manual to Manual', () => {
    expect(canSetBoard('max', max, null)).toBe(true)
    expect(canSetBoard('chris', max, null)).toBe(false)
  })
})

describe('ready, plays, order, removal', () => {
  it('ready: only the person or a guest\'s adder, not even the host', () => {
    expect(canSetReady('lena', lena)).toBe(true)
    expect(canSetReady('lena', guest)).toBe(true)
    expect(canSetReady('chris', lena)).toBe(false)
  })

  it('plays: the person, a guest\'s adder, or the host', () => {
    expect(canSetPlays(lobby, 'max', max)).toBe(true)
    expect(canSetPlays(lobby, 'lena', guest)).toBe(true)
    expect(canSetPlays(lobby, 'chris', lena)).toBe(true)
    expect(canSetPlays(lobby, 'max', lena)).toBe(false)
  })

  it('only the host reorders', () => {
    expect(canMove(lobby, 'chris')).toBe(true)
    expect(canMove(lobby, 'lena')).toBe(false)
  })

  it('the host removes anyone else; members remove only their own guests; nobody removes themselves', () => {
    expect(canRemove(lobby, 'chris', lena)).toBe(true)
    expect(canRemove(lobby, 'chris', guest)).toBe(true)
    expect(canRemove(lobby, 'lena', guest)).toBe(true)
    expect(canRemove(lobby, 'max', guest)).toBe(false)
    expect(canRemove(lobby, 'lena', max)).toBe(false)
    expect(canRemove(lobby, 'chris', chris)).toBe(false)
  })

  it('a host who isn\'t in the lobby any more has no host rights', () => {
    expect(isHost(lobbyOf([lena, max], 'chris'), 'chris')).toBe(false)
  })
})

describe('membership changes', () => {
  it('the member who has been in the lobby longest takes over (ties: lobby order)', () => {
    expect(nextHost(lobbyOf([guest, max, lena], null))).toEqual({ userId: 'lena', name: 'Lena' })
    const tied = person({ id: 't', userId: 'sam', addedByUserId: 'sam', name: 'Sam', joinedAt: new Date(1), position: 0 })
    expect(nextHost(lobbyOf([lena, tied], null))).toEqual({ userId: 'sam', name: 'Sam' })
    expect(nextHost(lobbyOf([guest], null))).toBeNull()
  })

  it('excludes the current host, even when they joined first', () => {
    expect(nextHost(lobbyOf([chris, lena, guest], 'chris'))).toEqual({ userId: 'lena', name: 'Lena' })
    expect(nextHost(lobbyOf([chris, guest], 'chris'))).toBeNull()
  })

  it('isSolo: true with just one account, whatever guests or invites come with it', () => {
    expect(isSolo(lobbyOf([chris, guest]))).toBe(true)
    expect(isSolo(lobbyOf([chris, lena, guest]))).toBe(false)
    expect(isSolo(lobbyOf([guest]))).toBe(true)
  })

  it('a member leaves with their guests', () => {
    expect(leavingWith(lobby, 'lena').map(p => p.id)).toEqual(['l', 'g'])
  })

  it('reorders by moving one person to an index (clamped)', () => {
    expect(reorder(lobby.people, 'm', 0)).toEqual(['m', 'c', 'l', 'g'])
    expect(reorder(lobby.people, 'c', 99)).toEqual(['l', 'm', 'g', 'c'])
  })
})
