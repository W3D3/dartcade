/**
 * Players' X01 averages kept in memory, so a friends push (every presence change) does not
 * recompute every friend's history. The average only moves when a game finishes or an admin
 * invalidates, restores or deletes one: those call `invalidate`; the TTL covers everything else
 * (a seat handed to an account). A player without a game is cached too (as absent from the result).
 */
export type AverageCacheOptions = {
  ttlMs?: number
  /** Entries kept; the oldest are dropped first. */
  max?: number
  now?: () => number
}

export const AVERAGE_TTL_MS = 10 * 60_000
export const AVERAGE_CACHE_MAX = 5000

export class AverageCache {
  // Insertion order is age order: a refreshed entry is deleted and set again
  private readonly entries = new Map<string, { average: number | null; at: number }>()
  // Bumped by every invalidate: a load that started before one must not store its (possibly stale) rows
  private epoch = 0
  private readonly ttlMs: number
  private readonly max: number
  private readonly now: () => number

  constructor(
    private readonly load: (ids: string[]) => Promise<Map<string, number>>,
    { ttlMs = AVERAGE_TTL_MS, max = AVERAGE_CACHE_MAX, now = Date.now }: AverageCacheOptions = {},
  ) {
    this.ttlMs = ttlMs
    this.max = max
    this.now = now
  }

  /** The cached averages of these players; the missing or expired ones come from one `load`. */
  async get(ids: readonly string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    const stale: string[] = []
    const now = this.now()
    for (const id of new Set(ids)) {
      const e = this.entries.get(id)
      if (!e || now - e.at >= this.ttlMs) stale.push(id)
      else if (e.average !== null) out.set(id, e.average)
    }
    if (stale.length === 0) return out
    const epoch = this.epoch
    const loaded = await this.load(stale)
    for (const id of stale) {
      const average = loaded.get(id) ?? null
      if (epoch === this.epoch) this.store(id, average, now)
      if (average !== null) out.set(id, average)
    }
    return out
  }

  invalidate(ids: readonly string[]): void {
    this.epoch++
    for (const id of ids) this.entries.delete(id)
  }

  private store(id: string, average: number | null, at: number) {
    this.entries.delete(id)
    this.entries.set(id, { average, at })
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.max) break
      this.entries.delete(oldest)
    }
  }
}
