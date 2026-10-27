import type { BigScreenMessage, BigScreenScreen } from '../shared/bigScreen.js'
import { WsCloseCode } from '../schema/game-ws.js'
import { pickScreenSession, type PickInput } from './screen.js'

export type BigScreenDeps = {
  getSessions(): PickInput[]
  getSnapshot(sessionId: string): unknown
  getBoard(boardId: string): Promise<{ name: string; ownerUserId: string } | undefined>
  isOnline(boardId: string): boolean
  getPrefs(userId: string): Promise<Record<string, unknown>>
  now?: () => number
  setTimer?: typeof setTimeout
  /** Called when building a push fails; that push is dropped. */
  warn?: (err: unknown) => void
}

type Send = (m: BigScreenMessage) => void
type Close = (code: WsCloseCode, reason: string) => void
type Followers = { sends: Map<Send, { close: Close; viaToken: boolean }>; timer?: ReturnType<typeof setTimeout> }

/** Pushes each followed board's screen to its subscribers. */
export class BigScreenService {
  private boards = new Map<string, Followers>()
  constructor(private deps: BigScreenDeps) {}

  /** `close` ends the subscriber's socket (board gone, token revoked); `viaToken` marks a kiosk, which revoke() cuts off. */
  add(boardId: string, send: Send, close: Close = () => undefined, viaToken = false): () => void {
    let f = this.boards.get(boardId)
    if (!f) this.boards.set(boardId, (f = { sends: new Map() }))
    const followers = f
    followers.sends.set(send, { close, viaToken })
    void this.push(boardId, [send])
    return () => {
      followers.sends.delete(send)
      if (followers.sends.size === 0 && this.boards.get(boardId) === followers) {
        clearTimeout(followers.timer)
        this.boards.delete(boardId)
      }
    }
  }

  /** Closes the board's token subscribers (token revoked: Forbidden; board deleted: NotFound). Cookie owners stay. */
  revoke(boardId: string, code: WsCloseCode = WsCloseCode.Forbidden): void {
    for (const { close, viaToken } of [...(this.boards.get(boardId)?.sends.values() ?? [])]) if (viaToken) close(code, 'token revoked')
  }

  onSessionChanged(sessionId: string): void {
    const s = this.deps.getSessions().find(x => x.id === sessionId)
    for (const boardId of this.boards.keys()) if (!s || s.boardIds.includes(boardId)) void this.push(boardId)
  }

  onBoardPresence(boardId: string): void {
    if (this.boards.has(boardId)) void this.push(boardId)
  }

  close(): void {
    for (const f of this.boards.values()) clearTimeout(f.timer)
    this.boards.clear()
  }

  private async push(boardId: string, only?: Send[]): Promise<void> {
    try {
      const board = await this.deps.getBoard(boardId)
      if (!board) {
        for (const [send, { close }] of this.boards.get(boardId)?.sends ?? [])
          if (!only || only.includes(send)) close(WsCloseCode.NotFound, 'board not found')
        return
      }
      const prefs = await this.deps.getPrefs(board.ownerUserId)
      // Picked after the awaits, so whichever push finishes last sends (and times) the newest state
      const f = this.boards.get(boardId)
      if (!f) return
      const now = (this.deps.now ?? Date.now)()
      const pick = pickScreenSession(this.deps.getSessions(), boardId, now)
      clearTimeout(f.timer)
      f.timer = undefined
      let screen: BigScreenScreen = { kind: 'idle' }
      const snapshot = pick ? this.deps.getSnapshot(pick.id) : undefined
      if (pick && snapshot !== undefined) {
        if (pick.kind === 'game') screen = { kind: 'game', snapshot }
        else {
          screen = { kind: 'result', snapshot, until: pick.until }
          // shortcut: the held result lives in engine memory only, a restart inside the minute shows idle
          f.timer = (this.deps.setTimer ?? setTimeout)(() => void this.push(boardId), Math.max(0, pick.until - now))
        }
      }
      const msg: BigScreenMessage = {
        type: 'big_screen',
        board: { id: boardId, name: board.name, online: this.deps.isOnline(boardId) },
        prefs,
        screen,
      }
      for (const send of only ?? f.sends.keys()) if (f.sends.has(send)) send(msg)
    } catch (err) {
      this.deps.warn?.(err)
    }
  }
}
