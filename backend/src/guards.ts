/** Small runtime type guards for data that arrives untyped (JSON, the database, the bridge). */

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function isString(v: unknown): v is string {
  return typeof v === 'string'
}

export function isNumber(v: unknown): v is number {
  return typeof v === 'number'
}

export function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean'
}

/** An optional field: absent (undefined) or of the given type. */
export function isOptional<T>(v: unknown, guard: (x: unknown) => x is T): v is T | undefined {
  return v === undefined || guard(v)
}

export function isArrayOf<T>(v: unknown, guard: (x: unknown) => x is T): v is T[] {
  return Array.isArray(v) && v.every(guard)
}

/** One of a fixed set of literal values. */
export function isOneOf<const T extends readonly unknown[]>(values: T, v: unknown): v is T[number] {
  return values.includes(v)
}
