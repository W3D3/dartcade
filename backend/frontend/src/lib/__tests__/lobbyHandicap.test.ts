import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import PersonControls from '../components/lobby/PersonControls.svelte'
import PersonRow from '../components/lobby/PersonRow.svelte'
import type { Lobby, LobbyPerson } from '../api/lobby-ws'
import type { X01Game } from '../api/game-ws'
import { canSetHandicap, handicapMarker, handicapPatch, playsHandicaps } from '../lobby/rules'
import { checkoutFor, type CallGame } from '../caller/calls'
import { createRawSnippet } from 'svelte'

// The lobby.handicap.enabled flag as a plain store, switched by setFlag
const flagStore = vi.hoisted(() => ({ set: (_on: boolean) => {} }))
vi.mock('$lib/flags', async () => {
  const { writable } = await import('svelte/store')
  const store = writable(true)
  flagStore.set = on => store.set(on)
  return { flag: () => store }
})
const setFlag = (on: boolean) => flagStore.set(on)

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
  handicap: null,
  ...over,
})
const host = person({ id: 'h', userId: 'chris', name: 'Christoph' })
const lena = person({ id: 'l', userId: 'lena', name: 'Lena', handicap: { startScore: 301, inMode: 'double' } })
const lobby = (nextGame: Lobby['nextGame']): Lobby => ({
  id: 'l1',
  name: 'Friday',
  code: 'K7Q4MD',
  hostUserId: 'chris',
  hostName: 'Christoph',
  throwOrder: 'lobby',
  access: 'friends',
  nextGame,
  currentSessionId: null,
  createdAt: '2026-10-02T19:40:00.000Z',
  people: [host, lena],
  invites: [],
  activity: [],
  solo: false,
  nextHostName: 'Lena',
})
const x01 = lobby({ gameId: 'x01', config: { startScore: 501, outMode: 'double' } })

describe('handicap rules', () => {
  it('only the host, only X01 singles', () => {
    expect(canSetHandicap(x01, 'chris')).toBe(true)
    expect(canSetHandicap(x01, 'lena')).toBe(false)
    expect(playsHandicaps(x01.nextGame)).toBe(true)
    expect(playsHandicaps({ gameId: 'x01', config: { format: 'teams' } })).toBe(false)
    expect(playsHandicaps({ gameId: 'cricket', config: {} })).toBe(false)
  })

  it("marks what differs from the next game's rules; nothing when the game doesn't play it", () => {
    expect(handicapMarker(x01, lena)).toBe('501 → 301, double in')
    expect(handicapMarker(x01, host)).toBeNull()
    expect(handicapMarker(lobby({ gameId: 'cricket', config: {} }), lena)).toBeNull()
    // The game moved to 301 itself: only the check-in still differs
    expect(handicapMarker(lobby({ gameId: 'x01', config: { startScore: 301 } }), lena)).toBe('double in')
  })

  it("sends only what differs from the game's rules, null for nothing", () => {
    const game = { startScore: 501, inMode: 'straight' as const, outMode: 'double' as const }
    expect(handicapPatch(game, { ...game, startScore: 301 })).toEqual({ startScore: 301 })
    expect(handicapPatch(game, { startScore: 701, inMode: 'master', outMode: 'straight' })).toEqual({
      startScore: 701,
      inMode: 'master',
      outMode: 'straight',
    })
    expect(handicapPatch(game, game)).toBeNull()
  })
})

describe('the handicap cog and marker', () => {
  const controls = (l: Lobby, viewerId: string) =>
    render(PersonControls, {
      props: { lobby: l, person: lena, index: 1, viewerId, onupdate: () => Promise.resolve(true), onremove: () => Promise.resolve(true) },
    }).body

  it('the host gets the cog in X01 singles, while the flag is on', () => {
    expect(controls(x01, 'chris')).toContain('Handicap for Lena')
    expect(controls(x01, 'lena')).not.toContain('Handicap for Lena')
    expect(controls(lobby({ gameId: 'atc', config: {} }), 'chris')).not.toContain('Handicap for Lena')
    setFlag(false)
    expect(controls(x01, 'chris')).not.toContain('Handicap for Lena')
    setFlag(true)
  })

  it('the row shows everyone what the handicap changes', () => {
    const empty = createRawSnippet(() => ({ render: () => '<span></span>' }))
    const row = render(PersonRow, { props: { person: lena, index: 1, lobby: x01, viewerId: 'lena', board: empty, controls: empty } }).body
    expect(row).toContain('501 → 301, double in')
  })
})

describe("the caller's checkout uses the thrower's own out rule", () => {
  const game = (handicaps?: X01Game['config']['handicaps']): CallGame => ({
    phase: 'game',
    currentPlayer: 1,
    scores: [501, 180],
    visitStartScores: [501, 180],
    bustThisVisit: false,
    visitLocked: false,
    currentVisitDarts: [],
    totalVisits: [1, 1],
    legs: [0, 0],
    config: { outMode: 'double', handicaps },
  })
  const before = (g: CallGame): CallGame => ({ ...g, currentPlayer: 0, totalVisits: [1, 0] })

  it('180 left is a finish straight out, never double out', () => {
    const straight = game([null, { outMode: 'straight' }])
    expect(checkoutFor(before(straight), straight)).toEqual({ seat: 1, remaining: 180, leg: 0 })
    const double = game()
    expect(checkoutFor(before(double), double)).toBeNull()
  })
})
