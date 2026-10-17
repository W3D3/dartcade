// The first admin of a deployment, from ADMIN_EMAIL and ADMIN_PASSWORD: created on startup while
// no admin exists, so a fresh production instance has someone who can manage it. An existing
// account with ADMIN_EMAIL is promoted only when ADMIN_PASSWORD signs into it, so whoever sets the
// env can't take over someone else's account. Once any admin exists this does nothing; with every
// admin gone, the next start restores it.
import type { Kysely } from 'kysely'
import { APIError } from 'better-auth/api'
import type { Database } from '../db/schema.js'
import { suggestName } from '../users/account.js'
import { cleanName } from '../users/names.js'
import { auth } from './index.js'

const MIN_PASSWORD = 8
type Log = { info(msg: string): void; warn(msg: string): void; error(msg: string): void }

export async function bootstrapAdmin(
  db: Kysely<Database>,
  env: { email?: string; password?: string } = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
  log: Log = console,
  signUp = (body: { email: string; password: string; name: string }) => auth.api.signUpEmail({ body }),
  signIn = (body: { email: string; password: string }) => auth.api.signInEmail({ body }),
): Promise<'skipped' | 'exists' | 'promoted' | 'created'> {
  const email = env.email?.trim().toLowerCase()
  const password = env.password
  if (!email && !password) return 'skipped'
  if (!email || !password) {
    log.warn(`First admin: ${email ? 'ADMIN_PASSWORD' : 'ADMIN_EMAIL'} is not set, no admin created`)
    return 'skipped'
  }
  if (password.length < MIN_PASSWORD) {
    log.error(`First admin: ADMIN_PASSWORD is shorter than ${MIN_PASSWORD} characters, no admin created`)
    return 'skipped'
  }
  const admin = await db.selectFrom('user').select('id').where('role', '=', 'admin').executeTakeFirst()
  if (admin) return 'exists'
  const existing = await db
    .selectFrom('user')
    .select('id')
    .where(eb => eb(eb.fn('lower', ['email']), '=', email))
    .executeTakeFirst()
  if (existing) {
    try {
      await signIn({ email, password })
    } catch {
      log.error(
        "First admin: an account with ADMIN_EMAIL already exists and ADMIN_PASSWORD doesn't sign into it; promote it with the SQL in docs/SELFHOSTING.md",
      )
      return 'skipped'
    }
    await db.updateTable('user').set({ role: 'admin' }).where('id', '=', existing.id).execute()
    log.info(`First admin: promoted the existing account ${email}`)
    return 'promoted'
  }
  // The email's local part cut to the name rules ("admin" if too little is left), numbered if taken
  const base = cleanName(email.split('@')[0])
  const name = await suggestName(db, base === 'player' ? 'admin' : base, null)
  try {
    await signUp({ email, password, name })
  } catch (err) {
    // Realistically a race on the name or the email; crashing startup over it would be worse than skipping.
    const reason = err instanceof APIError ? (err.body?.message ?? err.body?.code ?? 'unknown error') : 'unknown error'
    log.error(`First admin: could not create ${email}'s account: ${reason}`)
    return 'skipped'
  }
  await db
    .updateTable('user')
    .set({ role: 'admin' })
    .where(eb => eb(eb.fn('lower', ['email']), '=', email))
    .execute()
  log.info(`First admin: created ${email}`)
  return 'created'
}
