import { z } from 'zod'

/** Where a page of the history ends: keyset on (finished_at, id), newest first. */
export type Cursor = { finishedAt: Date; id: string }

const CursorSchema = z.tuple([z.iso.datetime(), z.string().min(1)])

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify([c.finishedAt.toISOString(), c.id])).toString('base64url')
}

/** The cursor, or null when the string isn't one encodeCursor made. */
export function decodeCursor(s: string): Cursor | null {
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(Buffer.from(s, 'base64url').toString('utf8')))
    return parsed.success ? { finishedAt: new Date(parsed.data[0]), id: parsed.data[1] } : null
  } catch {
    return null
  }
}
