import { describe, it, expect } from 'vitest'
import type { SeatInfo, Snapshot } from '$lib/api/game-ws'
import {
  boardCaption,
  centerState,
  formatElapsed,
  isManualTurn,
  isRemoteGame,
  myBoard,
  noticeLines,
  rowSub,
  seatLines,
  startsOnKeypad,
  turnStatus,
} from '../remote.js'
import fixture from './fixtures/x01-snapshot.json'

// The fixture is a local game: owner u1 controls both seats, both on board-1 ("Board")
const local = (patch: { boardId?: string | null; boardOnline?: boolean; currentPlayer?: number } = {}): Snapshot => {
  const base = structuredClone(fixture) as unknown as Snapshot
  const seats = base.seats.map(s => ({
    ...s,
    ...(patch.boardId !== undefined && { boardId: patch.boardId, boardName: patch.boardId === null ? null : s.boardName }),
    ...(patch.boardOnline !== undefined && { boardOnline: patch.boardOnline }),
  }))
  return {
    ...base,
    boardId: patch.boardId === undefined ? base.boardId : patch.boardId,
    seats,
    game: { ...base.game, currentPlayer: patch.currentPlayer ?? 0 },
  } as Snapshot
}

// A remote game: Christoph (host) on Living room, Lena on Lena's place; the viewer controls `mySeats`
const remote = (
  o: { mySeats?: number[]; currentPlayer?: number; seats?: Partial<SeatInfo>[]; status?: Snapshot['status'] } = {},
): Snapshot => {
  const base = structuredClone(fixture) as unknown as Snapshot
  const seat = (s: SeatInfo, over: Partial<SeatInfo>): SeatInfo => ({ ...s, ...over })
  return {
    ...base,
    boardId: null,
    ownerUserId: 'host',
    status: o.status ?? 'active',
    mySeats: o.mySeats ?? [0],
    players: [{ name: 'Christoph' }, { name: 'Lena' }],
    seats: [
      seat(base.seats[0], {
        controllerUserId: 'host',
        userId: 'host',
        boardId: 'board-a',
        boardName: 'Living room',
        boardOnline: true,
        controllerConnected: true,
        ...o.seats?.[0],
      }),
      seat(base.seats[1], {
        controllerUserId: 'lena',
        userId: 'lena',
        boardId: 'board-b',
        boardName: "Lena's place",
        boardOnline: true,
        controllerConnected: true,
        ...o.seats?.[1],
      }),
    ],
    game: { ...base.game, currentPlayer: o.currentPlayer ?? 0 },
  } as Snapshot
}

describe('isRemoteGame', () => {
  it('a local game is not remote', () => {
    expect(isRemoteGame(local())).toBe(false)
    expect(isRemoteGame(local({ boardId: null }))).toBe(false)
  })
  it('two controllers, or one controller on two inputs, is remote', () => {
    expect(isRemoteGame(remote())).toBe(true)
    const oneController = remote({ seats: [{}, { controllerUserId: 'host', boardId: null, boardName: null }] })
    expect(isRemoteGame(oneController)).toBe(true)
  })
})

describe('seatLines', () => {
  it('none in a local game', () => {
    expect(seatLines(local())).toEqual([null, null])
    expect(seatLines(null)).toEqual([])
  })
  it("each seat's board, and which one is yours", () => {
    expect(seatLines(remote())).toEqual([
      { board: 'Living room', byHand: false, offline: false, disconnected: false, you: true },
      { board: "Lena's place", byHand: false, offline: false, disconnected: false, you: false },
    ])
  })
  it('an offline board means entering by hand; a manual seat has no board', () => {
    const lines = seatLines(remote({ seats: [{ boardOnline: false }, { boardId: null, boardName: null, boardOnline: false }] }))
    expect(lines[0]).toMatchObject({ board: 'Living room', byHand: true, offline: true })
    expect(lines[1]).toMatchObject({ board: null, byHand: true, offline: false })
  })
  it('a controller without the game open; a board without a name', () => {
    const lines = seatLines(remote({ seats: [{ boardName: null }, { controllerConnected: false }] }))
    expect(lines[0]?.board).toBe('Board')
    expect(lines[1]?.disconnected).toBe(true)
  })
})

describe('rowSub', () => {
  it("puts the seat's board in front of a phone row's line", () => {
    expect(rowSub('Up next · can finish T17 D18', null)).toBe('Up next · can finish T17 D18')
    expect(rowSub('Up next', { board: "Lena's place", byHand: false, offline: false, disconnected: false, you: false })).toBe(
      "Lena's place · up next",
    )
    expect(rowSub('Avg 45.0', { board: null, byHand: true, offline: false, disconnected: false, you: false })).toBe(
      'Manual entry · avg 45.0',
    )
  })
})

describe('myBoard', () => {
  it("the viewer's own board in a remote game", () => {
    expect(myBoard(remote())).toEqual({ name: 'Living room', online: true })
    expect(myBoard(remote({ seats: [{ boardOnline: false }] }))).toEqual({ name: 'Living room', online: false })
  })
  it('none in a local game, for a viewer entering by hand, or without a snapshot', () => {
    expect(myBoard(local())).toBeNull()
    expect(myBoard(remote({ seats: [{ boardId: null, boardName: null, boardOnline: false }] }))).toBeNull()
    expect(myBoard(null)).toBeNull()
  })
})

describe('centerState', () => {
  it('a local game always plays, even with its board offline', () => {
    expect(centerState(local({ boardOnline: false }), 'u1')).toEqual({ kind: 'play' })
    expect(centerState(null, null)).toEqual({ kind: 'play' })
  })
  it('your turn: play; on your offline board: enter by hand', () => {
    expect(centerState(remote(), 'host')).toEqual({ kind: 'play' })
    expect(centerState(remote({ seats: [{ boardOnline: false }] }), 'host')).toEqual({ kind: 'play-offline', board: 'Living room' })
    expect(centerState(remote({ seats: [{ boardId: null, boardName: null, boardOnline: false }] }), 'host')).toEqual({ kind: 'play' })
  })
  it("someone else's turn: watch their board, or their darts entered by hand", () => {
    expect(centerState(remote({ currentPlayer: 1 }), 'host')).toEqual({ kind: 'watch', name: 'Lena', board: "Lena's place" })
    expect(centerState(remote({ currentPlayer: 1, seats: [{}, { boardId: null, boardName: null, boardOnline: false }] }), 'host')).toEqual({
      kind: 'watch',
      name: 'Lena',
      board: null,
    })
    expect(centerState(remote({ currentPlayer: 1, seats: [{}, { boardOnline: false }] }), 'host')).toEqual({
      kind: 'watch-offline',
      name: 'Lena',
      board: "Lena's place",
    })
  })
  it('the thrower has the game closed: everyone waits, only the host may abort', () => {
    const gone = remote({ currentPlayer: 1, seats: [{}, { controllerConnected: false, disconnectedAt: '2026-10-02T18:00:00.000Z' }] })
    expect(centerState(gone, 'host')).toEqual({
      kind: 'waiting',
      seat: 1,
      name: 'Lena',
      board: "Lena's place",
      disconnectedAt: '2026-10-02T18:00:00.000Z',
      canAbort: true,
    })
    expect(centerState({ ...gone, mySeats: [] }, 'max')).toMatchObject({ kind: 'waiting', canAbort: false })
    expect(centerState(gone, null)).toMatchObject({ kind: 'waiting', canAbort: false })
  })
  it('waiting beats board offline', () => {
    const both = remote({ currentPlayer: 1, seats: [{}, { controllerConnected: false, boardOnline: false }] })
    expect(centerState(both, 'host')).toMatchObject({ kind: 'waiting', disconnectedAt: null })
  })
  it('a game that is over shows nothing remote', () => {
    expect(centerState(remote({ currentPlayer: 1, status: 'finished' }), 'host')).toEqual({ kind: 'play' })
  })
})

describe('turnStatus and boardCaption', () => {
  it('nothing on your own turn', () => {
    expect(turnStatus({ kind: 'play' })).toBeNull()
    expect(boardCaption({ kind: 'play-offline', board: 'Living room' })).toBeNull()
  })
  it('watching a board', () => {
    const c = { kind: 'watch', name: 'Lena', board: "Lena's place" } as const
    expect(turnStatus(c)).toEqual({ text: "Lena is throwing at Lena's place", name: 'Lena', tone: 'watch' })
    expect(boardCaption(c)).toEqual({ text: "Live from Lena's place", tone: 'live' })
  })
  it('watching someone enter darts by hand', () => {
    const c = { kind: 'watch', name: 'Lena', board: null } as const
    expect(turnStatus(c)?.text).toBe('Lena is on manual entry')
    expect(boardCaption(c)).toEqual({ text: 'Lena · manual entry', tone: 'muted' })
  })
  it('their board is offline', () => {
    const c = { kind: 'watch-offline', name: 'Lena', board: "Lena's place" } as const
    expect(turnStatus(c)).toEqual({ text: "Lena's board is offline", name: 'Lena', tone: 'warn' })
    expect(boardCaption(c)).toEqual({ text: "Lena's place · offline", tone: 'warn' })
  })
  it('waiting', () => {
    const c = { kind: 'waiting', seat: 1, name: 'Lena', board: "Lena's place", disconnectedAt: null, canAbort: false } as const
    expect(turnStatus(c)).toEqual({ text: 'Paused · waiting for Lena', name: 'Lena', tone: 'paused' })
    expect(boardCaption(c)).toEqual({ text: "Lena's place · no connection", tone: 'paused' })
    expect(boardCaption({ ...c, board: null })?.text).toBe('Lena · no connection')
  })
})

describe('formatElapsed', () => {
  const from = '2026-10-02T18:00:00.000Z'
  const at = (s: number) => Date.parse(from) + s * 1000
  it('minutes and seconds, hours once past one', () => {
    expect(formatElapsed(from, at(0))).toBe('0:00')
    expect(formatElapsed(from, at(72))).toBe('1:12')
    expect(formatElapsed(from, at(3723))).toBe('1:02:03')
  })
  it('never negative or broken (clock skew, bad input)', () => {
    expect(formatElapsed(from, at(-30))).toBe('0:00')
    expect(formatElapsed('not a date', at(10))).toBe('0:00')
  })
})

describe('noticeLines', () => {
  it('names who is throwing where', () => {
    expect(noticeLines({ type: 'notice', code: 'not_your_turn', boardId: 'b', throwerName: 'Lena', throwerBoard: "Lena's place" })).toEqual(
      {
        title: 'Not your turn.',
        body: "That dart wasn't counted.",
        detail: "Lena is throwing at Lena's place.",
      },
    )
    expect(noticeLines({ type: 'notice', code: 'not_your_turn', boardId: 'b', throwerName: 'Lena', throwerBoard: null }).detail).toBe(
      'Lena is on manual entry.',
    )
  })
})

describe('startsOnKeypad and isManualTurn', () => {
  it('a local game: as before (the session board decides)', () => {
    expect(startsOnKeypad(local())).toBe(false)
    expect(startsOnKeypad(local({ boardId: null }))).toBe(true)
    expect(isManualTurn(local())).toBe(false)
    expect(isManualTurn(local({ boardOnline: false }))).toBe(false)
    expect(isManualTurn(local({ boardId: null }))).toBe(true)
  })
  it('a remote game: your own seats decide the start view', () => {
    expect(startsOnKeypad(remote())).toBe(false)
    expect(startsOnKeypad(remote({ seats: [{ boardId: null, boardName: null }] }))).toBe(true)
  })
  it('a remote game: the up seat without a board, or with it offline, advances by hand', () => {
    expect(isManualTurn(remote())).toBe(false)
    expect(isManualTurn(remote({ seats: [{ boardOnline: false }] }))).toBe(true)
    expect(isManualTurn(remote({ currentPlayer: 1, seats: [{}, { boardId: null, boardName: null, boardOnline: false }] }))).toBe(true)
  })
})
