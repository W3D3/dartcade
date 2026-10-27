import { APIError } from 'better-auth/api'
import type { GenericEndpointContext } from '@better-auth/core'

export const TERMS_REQUIRED = 'Please accept the Terms and Privacy Policy'

/** Sign-up must carry acceptTerms: true (Register's checkbox); nameHooks then records when. Social sign-in accepts by continuing. */
export function termsGate(ctx: GenericEndpointContext): void {
  if (ctx.path !== '/sign-up/email') return
  const body: unknown = ctx.body
  const acceptTerms = body && typeof body === 'object' && 'acceptTerms' in body ? body.acceptTerms : undefined
  if (acceptTerms !== true) throw new APIError('BAD_REQUEST', { message: TERMS_REQUIRED })
}
