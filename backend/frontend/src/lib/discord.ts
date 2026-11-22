// Where Sign in with Discord sends the browser back to. Absolute: better-auth redirects from its own
// origin (BETTER_AUTH_URL), which in dev is the backend's, not the SPA's.

const app = (origin: string, route: string) => `${origin}/#${route}`

/** signIn.social's options for signing in from #/login or #/register: back to `returnPath` (a fresh account starts at step 2, like a sign-up). */
export function discordSignIn(returnPath: string, origin = window.location.origin) {
  return {
    provider: 'discord',
    callbackURL: app(origin, returnPath),
    newUserCallbackURL: app(origin, returnPath === '/' ? '/settings/boards' : returnPath),
    errorCallbackURL: app(origin, '/login'),
  }
}

/**
 * Settings' delete-account confirmation for an account without a password: sign in again, then come
 * back to confirm. The callback names the account that asked, because Discord may sign the browser
 * in as another account (a shared computer), which must not be the one deleted.
 */
export const CONFIRM_DELETE = 'confirmDelete'
export function discordReauth(userId: string, origin = window.location.origin) {
  return {
    provider: 'discord',
    callbackURL: app(origin, `/settings/profile?${CONFIRM_DELETE}=${encodeURIComponent(userId)}`),
    errorCallbackURL: app(origin, '/settings/profile'),
  }
}
