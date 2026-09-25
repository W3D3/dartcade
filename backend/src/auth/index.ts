import { betterAuth } from 'better-auth'
import { db } from '../db/index.js'

const trustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) ?? []

export const auth = betterAuth({
  database: {
    db,
    type: 'pg' as const,
  },
  emailAndPassword: { enabled: true },
  trustedOrigins,
  // We manage schema via runMigrations; suppress better-auth's startup check
  advanced: { database: { validateSchema: false } },
})
