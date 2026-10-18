// The admin System page (`#/admin/system`): its data and how it reads (schema/api-v1.yaml, getAdminSystem).
import { api, type AdminSystem } from '$lib/api'
import { shortCommit, type BuildInfo } from '$lib/version'

export type { AdminSystem }

export async function loadSystem(): Promise<AdminSystem | null> {
  const res = await api.GET('/api/admin/system')
  return res.data ?? null
}

/** "512 B", "3.4 MB", "1.2 GB" (1024-based). */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return i === 0 ? `${n} B` : `${n < 10 ? n.toFixed(1) : Math.round(n)} ${units[i]}`
}

/** The two largest units of a duration: "3 d 4 h", "2 h 5 min", "45 s". */
export function formatDuration(seconds: number): string {
  const parts: [number, string][] = [
    [Math.floor(seconds / 86400), 'd'],
    [Math.floor((seconds % 86400) / 3600), 'h'],
    [Math.floor((seconds % 3600) / 60), 'min'],
    [Math.floor(seconds % 60), 's'],
  ]
  const first = parts.findIndex(([n]) => n > 0)
  if (first === -1) return '0 s'
  return parts
    .slice(first, first + 2)
    .filter(([n]) => n > 0)
    .map(([n, u]) => `${n} ${u}`)
    .join(' ')
}

/** "v0.3.0 · abc1234", or just the version without a commit. */
export function buildLabel(b: BuildInfo): string {
  return b.commit ? `${b.version} · ${shortCommit(b.commit)}` : b.version
}

/** Everything on the page as a Markdown block to paste into an issue: the server's details plus this browser and its SPA build. */
export function debugMarkdown(s: AdminSystem, browser: { userAgent: string; spa: BuildInfo }): string {
  const { build, runtime, database, live, config } = s
  const preview: [string, string][] = build.preview ? [['Preview', `PR #${build.preview.pr}`]] : []
  const pool: [string, string][] = database.pool
    ? [['Pool', `${database.pool.total} total, ${database.pool.idle} idle, ${database.pool.waiting} waiting`]]
    : []
  const rows: [string, string][] = [
    ['Version', buildLabel(build)],
    ['Built', build.buildTime ?? '–'],
    ...preview,
    ['Node', `${runtime.node} (${runtime.platform}/${runtime.arch})`],
    ['Host', runtime.hostname],
    ['Timezone', runtime.timezone],
    ['NODE_ENV', runtime.nodeEnv ?? '–'],
    ['Uptime', `${formatDuration(runtime.uptimeSeconds)} (since ${runtime.startedAt})`],
    [
      'Memory',
      `rss ${formatBytes(runtime.memory.rss)}, heap ${formatBytes(runtime.memory.heapUsed)} / ${formatBytes(runtime.memory.heapTotal)}`,
    ],
    ['Event loop delay', `p50 ${runtime.eventLoopDelayMs.p50} ms, p99 ${runtime.eventLoopDelayMs.p99} ms`],
    ['Postgres', database.serverVersion],
    ['Latest migration', database.latestMigration ?? '–'],
    ['Database size', formatBytes(database.sizeBytes)],
    ...pool,
    ['Browsers', String(live.browsers)],
    ['Bridges', `${live.bridges} (${live.boardsOnline} boards online)`],
    ['Running games', String(live.runningGames)],
    ['Open lobbies', String(live.openLobbies)],
    ...Object.entries(config.values).map(([k, v]): [string, string] => [k, v ?? '(unset)']),
    ...Object.entries(config.secrets).map(([k, set]): [string, string] => [k, set ? 'set' : 'not set']),
    ['SPA build', buildLabel(browser.spa)],
    ['Browser', browser.userAgent],
  ]
  return ['```', ...rows.map(([k, v]) => `${k}: ${v}`), '```'].join('\n')
}
