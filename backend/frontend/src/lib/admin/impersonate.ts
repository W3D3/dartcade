// An admin viewing the app as another account (better-auth's admin plugin; the server audits it and
// the session lasts an hour). Both ends reload the app, so every store, socket and flag starts afresh
// for whoever is shown.
import { authClient } from '$lib/auth'

/** Starts viewing as `userId`. Resolves with the reason on a refusal (another admin, no such user); otherwise the page reloads. */
export async function viewAs(userId: string): Promise<{ error: string } | null> {
  const res = await authClient.admin.impersonateUser({ userId })
  if (res.error) return { error: res.error.message ?? "Couldn't view as this account" }
  window.location.assign('/#/')
  window.location.reload()
  return null
}

/** Back to the admin's own session, on the users page. Resolves with the reason on a failure; otherwise the page reloads. */
export async function stopViewingAs(): Promise<{ error: string } | null> {
  const res = await authClient.admin.stopImpersonating()
  if (res.error) return { error: res.error.message ?? "Couldn't stop viewing as this account" }
  window.location.assign('/#/admin/users')
  window.location.reload()
  return null
}
