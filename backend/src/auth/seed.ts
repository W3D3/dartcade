import { createHash } from 'crypto'
import { ulid } from 'ulid'
import { db } from '../db/index.js'
import { auth } from './index.js'

export async function seedDev(): Promise<void> {
  if (process.env.NODE_ENV !== 'development') return

  const existing = await db
    .selectFrom('user')
    .select('id')
    .where('email', '=', 'admin@dartcade.local')
    .executeTakeFirst()

  if (!existing) {
    await auth.api.signUpEmail({
      body: { email: 'admin@dartcade.local', password: 'admin1234', name: 'Admin' },
    })
  }

  const admin = await db
    .selectFrom('user')
    .select('id')
    .where('email', '=', 'admin@dartcade.local')
    .executeTakeFirstOrThrow()

  const DEV_TOKEN = 'dev-bridge-token'
  const tokenHash = createHash('sha256').update(DEV_TOKEN).digest('hex')
  await db
    .insertInto('boards')
    .values({ id: ulid(), owner_user_id: admin.id, name: 'Dev Board', token_hash: tokenHash })
    .onConflict(oc => oc.column('token_hash').doNothing())
    .execute()
}
