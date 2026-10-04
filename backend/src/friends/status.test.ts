import { describe, it, expect } from 'vitest'
import { friendStatus, seatedGame, type StatusFacts } from './status.js'

const lobby = { id: 'l1', name: 'Friday darts', access: 'friends' as const, hostUserId: 'lena' }
const facts = (f: Partial<StatusFacts> = {}): StatusFacts => ({ online: true, invisible: false, game: null, lobby: null, ...f })
const friendsOfViewer = new Set(['lena'])

describe('friendStatus', () => {
  it('first match wins: playing, then lobby, then online', () => {
    expect(friendStatus(facts({ game: { gameId: 'x01' }, lobby }), friendsOfViewer)).toEqual({ kind: 'playing', gameId: 'x01' })
    expect(friendStatus(facts({ lobby }), friendsOfViewer)).toEqual({ kind: 'lobby', lobbyId: 'l1', lobbyName: 'Friday darts', joinable: true })
    expect(friendStatus(facts(), friendsOfViewer)).toEqual({ kind: 'online' })
  })

  it('joinable only while open to friends and hosted by your friend', () => {
    expect(friendStatus(facts({ lobby: { ...lobby, access: 'invite' } }), friendsOfViewer)).toMatchObject({ joinable: false })
    expect(friendStatus(facts({ lobby: { ...lobby, hostUserId: 'sam' } }), friendsOfViewer)).toMatchObject({ joinable: false })
    expect(friendStatus(facts({ lobby: { ...lobby, hostUserId: null } }), friendsOfViewer)).toMatchObject({ joinable: false })
  })

  it('offline, or Invisible, shows offline and nothing about lobbies or games', () => {
    expect(friendStatus(facts({ online: false, lobby, game: { gameId: 'x01' } }), friendsOfViewer)).toEqual({ kind: 'offline' })
    expect(friendStatus(facts({ invisible: true, lobby, game: { gameId: 'x01' } }), friendsOfViewer)).toEqual({ kind: 'offline' })
  })
})

describe('seatedGame', () => {
  const seat = (userId: string | null, controllerUserId: string) => ({ name: 'x', userId, controllerUserId, boardId: null, boardName: null })
  const session = (status: string, seats: ReturnType<typeof seat>[]) => ({ status, seats, module: { id: 'x01' } }) as any

  it('a seat of your own or one you throw for, in a running game', () => {
    expect(seatedGame(session('active', [seat('lena', 'lena')]), 'lena')).toEqual({ gameId: 'x01' })
    expect(seatedGame(session('active', [seat(null, 'lena')]), 'lena')).toEqual({ gameId: 'x01' })
    expect(seatedGame(session('active', [seat('max', 'max')]), 'lena')).toBeNull()
    expect(seatedGame(session('finished', [seat('lena', 'lena')]), 'lena')).toBeNull()
    expect(seatedGame(undefined, 'lena')).toBeNull()
  })

  it('a host who sits out is not playing; a seated host is', () => {
    const hosted = (seats: ReturnType<typeof seat>[]) => ({ status: 'active', ownerUserId: 'lena', seats, module: { id: 'x01' } }) as any
    expect(seatedGame(hosted([seat('max', 'max')]), 'lena')).toBeNull()
    expect(seatedGame(hosted([seat('max', 'max'), seat('lena', 'lena')]), 'lena')).toEqual({ gameId: 'x01' })
  })
})
