// Where to go after signing in: a join link or QR code opened while signed out comes back to
// its page (with the code) instead of the start page. Kept in sessionStorage, for this tab only.

const KEY = 'dartcade:returnTo'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** A route of this app ("/join/K7Q4MD"), not the sign-in pages; anything else is null. */
function route(path: string): string | null {
  if (!/^\/[^/]/.test(path)) return null
  if (/^\/(login|register)(?:[/?]|$)/.test(path)) return null
  return path
}

/** Remembers the page at `hash` ("#/join/K7Q4MD") before sending a signed-out visitor to sign in. */
export function rememberReturn(storage: Store | null, hash: string): void {
  const path = hash.startsWith('#') ? route(hash.slice(1)) : null
  try {
    if (path) storage?.setItem(KEY, path)
    else storage?.removeItem(KEY)
  } catch { /* no storage: sign-in goes home */ }
}

/** The remembered page, forgotten once taken; the start page when there is none. */
export function takeReturn(storage: Store | null): string {
  try {
    const path = storage?.getItem(KEY) ?? null
    storage?.removeItem(KEY)
    return (path && route(path)) ?? '/'
  } catch { return '/' }
}

/** The tab's sessionStorage, or null where the browser blocks it. */
export function sessionStore(): Store | null {
  try { return window.sessionStorage } catch { return null }
}
