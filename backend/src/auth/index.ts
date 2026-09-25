import { betterAuth } from 'better-auth'
import { db } from '../db/index.js'

export const auth = betterAuth({
  database: {
    db,
    type: 'pg' as const,
  },
  emailAndPassword: { enabled: true },
  // We manage schema via runMigrations; suppress better-auth's startup check
  advanced: { database: { validateSchema: false } },
})
