// Admin user management: list accounts, and promote or demote admins (schema/api-v1.yaml, tag admin).
import { api, type AdminUser } from '$lib/api'
import { createRequestGuard } from '$lib/requestGuard'

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

/** Promote or demote. On a refusal (the last admin, or a 404 if they were just removed), the message to show inline. */
export async function setUserRole(id: string, admin: boolean): Promise<{ user: AdminUser } | { error: string }> {
  const res = await api.PUT('/api/admin/users/{id}/role', { params: { path: { id } }, body: { admin } })
  return res.data ? { user: res.data } : { error: res.error.error }
}

/** Mark an account's email verified or unverified. On a refusal (a 404 if they were just removed), the message to show inline. */
export async function setVerified(id: string, verified: boolean): Promise<{ user: AdminUser } | { error: string }> {
  const res = await api.PUT('/api/admin/users/{id}/verified', { params: { path: { id } }, body: { verified } })
  return res.data ? { user: res.data } : { error: res.error.error }
}

/** "17 Oct 2026", for the joined column. Blank for an unparsable date. */
export function joinedDate(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** The last login column's text: the joined-style date, or "—" for a user who never signed back in. */
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
