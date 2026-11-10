/**
 * Per-route request caps (@fastify/rate-limit), by IP unless a tier says otherwise, on top of
 * the global cap in app.ts. Use as `config: { rateLimit: RATE.lookup }`; every tier says what it
 * protects, so what can be hammered how hard is reviewed here.
 */
export const RATE = {
  /** Costly or abusable: pairing codes, bridge install token exchange, avatar and voice-pack uploads. */
  strict: { max: 10, timeWindow: '1 minute' },
  /** Hands out a credential to a signed-in user (a bridge install token). */
  issue: { max: 20, timeWindow: '1 minute' },
  /** Looks something up by a guessable key or a typed query: lobby codes, friend search, suggestions. */
  lookup: { max: 30, timeWindow: '1 minute' },
  /** Called often by design: the name check while typing, a bridge polling for its token. */
  poll: { max: 60, timeWindow: '1 minute' },
  /** A bug report mail to the operator: few per signed-in user, whatever the IP. */
  feedback: { max: 5, timeWindow: '1 hour', hook: 'preHandler', keyGenerator: (req: { userId: string }) => req.userId },
} as const
