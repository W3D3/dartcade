// Discards a stale response: when several async requests for the same state can be
// in flight at once (a filter change while the previous page is still loading, or a
// "load more" overtaken by a filter switch), only the most recently started one
// should be allowed to apply its result.
export function createRequestGuard() {
  let generation = 0
  return {
    /** Starts a new request sequence (e.g. a filter change); any earlier token is now stale. */
    start: () => ++generation,
    /** The token of the current sequence, for a request that continues it (e.g. "load more"). */
    current: () => generation,
    /** True if `token` is still the current sequence's token. */
    isCurrent: (token: number) => token === generation,
  }
}
