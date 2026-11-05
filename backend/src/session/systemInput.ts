import { z } from 'zod'

/**
 * Inputs only the server issues: the ranked clock running out, a player away for too long. They
 * are logged with source 'system' and parsed here, not by the browser's schema, so no client
 * message can ever be (or be replayed as) one of them: SessionEngine.systemInput is the one way in.
 */
const seats = z.array(z.number().int().min(0)).min(1)

export const SystemActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('clock.forfeit'), seats }),
  z.object({ type: z.literal('presence.forfeit'), seats }),
])

export type SystemAction = z.infer<typeof SystemActionSchema>
