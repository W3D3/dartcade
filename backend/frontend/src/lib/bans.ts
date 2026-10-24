// A banned player's public ban (category and end): its line on the profile and at sign-in, and
// the lengths the admin ban dialog offers. The note an admin writes never comes here.
import { api } from '$lib/api'
import { BAN_CATEGORIES, isBanCategory, type BanCategory } from '$shared/bans.js'

export type Ban = { category: BanCategory; until: string | null }

/** "1 Nov 2026" */
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** "Closed for cheating until 1 Nov 2026", or just the category's line for a permanent ban. */
export function banLine(ban: Ban): string {
  const line = BAN_CATEGORIES[ban.category]
  return ban.until ? `${line} until ${day(ban.until)}` : line
}

/** The ban in a refused sign-in (better-auth's BANNED_USER, with the backend's category and end), or null for any other error. */
export function banFromSignIn(err: unknown): Ban | null {
  if (!err || typeof err !== 'object' || !('code' in err) || err.code !== 'BANNED_USER') return null
  const category = 'category' in err && typeof err.category === 'string' && isBanCategory(err.category) ? err.category : 'other'
  // better-auth's client parses ISO strings in a response into Dates
  const raw = 'until' in err ? err.until : null
  const until = raw instanceof Date ? raw.toISOString() : typeof raw === 'string' ? raw : null
  return { category, until }
}

/** The ban in force on a player, or null (none, or the request failed). For the profile without progression. */
export async function fetchBan(userId: string): Promise<Ban | null> {
  const { data } = await api.GET('/api/users/{id}/ban', { params: { path: { id: userId } } })
  return data?.ban ?? null
}

export type BanLength = '1' | '7' | '30' | 'custom' | 'permanent'

export const BAN_LENGTHS: { value: BanLength; label: string }[] = [
  { value: '1', label: '1 day' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: 'custom', label: 'Until a date' },
  { value: 'permanent', label: 'Permanent' },
]

/**
 * When a ban of this length ends, as the ISO time to send (null: permanent). A custom date
 * (yyyy-mm-dd) ends at the start of that day, local time. An error for a custom date that is
 * missing or not in the future.
 */
export function banEnd(length: BanLength, customDate: string, now = new Date()): { until: string | null } | { error: string } {
  if (length === 'permanent') return { until: null }
  if (length !== 'custom') return { until: new Date(now.getTime() + Number(length) * 86_400_000).toISOString() }
  const end = new Date(`${customDate}T00:00:00`)
  if (!customDate || isNaN(end.getTime())) return { error: 'Pick the day the ban ends.' }
  if (end.getTime() <= now.getTime()) return { error: 'The ban must end in the future.' }
  return { until: end.toISOString() }
}
