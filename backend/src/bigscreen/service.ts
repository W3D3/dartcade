import { RESULT_HOLD_MS } from '../shared/bigScreen.js'
import { WsCloseCode, type Snapshot } from '../schema/game-ws.js'
import type { BigScreenMessage, BigScreenScreen } from '../schema/board-ws.js'
import type { components } from '../schema/api.js'

type GameDetail = components['schemas']['GameDetail']
type Board = { name: string; prefs: Record<string, unknown> }

export type BigScreenDeps = {
  /** The running game on the board (SessionEngine.getSessionByBoard). */
  activeOn(boardId: string): string | undefined
  getSnapshot(sessionId: string): Snapshot | undefined
  /** The board's name and its owner's account settings (one query); undefined: the board is gone. Read on every push, so a rename or a settings change reaches a running screen. */
  loadBoard(boardId: string): Promise<Board | undefined>
  isOnline(boardId: string): boolean
  now: () => number
  setTimer: typeof setTimeout
  /** Called when building a push fails; that push is dropped. */
  warn: (err: unknown) => void
}

type Send = (m: BigScreenMessage) => void
type Close = (code: WsCloseCode, reason: string) => void
type Followers = {
  sends: Map<Send, { close: Close; viaToken: boolean }>
  timer?: ReturnType<typeof setTimeout>
}
/** A finished game held on its boards: the result screen until `until`, with the saved game once it is stored. */
type Held = { sessionId: string; until: number; detail?: GameDetail }

/** Pushes each followed board's screen to its subscribers. */
export class BigScreenService {
  private boards = new Map<string, Followers>()
  private held = new Map<string, Held>()
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

  /** Pushes the followed boards that show this session (running, or held as a result). */
  onSessionChanged(sessionId: string): void {
    for (const boardId of this.boards.keys())
      if (this.deps.activeOn(boardId) === sessionId || this.held.get(boardId)?.sessionId === sessionId) void this.push(boardId)
  }

  /** The bridge of a board connected or dropped: its online flag changed. */
  onBoardPresence(boardId: string): void {
    if (this.boards.has(boardId)) void this.push(boardId)
  }

  /**
   * A session ended on `boardIds`. A finished one is held there as a result for RESULT_HOLD_MS; `saved`
   * resolves to its saved game (null: not stored), which joins the result, or drops it if invalidated.
   * An aborted one (`saved` null) just leaves the boards idle.
   */
  onGameEnded(sessionId: string, boardIds: string[], saved: Promise<GameDetail | null> | null): void {
    for (const [b, h] of this.held) if (h.until <= this.deps.now() && !boardIds.includes(b)) this.held.delete(b)
    if (saved) {
      const until = this.deps.now() + RESULT_HOLD_MS
      for (const b of boardIds) this.held.set(b, { sessionId, until })
      saved
        .then(detail => {
          if (!detail) return
          for (const b of boardIds) {
            const h = this.held.get(b)
            if (h?.sessionId !== sessionId) continue
            if (detail.game.invalidated) this.held.delete(b)
            else h.detail = detail
            void this.push(b)
          }
        })
        .catch((err: unknown) => {
          this.deps.warn(err)
        })
    }
    for (const b of boardIds) void this.push(b)
  }

  close(): void {
    this.held.clear()
    for (const f of this.boards.values()) clearTimeout(f.timer)
    this.boards.clear()
  }

  private screenOf(boardId: string, now: number): { screen: BigScreenScreen; until?: number } {
    const active = this.deps.activeOn(boardId)
    const live = active === undefined ? undefined : this.deps.getSnapshot(active)
    if (live) return { screen: { kind: 'game', snapshot: live } }
    const h = this.held.get(boardId)
    const snapshot = h && h.until > now ? this.deps.getSnapshot(h.sessionId) : undefined
    if (!h || !snapshot) {
      this.held.delete(boardId)
      return { screen: { kind: 'idle' } }
    }
    // shortcut: the held result lives in memory only, a restart inside the minute shows idle
    return { screen: { kind: 'result', snapshot, until: h.until, ...(h.detail ? { detail: h.detail } : {}) }, until: h.until }
  }

  private async push(boardId: string, only?: Send[]): Promise<void> {
    try {
      const board = await this.deps.loadBoard(boardId)
      // Read after the await, so whichever push finishes last sends (and times) the newest state
      const f = this.boards.get(boardId)
      if (!f) return
      if (!board) {
        for (const [send, { close }] of f.sends) if (!only || only.includes(send)) close(WsCloseCode.NotFound, 'board not found')
        return
      }
      const now = this.deps.now()
      const { screen, until } = this.screenOf(boardId, now)
      clearTimeout(f.timer)
      f.timer = until === undefined ? undefined : this.deps.setTimer(() => void this.push(boardId), Math.max(0, until - now))
      const msg: BigScreenMessage = {
        type: 'big_screen',
        board: { id: boardId, name: board.name, online: this.deps.isOnline(boardId) },
        prefs: board.prefs,
        screen,
      }
      for (const send of only ?? f.sends.keys()) if (f.sends.has(send)) send(msg)
    } catch (err) {
      this.deps.warn(err)
    }
  }
}
