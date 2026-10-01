import { describe, it, expect } from 'vitest'
import type { z } from 'zod'
import {
  SnapshotSchema, ClientMessageSchema, DartSchema, DartDetectedDataSchema,
  DartCorrectedDataSchema, FeedEventDataSchema,
} from './schema/zod.js'
import type { Snapshot, ClientMessage } from './schema/game-ws.js'
import type { ADetectedDart, DartDetectedData, DartCorrectedData } from './schema/types.js'
import type { components } from './schema/api.js'

// Compile-time parity (checked by `npm run typecheck`): parsed data can be used as the
// generated type without a cast, and the schemas didn't collapse to `any` (oneOf → z.any).
type IsAny<T> = 0 extends 1 & T ? true : false
const snapshotNotAny: IsAny<z.output<typeof SnapshotSchema>> = false
const clientMessageNotAny: IsAny<z.output<typeof ClientMessageSchema>> = false
export const parity = {
  snapshot: (x: z.output<typeof SnapshotSchema>): Snapshot => x,
  clientMessage: (x: z.output<typeof ClientMessageSchema>): ClientMessage => x,
  dart: (x: z.output<typeof DartSchema>): ADetectedDart => x,
  detected: (x: z.output<typeof DartDetectedDataSchema>): DartDetectedData => x,
  corrected: (x: z.output<typeof DartCorrectedDataSchema>): DartCorrectedData => x,
  feed: (x: z.output<typeof FeedEventDataSchema>): components['schemas']['BoardEvent']['data'] => x,
  snapshotNotAny, clientMessageNotAny,
}

const segment = { name: 'S20', number: 20, bed: 'SingleInner', multiplier: 1 }

describe('generated zod schemas', () => {
  it('strip unknown fields instead of rejecting them', () => {
    const r = ClientMessageSchema.parse({
      type: 'user_action', extra: 1,
      action: { type: 'add_dart', segment: { ...segment, extra: 2 }, coords: { x: 0.1, y: 0.2, z: 3 }, extra: 3 },
    })
    expect(r).toEqual({ type: 'user_action', action: { type: 'add_dart', segment, coords: { x: 0.1, y: 0.2 } } })
  })

  it('reject a value outside the schema', () => {
    expect(DartSchema.safeParse({ segment: { ...segment, bed: 'Weird' }, score: 20 }).success).toBe(false)
  })

  it('keep extra feed data fields (the API declares additionalProperties: true)', () => {
    expect(FeedEventDataSchema.parse({ visit_id: 'v1', dart: { segment, score: 20 } }))
      .toEqual({ visit_id: 'v1', dart: { segment, score: 20 } })
  })
})
