import { describe, it, expect } from 'vitest'
import { buildLabel, debugMarkdown, formatBytes, formatDuration, type AdminSystem } from './system'
import { isStale } from '$lib/version'

describe('formatBytes', () => {
  it('picks the unit', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(3.4 * 1024 * 1024)).toBe('3.4 MB')
    expect(formatBytes(120 * 1024 * 1024)).toBe('120 MB')
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.0 GB')
  })
})

describe('formatDuration', () => {
  it('shows the two largest units', () => {
    expect(formatDuration(0)).toBe('0 s')
    expect(formatDuration(45)).toBe('45 s')
    expect(formatDuration(125)).toBe('2 min 5 s')
    expect(formatDuration(3 * 86400 + 4 * 3600 + 59)).toBe('3 d 4 h')
    expect(formatDuration(86400 + 30)).toBe('1 d')
    expect(formatDuration(7200)).toBe('2 h')
  })
})

describe('isStale', () => {
  const build = { version: 'v0.3.0', commit: 'abc', buildTime: null }
  it('is stale when the server runs another version or commit', () => {
    expect(isStale(build, { ...build, version: 'v0.3.1' })).toBe(true)
    expect(isStale(build, { ...build, commit: 'def' })).toBe(true)
  })
  it('is not stale for the same build, before the server answered, or for an unstamped SPA', () => {
    expect(isStale(build, { ...build, buildTime: '2026-10-18T00:00:00Z' })).toBe(false)
    expect(isStale(build, null)).toBe(false)
    expect(isStale({ version: 'dev', commit: null, buildTime: null }, build)).toBe(false)
  })
})

const system: AdminSystem = {
  build: { version: 'v0.3.0', commit: 'abc1234def', buildTime: '2026-10-18T10:00:00Z', preview: null },
  runtime: {
    node: 'v22.1.0',
    platform: 'linux',
    arch: 'x64',
    hostname: 'box',
    timezone: 'UTC',
    nodeEnv: 'production',
    startedAt: '2026-10-15T10:00:00.000Z',
    uptimeSeconds: 3 * 86400 + 4 * 3600,
    memory: { rss: 120 * 1024 * 1024, heapUsed: 50 * 1024 * 1024, heapTotal: 80 * 1024 * 1024 },
    eventLoopDelayMs: { p50: 10.2, p99: 21.5 },
  },
  database: {
    serverVersion: '16.4',
    latestMigration: '024_flags.sql',
    sizeBytes: 9 * 1024 * 1024,
    pool: { total: 3, idle: 2, waiting: 0 },
  },
  live: { browsers: 5, bridges: 2, boardsOnline: 2, runningGames: 1, openLobbies: 3 },
  config: { values: { FLAGS_ON: 'a', PUBLIC_URL: null }, secrets: { BRIDGE_SECRET: true, ADMIN_PASSWORD: false } },
}

describe('debugMarkdown', () => {
  it('is a fenced block of every detail, the browser and the SPA build', () => {
    const md = debugMarkdown(system, { userAgent: 'TestUA/1.0', spa: { version: 'v0.2.9', commit: null, buildTime: null } })
    expect(md.startsWith('```\n')).toBe(true)
    expect(md.endsWith('\n```')).toBe(true)
    for (const line of [
      'Version: v0.3.0 · abc1234',
      'Uptime: 3 d 4 h (since 2026-10-15T10:00:00.000Z)',
      'Memory: rss 120 MB, heap 50 MB / 80 MB',
      'Pool: 3 total, 2 idle, 0 waiting',
      'Bridges: 2 (2 boards online)',
      'FLAGS_ON: a',
      'PUBLIC_URL: (unset)',
      'BRIDGE_SECRET: set',
      'ADMIN_PASSWORD: not set',
      'SPA build: v0.2.9',
      'Browser: TestUA/1.0',
    ])
      expect(md).toContain(line)
  })
})

describe('buildLabel', () => {
  it('adds the short commit when there is one', () => {
    expect(buildLabel({ version: 'dev', commit: null, buildTime: null })).toBe('dev')
  })
})
