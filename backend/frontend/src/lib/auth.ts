import { createAuthClient } from 'better-auth/svelte'
import { loadOnce } from './loadOnce.js'

/** better-auth's typed client for /api/auth/* (sign-in, sign-up, session). Same origin as the app. */
export const authClient = createAuthClient()

export type CurrentUser = { id: string; name: string; email: string }

/** Who's signed in, loaded once for the whole app (refreshed on sign-in, cleared on sign-out). */
export const currentUser = loadOnce<CurrentUser | null>(async () => {
  const { data } = await authClient.getSession()
  return data ? { id: data.user.id, name: data.user.name || data.user.email, email: data.user.email } : null
}, null)

/** Ends the session on the server, then shows the sign-in page. */
export async function signOut(): Promise<void> {
  try { await authClient.signOut() } finally {
    currentUser.set(null)
    window.location.hash = '#/login'
  }
}
