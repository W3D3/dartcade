import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { flagEnabled, loadFlagUser } from '../flags/index.js'
import type { FlagKey } from '../shared/flags.js'
import { notFound } from './errors.js'

/** Answers 404 unless the flag is on for this user: a gated feature's whole API looks absent while it is off. */
export async function requireFlag(db: Kysely<Database>, key: FlagKey, userId: string): Promise<void> {
  if (!(await flagEnabled(key, await loadFlagUser(db, userId)))) throw notFound()
}

/** Every tournament route checks this first: with tournaments.enabled off the whole API is absent. */
export const requireTournamentsFlag = (db: Kysely<Database>, userId: string): Promise<void> =>
  requireFlag(db, 'tournaments.enabled', userId)
