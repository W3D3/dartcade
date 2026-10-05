import { createAuthClient } from 'better-auth/svelte'
import { loadOnce } from './loadOnce.js'
import { createApi } from './api/client.js'
import type { components } from './api/schema'

/** better-auth's typed client for /api/auth/* (sign-in, sign-up, session). Same origin as the app. */
export const authClient = createAuthClient()

/** Who's signed in (GET /api/me): name, email, whether they must pick a new name first. */
export type CurrentUser = components['schemas']['Me']

// A 401 here means "signed out", not "go to the sign-in page": App decides where to go
const quietApi = createApi({ onUnauthorized: () => undefined })

/** Who's signed in, loaded once for the whole app (refreshed on sign-in and after changes, cleared on sign-out). */
export const currentUser = loadOnce<CurrentUser | null>(async () => {
  const { data, response } = await quietApi.GET('/api/me')
  if (data) return data
  if (response.status === 401) return null
  throw new Error(`GET /api/me failed: ${response.status}`)
}, null)

/** Ends the session on the server, then shows the sign-in page. */
export async function signOut(): Promise<void> {
  try {
    await authClient.signOut()
  } finally {
    currentUser.set(null)
    window.location.hash = '#/login'
  }
}
