// Feature flags (OpenFeature). Evaluated per user with a context built here from the session —
// never from what a browser sends. Design: docs/superpowers/specs/2026-10-12-feature-flags-design.md
import { OpenFeature, TypedInMemoryProvider, type EvaluationContext } from '@openfeature/server-sdk'
import type { Kysely } from 'kysely'
import { isAdmin } from '../auth/admin.js'
import type { Database } from '../db/schema.js'
import { getRoleAndEmail } from '../db/users.js'
import { flagDefinitions } from './definitions.js'
import { games } from '../games/index.js'

export type FlagUser = { id: string; email: string; role: string | null } | null

export const FLAG_KEYS: readonly string[] = Object.keys(flagDefinitions(new Set()))

export function envFlagsOn(): Set<string> {
  return new Set(
    (process.env.FLAGS_ON ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
  )
}

export async function setupFlags(flagsOn: ReadonlySet<string>): Promise<void> {
  await OpenFeature.setProviderAndWait(new TypedInMemoryProvider(flagDefinitions(flagsOn)))
}

export function contextFor(user: FlagUser): EvaluationContext {
  return user ? { targetingKey: user.id, email: user.email, admin: isAdmin(user) } : { targetingKey: 'anonymous' }
}

export async function flagEnabled(key: string, user: FlagUser): Promise<boolean> {
  return OpenFeature.getClient().getBooleanValue(key, false, contextFor(user))
}

export async function evaluateAll(user: FlagUser) {
  const client = OpenFeature.getClient()
  return Promise.all(
    FLAG_KEYS.map(async key => {
      const d = await client.getBooleanDetails(key, false, contextFor(user))
      return { key, value: d.value, reason: d.reason ?? 'UNKNOWN', variant: d.variant ?? '' }
    }),
  )
}

/** The flag that gates a game mode, or null for a mode that isn't gated. */
export function modeFlag(modeId: string): string | null {
  const key = `gamemode.${modeId}.enabled`
  return FLAG_KEYS.includes(key) ? key : null
}

export async function loadFlagUser(db: Kysely<Database>, userId: string | null): Promise<FlagUser> {
  if (!userId) return null
  const u = await getRoleAndEmail(db, userId)
  return u ? { id: userId, ...u } : null
}

/** Whether a game mode may be picked: modes without a flag always, flagged ones when it's on. */
export async function modeAvailable(modeId: string, user: FlagUser): Promise<boolean> {
  const key = modeFlag(modeId)
  return key === null || flagEnabled(key, user)
}

/** Whether a game may be played with this config: its mode's flag, and the flag of every field
 *  behind one that the config sets to something other than its default. */
export async function gameAvailable(modeId: string, config: Record<string, unknown>, user: FlagUser): Promise<boolean> {
  const mod = games[modeId]
  const defaults = mod?.defaultConfig ?? {}
  const flags = Object.entries(mod?.configMeta ?? {}).flatMap(([field, meta]) =>
    meta.flag && config[field] !== undefined && config[field] !== defaults[field] ? [meta.flag] : [],
  )
  const on = await Promise.all([modeAvailable(modeId, user), ...flags.map(key => flagEnabled(key, user))])
  return on.every(Boolean)
}
