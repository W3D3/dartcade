// Admin-only flag overrides: list every flag, set or clear an override at runtime, applied right
// away (no restart) by setOverrides (schema/api-v1.yaml, tag admin).
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAdmin } from '../auth/admin.js'
import { requireAuth } from '../auth/middleware.js'
import { getUsersByIds } from '../db/queries.js'
import { deleteOverride, loadOverrides, upsertOverride, type FlagOverride } from '../db/flagOverrides.js'
import { FLAG_META, type FlagMeta } from '../flags/definitions.js'
import { currentOverrides, envFlagValues, envFlagsOn, evaluateAll, loadFlagUser, setOverrides } from '../flags/index.js'
import { ApiError } from './errors.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database>; onFlagChanged?: (key: string) => void }
type StoredOverride = FlagOverride & { updatedBy: string | null; updatedAt: Date }
type UserRef = { id: string; name: string | null }

function buildDefault(meta: FlagMeta, key: string) {
  return meta.kind === 'boolean'
    ? { rule: meta.defaultRule, envOn: envFlagsOn().has(key) }
    : { envValue: envFlagValues().get(key), value: meta.defaultNumber }
}

function buildOverride(override: StoredOverride | undefined, ref: (id: string) => UserRef) {
  if (!override) return null
  return {
    ...('mode' in override ? { mode: override.mode, ...(override.mode === 'users' && { users: override.userIds.map(ref) }) } : {}),
    ...('number' in override ? { number: override.number } : {}),
    updatedBy: override.updatedBy ? ref(override.updatedBy) : null,
    updatedAt: override.updatedAt.toISOString(),
  }
}

function describeFlag(
  key: string,
  meta: FlagMeta,
  override: StoredOverride | undefined,
  value: boolean | number,
  ref: (id: string) => UserRef,
) {
  return {
    key,
    kind: meta.kind,
    description: meta.description,
    ...(meta.kind === 'number' && { range: meta.range }),
    default: buildDefault(meta, key),
    override: buildOverride(override, ref),
    value,
  }
}

/** Every id a batch of overrides' `updatedBy`/`userIds` names, resolved in one query. */
async function refFor(db: Kysely<Database>, overrides: Iterable<StoredOverride>): Promise<(id: string) => UserRef> {
  const ids = new Set<string>()
  for (const o of overrides) {
    if (o.updatedBy) ids.add(o.updatedBy)
    if ('userIds' in o) for (const id of o.userIds) ids.add(id)
  }
  const users = await getUsersByIds(db, [...ids])
  const nameById = new Map(users.map(u => [u.id, u.name]))
  return id => ({ id, name: nameById.get(id) ?? null })
}

// Saves run one at a time: two at once could otherwise apply an older reload over a newer one.
let saving: Promise<unknown> = Promise.resolve()
function oneAtATime<T>(save: () => Promise<T>): Promise<T> {
  const next = saving.then(save)
  saving = next.catch(() => undefined)
  return next
}

/** Every route here is admin-only. */
export function adminFlagsApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts
  const adminOnly = [requireAuth, requireAdmin]

  app.get<Route<'listAdminFlags'>>('/api/admin/flags', { preValidation: adminOnly, schema: fromSpec('listAdminFlags') }, async req => {
    const user = await loadFlagUser(db, req.userId)
    const overrides = await loadOverrides(db)
    const values = await evaluateAll(user)
    const valueByKey = new Map(values.map(v => [v.key, v.value]))
    const ref = await refFor(db, overrides.values())

    const flags = Object.entries(FLAG_META).map(([key, meta]) =>
      describeFlag(key, meta, overrides.get(key), valueByKey.get(key) ?? (meta.kind === 'boolean' ? false : 0), ref),
    )
    const stale = [...overrides.entries()]
      .filter(([key]) => !(key in FLAG_META))
      .map(([key, o]) => ({ key, updatedAt: o.updatedAt.toISOString() }))

    return { flags, stale }
  })

  app.put<Route<'setFlagOverride'>>(
    '/api/admin/flags/:key',
    { preValidation: adminOnly, schema: fromSpec('setFlagOverride') },
    async req => {
      const { key } = req.params
      if (!(key in FLAG_META)) throw new ApiError(404, { error: 'not found' })
      const meta = FLAG_META[key]

      const body = req.body
      let override: FlagOverride
      if ('number' in body) {
        if (meta.kind !== 'number') throw new ApiError(400, { error: `${key} is not a number flag` })
        if (body.number < meta.range[0] || body.number > meta.range[1]) {
          throw new ApiError(400, { error: `must be between ${meta.range[0]} and ${meta.range[1]}` })
        }
        override = { number: body.number }
      } else {
        if (meta.kind !== 'boolean') throw new ApiError(400, { error: `${key} is not an on/off flag` })
        const userIds = body.userIds ?? []
        if (body.mode === 'users' && userIds.length === 0) {
          throw new ApiError(400, { error: 'users mode needs at least one user id' })
        }
        if (body.mode !== 'users' && userIds.length > 0) {
          throw new ApiError(400, { error: "userIds only goes with mode 'users'" })
        }
        let kept = userIds
        if (userIds.length > 0) {
          // A chosen account deleted since is dropped, so it doesn't block editing the list
          const known = new Set((await getUsersByIds(db, userIds)).map(u => u.id))
          kept = userIds.filter(id => known.has(id))
          if (kept.length === 0) throw new ApiError(400, { error: 'unknown user id' })
        }
        override = { mode: body.mode, userIds: kept }
      }

      const overrides = await oneAtATime(async () => {
        const before = currentOverrides().get(key) ?? null
        await upsertOverride(db, key, override, req.userId)
        const loaded = await loadOverrides(db)
        await setOverrides(loaded)
        opts.onFlagChanged?.(key)
        req.log.info({ key, before, after: override, userId: req.userId }, 'flag override')
        return loaded
      })

      const user = await loadFlagUser(db, req.userId)
      const value = (await evaluateAll(user)).find(f => f.key === key)?.value ?? (meta.kind === 'boolean' ? false : 0)
      const stored = overrides.get(key)
      const ref = await refFor(db, stored ? [stored] : [])
      return describeFlag(key, meta, stored, value, ref)
    },
  )

  app.delete<Route<'clearFlagOverride'>>(
    '/api/admin/flags/:key',
    { preValidation: adminOnly, schema: fromSpec('clearFlagOverride') },
    async (req, reply) => {
      const { key } = req.params
      await oneAtATime(async () => {
        const before = currentOverrides().get(key) ?? null
        await deleteOverride(db, key)
        await setOverrides(await loadOverrides(db))
        opts.onFlagChanged?.(key)
        req.log.info({ key, before, after: null, userId: req.userId }, 'flag override')
      })
      return reply.code(204).send()
    },
  )

  done()
}
