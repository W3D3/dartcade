import { createAuthClient } from 'better-auth/svelte'

/** better-auth's typed client for /api/auth/* (sign-in, sign-up, session). Same origin as the app. */
export const authClient = createAuthClient()

/** Ends the session on the server, then shows the sign-in page. */
export async function signOut(): Promise<void> {
  try { await authClient.signOut() } finally { window.location.hash = '#/login' }
}
