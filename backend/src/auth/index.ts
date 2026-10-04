import { betterAuth } from 'better-auth'
import { openAPI } from 'better-auth/plugins'
import { db } from '../db/index.js'
import { nameHooks } from './nameHooks.js'

const trustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) ?? []

export const auth = betterAuth({
  database: {
    db,
    type: 'pg' as const,
  },
  emailAndPassword: { enabled: true },
  databaseHooks: nameHooks(db),
  trustedOrigins,
  // We manage schema via runMigrations; suppress better-auth's startup check
  advanced: { database: { validateSchema: false } },
  // Generates better-auth's own OpenAPI document (served at /api/auth/open-api/generate-schema);
  // Swagger UI at /api/docs shows it next to ours, so its built-in reference page is off.
  plugins: [openAPI({ disableDefaultReference: true })],
})
