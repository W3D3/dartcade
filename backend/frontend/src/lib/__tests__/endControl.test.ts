import { describe, it, expect } from 'vitest'
import type { Snapshot } from '$lib/api'
import { endControl, afterGameRoute, leaveRefused, winActions } from '../endControl.js'
import fixture from './fixtures/x01-snapshot.json'

const snap = (patch: { ownerUserId?: string; mySeats?: number[]; rankedGame?: boolean; lobbyId?: string | null } = {}): Snapshot => {
  const base = structuredClone(fixture) as unknown as Snapshot
  return {
    ...base,
    ownerUserId: patch.ownerUserId ?? base.ownerUserId,
    mySeats: patch.mySeats ?? base.mySeats,
    rankedGame: patch.rankedGame ?? base.rankedGame,
    lobbyId: patch.lobbyId === undefined ? base.lobbyId : patch.lobbyId,
  }
}

const rankedSnap = (patch: Parameters<typeof snap>[0]): Snapshot => ({
  ...snap(patch),
  ranked: {
    now: '2026-11-04T12:00:00Z',
    visitSeconds: 120,
    reserveSeconds: 300,
    manualEntry: true,
    visitDeadline: '2026-11-04T12:02:00Z',
    forfeitAt: '2026-11-04T12:07:00Z',
    seats: [],
  },
})

describe('endControl', () => {
  it('gives the host of a ranked game Leave, not End: it can only be forfeited', () => {
    expect(endControl(rankedSnap({ ownerUserId: 'host', mySeats: [0] }), 'host')).toBe('leave')
    expect(endControl(rankedSnap({ ownerUserId: 'host', mySeats: [] }), 'host')).toBeNull()
  })

  it('gives the host End', () => {
    expect(endControl(snap({ ownerUserId: 'host', mySeats: [0] }), 'host')).toBe('end')
  })

  it('gives the owner of a ranked game Leave, never End', () => {
    expect(endControl(snap({ ownerUserId: 'host', mySeats: [0], rankedGame: true }), 'host')).toBe('leave')
  })

  it('gives a seated non-host Leave', () => {
    expect(endControl(snap({ ownerUserId: 'host', mySeats: [1] }), 'guest')).toBe('leave')
  })

  it('gives a seatless watcher neither', () => {
    expect(endControl(snap({ ownerUserId: 'host', mySeats: [] }), 'watcher')).toBeNull()
  })

  it('gives a signed-out viewer Leave if seated, never End', () => {
    expect(endControl(snap({ ownerUserId: 'host', mySeats: [1] }), null)).toBe('leave')
  })

  it('nobody acts without a snapshot', () => {
    expect(endControl(null, 'host')).toBeNull()
  })
})

describe('afterGameRoute', () => {
  it('goes back to the lobby after a lobby game', () => {
    expect(afterGameRoute(snap({ lobbyId: 'l1' }))).toBe('/lobby')
  })

  it('goes home after a game outside a lobby, or without a snapshot', () => {
    expect(afterGameRoute(snap({ lobbyId: null }))).toBe('/')
    expect(afterGameRoute(null)).toBe('/')
  })
})

describe('leaveRefused', () => {
  const withHostSeat = (hostSeat: number | null): Snapshot => {
    const base = snap({ ownerUserId: 'host' })
    return { ...base, seats: base.seats.map((s, i) => ({ ...s, userId: i === hostSeat ? 'host' : null })) }
  }

  it('names the host who can end the game, from their seat', () => {
    expect(leaveRefused(withHostSeat(1))).toBe('Only Bob can end this game.')
  })

  it('says "the host" when the host has no seat', () => {
    expect(leaveRefused(withHostSeat(null))).toBe('Only the host can end this game.')
    expect(leaveRefused(null)).toBe('Only the host can end this game.')
  })
})

describe('winActions', () => {
  it('the host of a lobby game: Rematch, then Back to lobby', () => {
    expect(winActions(snap({ ownerUserId: 'host', lobbyId: 'l1' }), 'host')).toEqual({ primary: 'rematch', secondary: 'lobby' })
  })

  it('anyone else in a lobby game: Back to lobby', () => {
    expect(winActions(snap({ ownerUserId: 'host', lobbyId: 'l1' }), 'lena')).toEqual({ primary: 'lobby', secondary: null })
    expect(winActions(snap({ ownerUserId: 'host', lobbyId: 'l1' }), null)).toEqual({ primary: 'lobby', secondary: null })
  })

  it('a game outside a lobby: Back to Play', () => {
    expect(winActions(snap({ ownerUserId: 'host', lobbyId: null }), 'host')).toEqual({ primary: 'play', secondary: null })
  })
})

describe('winActions in a ranked game', () => {
  it('goes on to the next match, whoever you are', () => {
    expect(winActions(rankedSnap({ ownerUserId: 'host' }), 'host')).toEqual({ primary: 'ranked', secondary: null })
    expect(winActions(rankedSnap({ ownerUserId: 'host' }), 'guest')).toEqual({ primary: 'ranked', secondary: null })
  })
})
