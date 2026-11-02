// Where a page of GET /api/coach/legs ends: keyset on (finished_at, game_id, leg), newest first
// (history/cursor.ts's pattern, with the extra leg column coach_legs pages by).
import { z } from 'zod'

export type CoachCursor = { finishedAt: Date; gameId: string; leg: number }

const CursorSchema = z.tuple([z.iso.datetime(), z.string().min(1), z.number().int().min(0)])

export function encodeCoachCursor(c: CoachCursor): string {
  return Buffer.from(JSON.stringify([c.finishedAt.toISOString(), c.gameId, c.leg])).toString('base64url')
}

/** The cursor, or null when the string isn't one encodeCoachCursor made. */
export function decodeCoachCursor(s: string): CoachCursor | null {
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(Buffer.from(s, 'base64url').toString('utf8')))
    return parsed.success ? { finishedAt: new Date(parsed.data[0]), gameId: parsed.data[1], leg: parsed.data[2] } : null
  } catch {
    return null
  }
}
