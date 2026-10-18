import { ulid } from 'ulid'
import { db } from '../db/index.js'
import { auth } from './index.js'
import { hashBoardToken } from '../boards/token.js'

/** Players for trying multiplayer on one machine; the login page offers them (frontend lib/devUsers.ts). */
const DEV_PLAYERS = ['Luke', 'Phil', 'Michael', 'Gerwyn']
const DEV_PLAYERS_PASSWORD = 'darts1234'

export async function seedDev(): Promise<void> {
  if (process.env.NODE_ENV !== 'development') return

  for (const name of DEV_PLAYERS) {
    const email = `${name.toLowerCase()}@dartcade.local`
    const found = await db.selectFrom('user').select('id').where('email', '=', email).executeTakeFirst()
    if (!found) {
      // acceptTerms is better-auth's extra field, rejected by signUpEmail's own body type
      // oxlint-disable-next-line typescript/consistent-type-assertions
      await auth.api.signUpEmail({ body: { email, password: DEV_PLAYERS_PASSWORD, name, acceptTerms: true } } as Parameters<
        typeof auth.api.signUpEmail
      >[0])
      // Mailpit is dev's SMTP, but dev users must still sign in with verification on
      await db.updateTable('user').set({ emailVerified: true }).where('email', '=', email).execute()
    }
  }

  const existing = await db.selectFrom('user').select('id').where('email', '=', 'admin@dartcade.local').executeTakeFirst()

  if (!existing) {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- acceptTerms, as above
    await auth.api.signUpEmail({
      body: { email: 'admin@dartcade.local', password: 'admin1234', name: 'Admin', acceptTerms: true },
    } as Parameters<typeof auth.api.signUpEmail>[0])
    await db.updateTable('user').set({ emailVerified: true }).where('email', '=', 'admin@dartcade.local').execute()
  }

  const admin = await db.selectFrom('user').select('id').where('email', '=', 'admin@dartcade.local').executeTakeFirstOrThrow()
  await db.updateTable('user').set({ role: 'admin' }).where('id', '=', admin.id).execute()

  const tokenHash = hashBoardToken('dev-bridge-token')
  await db
    .insertInto('boards')
    .values({ id: ulid(), owner_user_id: admin.id, name: 'Dev Board', token_hash: tokenHash })
    .onConflict(oc => oc.column('token_hash').doNothing())
    .execute()
}
