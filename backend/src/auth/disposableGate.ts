import { APIError } from 'better-auth/api'

export const DISPOSABLE_EMAIL = 'Please use a permanent email address'

export const BLOCKLIST_URL =
  'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf'
const FRESH_MS = 24 * 60 * 60_000
const RETRY_MS = 5 * 60_000
const FIRST_WAIT_MS = 5_000

async function defaultFetch(): Promise<string> {
  const res = await fetch(BLOCKLIST_URL, { headers: { 'user-agent': 'dartcade' }, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  return res.text()
}

/**
 * The disposable-email-domains blocklist, fetched from GitHub and cached in memory for a day (retried
 * after 5 minutes on a failure). Fails open: until a fetch has worked, nothing is blocked, so an
 * offline self-hoster can still sign up. `domains()` answers from the cache and refreshes it in the background.
 */
export function disposableList(fetchList: () => Promise<string> = defaultFetch) {
  let cached: Set<string> | null = null
  let nextAt = 0
  let inFlight: Promise<void> | null = null

  function refresh(): Promise<void> {
    inFlight ??= fetchList()
      .then(text => {
        cached = new Set(
          text
            .split('\n')
            .map(l => l.trim().toLowerCase())
            .filter(Boolean),
        )
        nextAt = Date.now() + FRESH_MS
      })
      .catch((err: unknown) => {
        console.warn('Could not fetch the disposable email domain list', err)
        nextAt = Date.now() + RETRY_MS
      })
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  return {
    async domains(): Promise<ReadonlySet<string>> {
      if (Date.now() >= nextAt) {
        const pending = refresh()
        // Only the very first sign-up waits (briefly) for the list
        if (!cached) await Promise.race([pending, new Promise(r => setTimeout(r, FIRST_WAIT_MS).unref())])
      }
      return cached ?? new Set()
    },
  }
}
export const sharedList = disposableList()

/** Whether the address is on a listed domain, or a subdomain of one, and not allowed by the operator. */
export function isDisposable(email: string, blocked: ReadonlySet<string>, allow: readonly string[] = []): boolean {
  const labels = email
    .slice(email.lastIndexOf('@') + 1)
    .trim()
    .toLowerCase()
    .split('.')
  for (let i = 0; i < labels.length - 1; i++) {
    const domain = labels.slice(i).join('.')
    if (allow.includes(domain)) return false
    if (blocked.has(domain)) return true
  }
  return false
}

/** `DISPOSABLE_EMAIL_ALLOW`: comma-separated domains to let through (subdomains too), or `*` to turn the check off. */
export function parseAllow(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean)
}

/** Sign-up with a throwaway address is refused; existing accounts are untouched. */
export async function assertPermanentEmail(email: unknown, allow: readonly string[], list = sharedList): Promise<void> {
  if (typeof email !== 'string' || allow.includes('*')) return
  if (isDisposable(email, await list.domains(), allow)) throw new APIError('BAD_REQUEST', { message: DISPOSABLE_EMAIL })
}
