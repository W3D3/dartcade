// Feature flags (OpenFeature). Evaluated per user with a context built here from the session —
// never from what a browser sends. Design: docs/superpowers/specs/2026-10-12-feature-flags-design.md
import { OpenFeature, TypedInMemoryProvider, type EvaluationContext } from '@openfeature/server-sdk'
import type { Kysely } from 'kysely'
import { isAdmin } from '../auth/admin.js'
import type { Database } from '../db/schema.js'
import { getRoleAndEmail } from '../db/users.js'
import { flagDefinitions } from './definitions.js'

export type FlagUser = { id: string; email: string; role: string | null } | null

const DEFINITIONS: Record<string, { variants: Record<string, unknown>; defaultVariant: string }> = flagDefinitions(new Set())
export const FLAG_KEYS: readonly string[] = Object.keys(DEFINITIONS)
/** The flags whose value is a number rather than on/off. */
export const NUMBER_FLAG_KEYS: readonly string[] = FLAG_KEYS.filter(k => {
  const d = DEFINITIONS[k]
  return typeof d.variants[d.defaultVariant] === 'number'
})

export function envFlagsOn(): Set<string> {
  return new Set(
    (process.env.FLAGS_ON ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
  )
}

/** FLAG_VALUES: number flags set per deployment, as `key=value` pairs separated by commas. */
export function envFlagValues(): Map<string, number> {
  const out = new Map<string, number>()
  for (const pair of (process.env.FLAG_VALUES ?? '').split(',')) {
    if (!pair.trim()) continue
    const eq = pair.indexOf('=')
    const key = pair.slice(0, eq).trim()
    const raw = pair.slice(eq + 1).trim()
    const value = Number(raw)
    if (eq < 0 || raw === '' || !Number.isFinite(value) || !NUMBER_FLAG_KEYS.includes(key)) {
      throw new Error(`FLAG_VALUES: bad entry "${pair.trim()}"`)
    }
    out.set(key, value)
  }
  return out
}

export async function setupFlags(flagsOn: ReadonlySet<string>, values: ReadonlyMap<string, number> = new Map()): Promise<void> {
  await OpenFeature.setProviderAndWait(new TypedInMemoryProvider(flagDefinitions(flagsOn, values)))
}

export function contextFor(user: FlagUser): EvaluationContext {
  return user ? { targetingKey: user.id, email: user.email, admin: isAdmin(user) } : { targetingKey: 'anonymous' }
}

export async function flagEnabled(key: string, user: FlagUser): Promise<boolean> {
  return OpenFeature.getClient().getBooleanValue(key, false, contextFor(user))
}

/** A number flag's value for this user. */
export async function flagNumber(key: string, fallback: number, user: FlagUser): Promise<number> {
  return OpenFeature.getClient().getNumberValue(key, fallback, contextFor(user))
}

export async function evaluateAll(user: FlagUser) {
  const client = OpenFeature.getClient()
  const ctx = contextFor(user)
  return Promise.all(
    FLAG_KEYS.map(async key => {
      const d = NUMBER_FLAG_KEYS.includes(key)
        ? await client.getNumberDetails(key, 0, ctx)
        : await client.getBooleanDetails(key, false, ctx)
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
