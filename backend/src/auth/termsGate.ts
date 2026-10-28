import { createAuthMiddleware, APIError } from 'better-auth/api'
import type { GenericEndpointContext } from '@better-auth/core'
import { undeliverable } from '../mail/transport.js'

export const TERMS_REQUIRED = 'Please accept the Terms and Privacy Policy'

/** How a request signs up, if it does: Register's email sign-up, or a social sign-in's OAuth callback (`/callback/discord`). */
export function signUpKind(ctx: Pick<GenericEndpointContext, 'path'> | null): 'email' | 'social' | null {
  if (ctx?.path === '/sign-up/email') return 'email'
  if (ctx?.path === '/callback/:id') return 'social'
  return null
}

/**
 * An email sign-up must carry acceptTerms: true (Register's checkbox); nameHooks then records
 * when (a social sign-in accepts by continuing). Its address can't be a .invalid one: those
 * stand in for a Discord account's missing email (auth/discord.ts).
 */
// oxlint-disable-next-line typescript/require-await -- createAuthMiddleware's handler must return a Promise
export const termsGate = createAuthMiddleware(async ctx => {
  if (signUpKind(ctx) !== 'email') return
  const body: unknown = ctx.body
  const acceptTerms = body && typeof body === 'object' && 'acceptTerms' in body ? body.acceptTerms : undefined
  if (acceptTerms !== true) throw new APIError('BAD_REQUEST', { message: TERMS_REQUIRED })
  const email = body && typeof body === 'object' && 'email' in body ? body.email : undefined
  if (typeof email === 'string' && undeliverable(email)) throw new APIError('BAD_REQUEST', { message: 'Use a real email address' })
})
