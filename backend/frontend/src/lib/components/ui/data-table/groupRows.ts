// Plain .ts (see activateRowOnKey.ts): DataTable's optional grouping, unit-testable without a DOM.

/** Splits already-sorted rows into groups by `key`, groups ordered by `compare`; rows keep their
 *  order within a group, so a column sort still applies inside each one. */
export function groupRows<T>(
  rows: readonly T[],
  key: (row: T) => string,
  compare: (a: string, b: string) => number,
): { group: string; rows: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const k = key(row)
    const list = groups.get(k)
    if (list) list.push(row)
    else groups.set(k, [row])
  }
  return [...groups].sort(([a], [b]) => compare(a, b)).map(([group, rows]) => ({ group, rows }))
}
