// What the admin System page (`GET /api/admin/system`) and `GET /api/version` report about this server.
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { hostname } from 'node:os'
import { sql, type Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { poolOf } from '../db/index.js'
import type { components } from '../schema/api.js'

type Env = Record<string, string | undefined>
export type BuildInfo = components['schemas']['BuildInfo']
export type AdminSystem = components['schemas']['AdminSystem']

/** The build the image was stamped with (APP_VERSION, APP_COMMIT, APP_BUILD_TIME, see backend/Dockerfile); dev outside an image. */
export function buildInfo(env: Env): BuildInfo {
  return { version: env.APP_VERSION || 'dev', commit: env.APP_COMMIT || null, buildTime: env.APP_BUILD_TIME || null }
}

const CONFIG_VALUES = [
  'NODE_ENV',
  'PUBLIC_URL',
  'BETTER_AUTH_URL',
  'BETTER_AUTH_TRUSTED_ORIGINS',
  'TRUST_PROXY',
  'FLAGS_ON',
  'FLAG_VALUES',
  'RATE_LIMIT_MAX',
  'VOICE_STORAGE_LIMIT_MB',
  'BOARD_LIVE_CAMERA',
] as const
const CONFIG_SECRETS = ['BETTER_AUTH_SECRET', 'BRIDGE_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'DATABASE_URL'] as const

/** The non-secret settings as set, and only whether each secret is set. */
export function configInfo(env: Env): AdminSystem['config'] {
  return {
    values: Object.fromEntries(CONFIG_VALUES.map(k => [k, env[k] ?? null])),
    secrets: Object.fromEntries(CONFIG_SECRETS.map(k => [k, !!env[k]])),
  }
}

const startedAt = new Date()
// Started once at load: each read reports the delays since the last one
const loopDelay = monitorEventLoopDelay({ resolution: 20 })
loopDelay.enable()

export function runtimeInfo(): AdminSystem['runtime'] {
  const { rss, heapUsed, heapTotal } = process.memoryUsage()
  // Before the first sample the percentiles are 0; nanoseconds otherwise
  const ms = (ns: number) => Math.round(ns / 1e4) / 100
  const eventLoopDelayMs = { p50: ms(loopDelay.percentile(50)), p99: ms(loopDelay.percentile(99)) }
  loopDelay.reset()
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    hostname: hostname(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    nodeEnv: process.env.NODE_ENV ?? null,
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    memory: { rss, heapUsed, heapTotal },
    eventLoopDelayMs,
  }
}

export async function databaseInfo(db: Kysely<Database>): Promise<AdminSystem['database']> {
  const [version, migration, size] = await Promise.all([
    sql<{ server_version: string }>`SHOW server_version`.execute(db),
    // Migration files are applied in name order (db/queries.ts runMigrations)
    sql<{ name: string }>`SELECT max(name) AS name FROM schema_migrations`.execute(db),
    sql<{ size: string }>`SELECT pg_database_size(current_database()) AS size`.execute(db),
  ])
  const pool = poolOf(db)
  return {
    serverVersion: version.rows[0]?.server_version ?? '',
    latestMigration: migration.rows[0]?.name ?? null,
    sizeBytes: Number(size.rows[0]?.size ?? 0),
    pool: pool ? { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } : null,
  }
}
