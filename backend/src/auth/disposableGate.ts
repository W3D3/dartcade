import { APIError } from 'better-auth/api'
import { DISPOSABLE_DOMAINS } from './disposableDomains.js'

export const DISPOSABLE_EMAIL = 'Please use a permanent email address'

const blocked = new Set(DISPOSABLE_DOMAINS.split('\n').filter(Boolean))

/** Whether the address is on a listed domain, or a subdomain of one, and not allowed by the operator. */
export function isDisposable(email: string, allow: readonly string[] = []): boolean {
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
export function assertPermanentEmail(email: unknown, allow: readonly string[]): void {
  if (typeof email === 'string' && !allow.includes('*') && isDisposable(email, allow))
    throw new APIError('BAD_REQUEST', { message: DISPOSABLE_EMAIL })
}
