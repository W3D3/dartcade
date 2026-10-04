import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { ApiError } from '../api/errors.js'
import { pgErrorCode } from '../db/errors.js'
import { isNameTaken, setName } from '../db/users.js'
import { NAME_RULE, cleanName, isValidName, normalizeName, numbered } from './names.js'

const UNIQUE_VIOLATION = '23505'
const SUGGESTION_TRIES = 50

export const NAME_TAKEN = 'That name is taken'

export type NameCheck = { ok: true; name: string } | { ok: false; reason: 'invalid' | 'taken' }

/** Whether `raw` can be `selfId`'s name (null: someone signing up). Your own name is free for you. */
export async function checkName(db: Kysely<Database>, raw: string, selfId: string | null): Promise<NameCheck> {
  const name = normalizeName(raw)
  if (!isValidName(name)) return { ok: false, reason: 'invalid' }
  if (await isNameTaken(db, name, selfId)) return { ok: false, reason: 'taken' }
  return { ok: true, name }
}

/** A free name close to `current` for the Pick your name screen: cleaned, then numbered 2, 3, … */
export async function suggestName(db: Kysely<Database>, current: string, selfId: string): Promise<string> {
  const base = cleanName(current)
  if (!(await isNameTaken(db, base, selfId))) return base
  for (let n = 2; n < SUGGESTION_TRIES; n++) {
    const candidate = numbered(base, n)
    if (!(await isNameTaken(db, candidate, selfId))) return candidate
  }
  // Only a suggestion: saving it checks again
  return numbered(base, 1000 + Math.floor(Math.random() * 9000))
}

/** Changes the user's name (PATCH /api/me); returns it as stored. */
export async function renameUser(db: Kysely<Database>, userId: string, raw: string): Promise<string> {
  const check = await checkName(db, raw, userId)
  if (!check.ok) throw check.reason === 'invalid' ? new ApiError(400, { error: NAME_RULE }) : new ApiError(409, { error: NAME_TAKEN })
  try {
    await setName(db, userId, check.name)
  } catch (err) {
    // Someone took it between the check and the write (the unique index)
    if (pgErrorCode(err) === UNIQUE_VIOLATION) throw new ApiError(409, { error: NAME_TAKEN })
    throw err
  }
  return check.name
}
