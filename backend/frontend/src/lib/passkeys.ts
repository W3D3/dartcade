// Passkeys on the client: the account's list for Settings, the wording of their failures, and the
// hint that keeps the sign-in button on this device (the flag is off for signed-out visitors, so
// an admin trying passkeys would otherwise not see the button after signing out).
import { z } from 'zod'
import { readFlag, writeFlag } from './storage'
import { LOCALE, calendarDaysAgo } from './fmt'

/** One row of better-auth's passkey list; its client has already turned the dates into Dates. */
export const passkeyListSchema = z.array(
  z.object({
    id: z.string(),
    name: z
      .string()
      .nullish()
      .transform(v => v ?? null),
    createdAt: z.coerce.date(),
    lastUsedAt: z.coerce
      .date()
      .nullish()
      .transform(v => v ?? null),
  }),
)
export type Passkey = z.infer<typeof passkeyListSchema>[number]

const HINT_KEY = 'dartcade.passkeys'

/** This device has used a passkey for this app. */
export const passkeysRemembered = (): boolean => readFlag(HINT_KEY)
export const rememberPasskeys = (): void => writeFlag(HINT_KEY, true)

export const passkeyName = (p: Pick<Passkey, 'name'>): string => p.name?.trim() || 'Passkey'

/** "Never used", "Today", "Yesterday", "3 days ago", else the date. */
export function passkeyLastUsed(used: Date | null, now = new Date()): string {
  if (!used) return 'Never used'
  const days = calendarDaysAgo(used, now)
  if (days <= 0) return 'Used today'
  if (days === 1) return 'Used yesterday'
  if (days < 7) return `Used ${days} days ago`
  return `Used ${used.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

export const passkeyAdded = (createdAt: Date): string =>
  `Added ${createdAt.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })}`

/** What a failed passkey call means for the screen: nothing to say (the player cancelled), a stale session to confirm again, or a message. */
export type PasskeyFailure = { kind: 'cancelled' } | { kind: 'stale' } | { kind: 'error'; text: string }

const CANCELLED = new Set(['AUTH_CANCELLED', 'ERROR_CEREMONY_ABORTED', 'REGISTRATION_CANCELLED'])

export function passkeyFailure(err: { code?: string; message?: string }, fallback: string): PasskeyFailure {
  if (err.code && CANCELLED.has(err.code)) return { kind: 'cancelled' }
  if (err.code === 'SESSION_NOT_FRESH') return { kind: 'stale' }
  if (err.code === 'EMAIL_NOT_VERIFIED') return { kind: 'error', text: 'Verify your email address first.' }
  if (err.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
    return { kind: 'error', text: 'This device already has a passkey for Dartcade.' }
  }
  return { kind: 'error', text: err.message || fallback }
}

/** Whether this browser can do passkeys at all. */
export const passkeysSupported = (): boolean => typeof window !== 'undefined' && 'PublicKeyCredential' in window
