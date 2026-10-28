// This device's localStorage, for per-device conveniences (a remembered toggle, column widths).
// Null where there is none (server-side renders in tests) or the browser blocks it (reading
// `localStorage` itself throws there): callers then just don't remember.

export function deviceStore(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** An on/off remembered on this device; `fallback` until it's set (or when storage is blocked). */
export function readFlag(key: string, fallback = false): boolean {
  try {
    const v = deviceStore()?.getItem(key) ?? null
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

export function writeFlag(key: string, on: boolean): void {
  try {
    deviceStore()?.setItem(key, on ? '1' : '0')
  } catch {
    // Not remembered (storage full or blocked): it still applies until the page is left
  }
}
