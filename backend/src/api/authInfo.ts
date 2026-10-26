import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

export function authInfoApiPlugin(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { mail: boolean; verification: boolean; contactEmail: string | null; feedback: boolean },
  done: (err?: Error) => void,
): void {
  app.get<Route<'getAuthInfo'>>('/api/auth-info', { schema: fromSpec('getAuthInfo') }, () => ({
    mail: opts.mail,
    verification: opts.verification,
    contactEmail: opts.contactEmail,
    feedback: opts.feedback,
  }))
  done()
}
