import { betterAuth } from 'better-auth'
import { kyselyAdapter } from 'better-auth/adapters/kysely'
import { db } from '../db/index.js'

export const auth = betterAuth({
  database: kyselyAdapter(db, { provider: 'pg' }),
  emailAndPassword: { enabled: true },
})
