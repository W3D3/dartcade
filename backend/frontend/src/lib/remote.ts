// The match screen in a game played from several places: whose board each seat throws on,
// what the centre column shows when it isn't your turn (live, board offline, waiting for a
// disconnected player), and the texts for it. Local games are never "remote", so nothing
// here changes them.
// Design: docs/superpowers/specs/2026-10-02-online-multiplayer-design.md ("Update after the lobby designs")
import type { NoticeMessage, SeatInfo, Snapshot } from './api/game-ws'
import { upSeat } from './turn'
import { pad2 } from './fmt.js'

/** Seats with more than one controller or input (board, or by hand): a lobby game, or `@` account players. */
export function isRemoteGame(snap: Snapshot): boolean {
  return new Set(snap.seats.map(s => s.controllerUserId)).size > 1 || new Set(snap.seats.map(s => s.boardId)).size > 1
}

/** The seat's board as people call it ("Board" once its name is gone); null for a seat entering by hand. */
export function boardLabel(seat: SeatInfo): string | null {
  return seat.boardId === null ? null : (seat.boardName ?? 'Board')
}

/** What a seat shows under its name in a remote game. */
export type SeatLine = { board: string | null; byHand: boolean; offline: boolean; disconnected: boolean; you: boolean }

/** One line per seat; all null in a local game (the header already names its board). */
export function seatLines(snap: Snapshot | null): (SeatLine | null)[] {
  if (!snap) return []
  if (!isRemoteGame(snap)) return snap.seats.map(() => null)
  return snap.seats.map((s, i) => {
    const offline = s.boardId !== null && !s.boardOnline
    return {
      board: boardLabel(s),
      byHand: s.boardId === null || offline,
      offline,
      disconnected: !s.controllerConnected,
      // The host controls a bot's seat but doesn't throw for it: its row isn't "you"
      you: snap.mySeats.includes(i) && s.bot == null,
    }
  })
}

/** A phone row's line with the seat's board in front: "Lena's place · up next". */
export function rowSub(sub: string, line: SeatLine | null): string {
  if (!line) return sub
  return `${line.board ?? 'Manual entry'} · ${sub.charAt(0).toLowerCase()}${sub.slice(1)}`
}

export type MyBoard = { name: string; online: boolean }

/** The viewer's own board (their first seat that has one) in a remote game, for the header. */
export function myBoard(snap: Snapshot | null): MyBoard | null {
  if (!snap || !isRemoteGame(snap)) return null
  const seat = snap.seats.find((s, i) => snap.mySeats.includes(i) && s.boardId !== null)
  return seat ? { name: seat.boardName ?? 'Board', online: seat.boardOnline } : null
}

/** Of the viewer's own boards (everything GET /api/boards returned them), the ones actually
 *  playing a seat in this game right now — any seat, so a guest borrowing one of your boards
 *  counts too. For the status/controls panel in the header. */
export function myBoardsInUse<T extends { id: string }>(snap: Snapshot | null, ownBoards: T[]): T[] {
  if (!snap) return []
  const inUse = new Set(snap.seats.map(s => s.boardId).filter((id): id is string => id !== null))
  return ownBoards.filter(b => inUse.has(b.id))
}

/** What the centre column shows. */
export type CenterState =
  /** Your turn, or a local game: as always. */
  | { kind: 'play' }
  /** Your turn, but your board's bridge is gone: the keypad, with a notice. */
  | { kind: 'play-offline'; board: string }
  /** Someone else is up: their board live (board null: they enter darts by hand). */
  | { kind: 'watch'; name: string; board: string | null }
  /** Someone else is up and their board is offline: they enter by hand. */
  | { kind: 'watch-offline'; name: string; board: string }
  /** The up seat's controller has the game closed: everyone waits. */
  | { kind: 'waiting'; seat: number; name: string; board: string | null; disconnectedAt: string | null; canAbort: boolean }

const PLAY: CenterState = { kind: 'play' }

export function centerState(snap: Snapshot | null, viewerUserId: string | null): CenterState {
  if (!snap || snap.status !== 'active' || !isRemoteGame(snap)) return PLAY
  const i = upSeat(snap)
  const seat = snap.seats.at(i)
  if (!seat) return PLAY
  const name = snap.players.at(i)?.name ?? ''
  const board = boardLabel(seat)
  // A manual seat has no board, so it is never "offline"
  const offlineBoard = seat.boardOnline ? null : board
  if (snap.mySeats.includes(i)) return offlineBoard === null ? PLAY : { kind: 'play-offline', board: offlineBoard }
  // Waiting beats board offline: nobody is there to enter the darts either way
  if (!seat.controllerConnected) {
    return {
      kind: 'waiting',
      seat: i,
      name,
      board,
      disconnectedAt: seat.disconnectedAt,
      canAbort: viewerUserId !== null && viewerUserId === snap.ownerUserId,
    }
  }
  return offlineBoard === null ? { kind: 'watch', name, board } : { kind: 'watch-offline', name, board: offlineBoard }
}

/** The bar in place of Undo / Next while someone else is up. */
export type TurnStatus = { text: string; name: string; tone: 'watch' | 'warn' | 'paused' }

export function turnStatus(c: CenterState): TurnStatus | null {
  switch (c.kind) {
    case 'watch':
      return { text: c.board ? `${c.name} is throwing at ${c.board}` : `${c.name} is on manual entry`, name: c.name, tone: 'watch' }
    case 'watch-offline':
      return { text: `${c.name}'s board is offline`, name: c.name, tone: 'warn' }
    case 'waiting':
      return { text: `Paused · waiting for ${c.name}`, name: c.name, tone: 'paused' }
    default:
      return null
  }
}

/** The line above the board while it shows someone else's turn. */
export type Caption = { text: string; tone: 'live' | 'warn' | 'paused' | 'muted' }

export function boardCaption(c: CenterState): Caption | null {
  switch (c.kind) {
    case 'watch':
      return c.board ? { text: `Live from ${c.board}`, tone: 'live' } : { text: `${c.name} · manual entry`, tone: 'muted' }
    case 'watch-offline':
      return { text: `${c.board} · offline`, tone: 'warn' }
    case 'waiting':
      return { text: `${c.board ?? c.name} · no connection`, tone: 'paused' }
    default:
      return null
  }
}

/** Time since `fromIso` as m:ss (h:mm:ss past an hour); 0:00 for a time ahead of this clock or a bad value. */
export function formatElapsed(fromIso: string, nowMs: number): string {
  const from = Date.parse(fromIso)
  const total = Number.isNaN(from) ? 0 : Math.max(0, Math.floor((nowMs - from) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`
}

export type NoticeLines = { title: string; body: string; detail: string }

/** The not-your-turn toast's three lines. */
export function noticeLines(n: NoticeMessage): NoticeLines {
  return {
    title: 'Not your turn.',
    body: "That dart wasn't counted.",
    detail: n.throwerBoard ? `${n.throwerName} is throwing at ${n.throwerBoard}.` : `${n.throwerName} is on manual entry.`,
  }
}

/** Start on the keypad when none of your seats (all seats, if you have none) has a board. */
export function startsOnKeypad(snap: Snapshot): boolean {
  const mine = snap.seats.filter((_, i) => snap.mySeats.includes(i))
  const seats = mine.length > 0 ? mine : snap.seats
  return seats.length > 0 && seats.every(s => s.boardId === null)
}

/** The visit ends by hand ("Next player"): the up seat has no board, or (remote) its board is offline. */
export function isManualTurn(snap: Snapshot | null): boolean {
  if (!snap) return false
  const seat = snap.seats.at(upSeat(snap))
  if (!seat) return snap.boardId === null
  return seat.boardId === null || (isRemoteGame(snap) && !seat.boardOnline)
}
