/** Friends pushes per user: a burst of changes becomes one push. */
export const PUSH_DEBOUNCE_MS = 250

/** Runs `run(key)` once, `ms` after the first `schedule(key)` of a burst (later ones join it). */
export class KeyedDebounce {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private readonly ms: number,
    private readonly run: (key: string) => void,
  ) {}

  schedule(key: string): void {
    if (this.timers.has(key)) return
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key)
        this.run(key)
      }, this.ms),
    )
  }

  /** Runs every pending key now. */
  flush(): void {
    for (const [key, timer] of [...this.timers]) {
      clearTimeout(timer)
      this.timers.delete(key)
      this.run(key)
    }
  }

  /** Drops every pending key without running it. */
  cancel(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }

  pending(): number {
    return this.timers.size
  }
}
