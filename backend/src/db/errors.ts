import { z } from 'zod'

const PgErrorSchema = z.object({ code: z.string() })

/** The Postgres error code (e.g. '23505' unique violation) of a driver error, if it has one. */
export function pgErrorCode(err: unknown): string | undefined {
  const r = PgErrorSchema.safeParse(err)
  return r.success ? r.data.code : undefined
}

/** Postgres error codes we act on. */
export const UNIQUE_VIOLATION = '23505'
export const FK_VIOLATION = '23503'
