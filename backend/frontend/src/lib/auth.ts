import { createAuthClient } from 'better-auth/svelte'

/** better-auth's typed client for /api/auth/* (sign-in, sign-up, session). Same origin as the app. */
export const authClient = createAuthClient()
