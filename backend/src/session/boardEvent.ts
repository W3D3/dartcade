import { z } from 'zod'
import { DartCorrectedDataSchema, DartDetectedDataSchema } from '../schema/zod.js'
import type { BoardEvent } from './types.js'

// Bridge events arrive as untyped JSON (live or from the DB). The dart events, whose data
// the games read, are parsed with the zod schemas generated from schema/adbridge-v1.json;
// unknown fields are stripped.

/**
 * The board event for a bridge event of this kind, or null when the games don't use
 * the kind (or its dart data doesn't match the bridge schema).
 */
export function parseBoardEvent(kind: string, data: unknown): BoardEvent | null {
  switch (kind) {
    case 'dart.detected': {
      const r = DartDetectedDataSchema.safeParse(data)
      return r.success ? { kind, data: r.data } : null
    }
    case 'dart.corrected': {
      const r = DartCorrectedDataSchema.safeParse(data)
      return r.success ? { kind, data: r.data } : null
    }
    case 'visit.opened':
    case 'takeout.finished':
    case 'visit.cleared':
    case 'board.resync':
    case 'board.status':
      return { kind, data }
    default:
      return null
  }
}

// board.status is display-only: each field falls back on its own
const BoardStatusSchema = z.object({
  status: z.string().catch(''),
  running: z.boolean().catch(false),
  event: z.string().catch(''),
}).catch({ status: '', running: false, event: '' })

/** The board.status fields the session keeps; absent (or mistyped) fields get defaults. */
export function readBoardStatus(data: unknown): { status: string; running: boolean; event: string } {
  return BoardStatusSchema.parse(data)
}
