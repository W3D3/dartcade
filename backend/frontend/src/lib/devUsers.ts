// Dev-only quick logins: the accounts the backend seeds in development (auth/seed.ts).
// Only used behind import.meta.env.DEV; production never seeds or shows them.
import { authClient, currentUser } from './auth.js'

export type DevUser = { name: string; email: string; password: string }

/** Keep in step with DEV_PLAYERS in backend/src/auth/seed.ts. */
const DARTERS_PASSWORD = 'darts1234'

export const DEV_USERS: DevUser[] = [
  {
    name: 'Admin',
    email: import.meta.env.VITE_DEV_EMAIL ?? 'admin@dartcade.local',
    password: import.meta.env.VITE_DEV_PASSWORD ?? 'admin1234',
  },
  ...['Luke', 'Phil', 'Michael', 'Gerwyn'].map(name => ({ name, email: `${name.toLowerCase()}@dartcade.local`, password: DARTERS_PASSWORD })),
]

/** Signs out whoever is signed in, then in as `user`, and goes home. Returns an error message or null. */
export async function signInAs(user: DevUser): Promise<string | null> {
  await authClient.signOut().catch(() => undefined)
  const { error } = await authClient.signIn.email({ email: user.email, password: user.password })
  if (error) return error.message ?? 'Sign-in failed'
  await currentUser.refresh()
  window.location.hash = '#/'
  return null
}
