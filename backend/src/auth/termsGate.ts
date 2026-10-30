import { createAuthMiddleware, APIError } from 'better-auth/api'
import { assertPermanentEmail, parseAllow } from './disposableGate.js'

export const TERMS_REQUIRED = 'Please accept the Terms and Privacy Policy'

/** Sign-up must carry acceptTerms: true (Register's checkbox; nameHooks then records when) and a non-disposable email. */
// oxlint-disable-next-line typescript/require-await -- createAuthMiddleware's handler must return a Promise
export const termsGate = createAuthMiddleware(async ctx => {
  if (ctx.path !== '/sign-up/email') return
  const body: unknown = ctx.body
  const acceptTerms = body && typeof body === 'object' && 'acceptTerms' in body ? body.acceptTerms : undefined
  if (acceptTerms !== true) throw new APIError('BAD_REQUEST', { message: TERMS_REQUIRED })
  await assertPermanentEmail(
    body && typeof body === 'object' && 'email' in body ? body.email : undefined,
    parseAllow(process.env.DISPOSABLE_EMAIL_ALLOW),
  )
})
