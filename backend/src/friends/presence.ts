/** Going offline waits this long, so reloads and short drops don't flicker for friends. */
export const OFFLINE_GRACE_MS = 30_000

/**
 * Who's online: at least one open /ws/me socket (every signed-in page holds one). In memory —
 * one backend process. `onChange` fires when someone comes online, and when they go offline
 * after the grace.
 */
export class Presence {
  private readonly sockets = new Map<string, number>()
  private readonly leaving = new Map<string, ReturnType<typeof setTimeout>>()
  private closed = false

  constructor(
    private readonly onChange: (userId: string) => void,
    private readonly graceMs = OFFLINE_GRACE_MS,
  ) {}

  isOnline(userId: string): boolean {
    return this.sockets.has(userId) || this.leaving.has(userId)
  }

  connect(userId: string): void {
    if (this.closed) return
    const wasOnline = this.isOnline(userId)
    const timer = this.leaving.get(userId)
    if (timer !== undefined) {
      clearTimeout(timer)
      this.leaving.delete(userId)
    }
    this.sockets.set(userId, (this.sockets.get(userId) ?? 0) + 1)
    if (!wasOnline) this.onChange(userId)
  }

  disconnect(userId: string): void {
    if (this.closed) return
    const open = this.sockets.get(userId)
    if (open === undefined) return
    if (open > 1) {
      this.sockets.set(userId, open - 1)
      return
    }
    this.sockets.delete(userId)
    this.leaving.set(
      userId,
      setTimeout(() => {
        this.leaving.delete(userId)
        this.onChange(userId)
      }, this.graceMs),
    )
  }

  /** The server stops: clears the grace timers; sockets closing after this start none. */
  close(): void {
    this.closed = true
    for (const timer of this.leaving.values()) clearTimeout(timer)
    this.leaving.clear()
    this.sockets.clear()
  }
}
