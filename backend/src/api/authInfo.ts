import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

/** DISCORD_INVITE_URL when it is an https URL, else null (never the Discord sign-in's DISCORD_CLIENT_ID/SECRET). */
export function discordInviteUrl(env: Record<string, string | undefined>): string | null {
  const raw = env.DISCORD_INVITE_URL?.trim()
  if (!raw) return null
  try {
    return new URL(raw).protocol === 'https:' ? raw : null
  } catch {
    return null
  }
}

export function authInfoApiPlugin(
  app: FastifyInstance,
  opts: FastifyPluginOptions & {
    mail: boolean
    verification: boolean
    contactEmail: string | null
    feedback: boolean
    discord: boolean
    discordInviteUrl: string | null
  },
  done: (err?: Error) => void,
): void {
  app.get<Route<'getAuthInfo'>>('/api/auth-info', { schema: fromSpec('getAuthInfo') }, () => ({
    mail: opts.mail,
    verification: opts.verification,
    contactEmail: opts.contactEmail,
    feedback: opts.feedback,
    discord: opts.discord,
    discordInviteUrl: opts.discordInviteUrl,
  }))
  done()
}
