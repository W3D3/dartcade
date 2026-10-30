// Admin user management: list accounts, set their role (admin, moderator, none), give them XP, ban them (schema/api-v1.yaml, tag admin).
import { api, type AdminUser } from '$lib/api'
import type { BanCategory } from '$shared/bans.js'
import { createRequestGuard } from '$lib/requestGuard'
import { xpForLevel } from '$shared/progression.js'

export type { AdminUser }

/** Every account matching `q` (blank: everyone), newest first, at most 50. Null: the request failed. */
export async function listUsers(q: string): Promise<AdminUser[] | null> {
  const res = await api.GET('/api/admin/users', { params: { query: q ? { q } : {} } })
  return res.data?.users ?? null
}

/**
 * A search whose result always reflects the latest `search(q)` call, even if the server answers
 * out of order: a quick retype can leave an older request in flight after a newer one, and
 * without this guard its (stale) result could land last and overwrite the current query's result.
 * `fetch` is `listUsers` by default; overridable so the ordering itself is testable without a
 * network call.
 */
export function createUserSearch(
  onResult: (users: AdminUser[] | null) => void,
  fetch: (q: string) => Promise<AdminUser[] | null> = listUsers,
) {
  const requests = createRequestGuard()
  return {
    search(q: string): void {
      const token = requests.start()
      void fetch(q).then(result => {
        if (requests.isCurrent(token)) onResult(result)
      })
    },
  }
}

export type Role = AdminUser['role']

/** Set a role (null: none). On a refusal (the last admin, or a 404 if they were just removed), the message to show inline. */
export async function setUserRole(id: string, role: Role): Promise<{ user: AdminUser } | { error: string }> {
  const res = await api.PUT('/api/admin/users/{id}/role', { params: { path: { id } }, body: { role } })
  return res.data ? { user: res.data } : { error: res.error.error }
}

/** The role changes the row menu offers: every role the account doesn't have. */
export function roleActions(current: Role): { role: Role; label: string }[] {
  return [
    { role: 'admin' as const, label: 'Make admin' },
    { role: 'moderator' as const, label: 'Make moderator' },
    { role: null, label: current === 'admin' ? 'Demote' : 'Remove role' },
  ].filter(a => a.role !== current)
}

/** The confirmation for giving `user` a role: what changes for them, and whether it takes something away. */
export function roleChange(
  user: Pick<AdminUser, 'name' | 'role'>,
  role: Role,
  isSelf: boolean,
): { title: string; body: string; confirm: string; danger: boolean } {
  const losesAdmin = user.role === 'admin' && role !== 'admin'
  const lose = losesAdmin && isSelf ? " You'll lose access to the admin pages." : ''
  if (role === 'admin') {
    return {
      title: 'Make admin?',
      body: `${user.name} will be able to manage users, feature flags, games and the system.`,
      confirm: 'Make admin',
      danger: false,
    }
  }
  if (role === 'moderator') {
    return {
      title: 'Make moderator?',
      body: `${user.name} will be able to look at any game and invalidate it, and nothing else of the admin tools.${losesAdmin ? ' They lose their admin access.' : ''}${lose}`,
      confirm: 'Make moderator',
      danger: losesAdmin,
    }
  }
  return {
    title: user.role === 'admin' ? 'Remove admin access?' : 'Remove moderator access?',
    body:
      user.role === 'admin'
        ? `${user.name} won't be able to manage users, feature flags or games anymore.${lose}`
        : `${user.name} won't be able to look at or invalidate games anymore.`,
    confirm: user.role === 'admin' ? 'Demote' : 'Remove',
    danger: true,
  }
}

/** Mark an account's email verified or unverified. On a refusal (a 404 if they were just removed), the message to show inline. */
export async function setVerified(id: string, verified: boolean): Promise<{ user: AdminUser } | { error: string }> {
  const res = await api.PUT('/api/admin/users/{id}/verified', { params: { path: { id } }, body: { verified } })
  return res.data ? { user: res.data } : { error: res.error.error }
}

export type XpGrant = { xp: number; level: number; unlocked: string[] }

/** Give an account XP (to test unlocks). On a refusal, the message to show inline. */
export async function grantXp(id: string, amount: number): Promise<{ grant: XpGrant } | { error: string }> {
  const res = await api.POST('/api/admin/users/{id}/xp', { params: { path: { id } }, body: { amount } })
  return res.data ? { grant: res.data } : { error: res.error.error }
}

// The list doesn't carry an account's XP, so "level 50" is what level 50 costs from zero
export const XP_QUICK_AMOUNTS = [
  { label: '+1,000', amount: 1000 },
  { label: '+10,000', amount: 10_000 },
  { label: 'To level 50', amount: xpForLevel(50) },
]

/** "Now level 12 · 3,400 XP · 2 new unlocks", after a grant. */
export function grantSummary(g: XpGrant): string {
  const n = g.unlocked.length
  return `Now level ${g.level} · ${g.xp.toLocaleString('en-US')} XP · ${n} new unlock${n === 1 ? '' : 's'}`
}

/** Ban an account (until: ISO end, null for good). On a refusal (yourself, an admin, a past end), the message to show inline. */
export async function banUser(
  id: string,
  body: { category: BanCategory; note: string | null; until: string | null },
): Promise<{ user: AdminUser } | { error: string }> {
  const res = await api.PUT('/api/admin/users/{id}/ban', { params: { path: { id } }, body })
  return res.data ? { user: res.data } : { error: res.error.error }
}

/** Lift an account's ban. */
export async function unbanUser(id: string): Promise<{ user: AdminUser } | { error: string }> {
  const res = await api.DELETE('/api/admin/users/{id}/ban', { params: { path: { id } } })
  return res.data ? { user: res.data } : { error: res.error.error }
}

/** "17 Oct 2026, 14:05", for the joined column. Blank for an unparsable date. */
export function joinedDate(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** The last login column's text: the joined-style date and time, or "—" for a user who never signed back in. */
export function lastLoginText(iso: string | null): string {
  return iso === null ? '—' : joinedDate(iso)
}

/** Sorts ISO timestamps ascending; a null (never logged in) always sorts after a real one, in either direction. */
export function compareLastLogin(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a < b ? -1 : 1
}

// v2: Verified became visible by default; bumped so that default applies once more, over any stored choice.
const USERS_COLUMNS_KEY = 'dartcade_admin_users_columns_v2'

function isVisibilityState(v: unknown): v is Record<string, boolean> {
  return !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(x => typeof x === 'boolean')
}

/** The users table's saved column visibility, or {} if there's none (or it doesn't parse). */
export function loadColumnVisibility(storage: Pick<Storage, 'getItem'> | null): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(USERS_COLUMNS_KEY) ?? 'null')
    return isVisibilityState(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function saveColumnVisibility(storage: Pick<Storage, 'setItem'> | null, visibility: Record<string, boolean>): void {
  try {
    storage?.setItem(USERS_COLUMNS_KEY, JSON.stringify(visibility))
  } catch {
    // Storage full or blocked: visibility just doesn't persist
  }
}
