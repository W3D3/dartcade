import { describe, it, expect } from 'vitest'
import { buildInfo, configInfo, runtimeInfo } from './info.js'

describe('buildInfo', () => {
  it('is the stamped build', () => {
    expect(buildInfo({ APP_VERSION: 'v0.3.0', APP_COMMIT: 'abc1234', APP_BUILD_TIME: '2026-10-18T10:00:00Z' })).toEqual({
      version: 'v0.3.0',
      commit: 'abc1234',
      buildTime: '2026-10-18T10:00:00Z',
    })
  })

  it('is dev outside an image (unset or the Dockerfile’s empty defaults)', () => {
    expect(buildInfo({})).toEqual({ version: 'dev', commit: null, buildTime: null })
    expect(buildInfo({ APP_VERSION: '', APP_COMMIT: '', APP_BUILD_TIME: '' })).toEqual({ version: 'dev', commit: null, buildTime: null })
  })
})

describe('configInfo', () => {
  it('reports the plain settings as set and only whether each secret is set', () => {
    const config = configInfo({ FLAGS_ON: 'a,b', BETTER_AUTH_SECRET: 'hunter2', DATABASE_URL: 'postgres://u:pw@db/x', ADMIN_PASSWORD: '' })
    expect(config.values.FLAGS_ON).toBe('a,b')
    expect(config.values.PUBLIC_URL).toBeNull()
    expect(config.secrets).toEqual({
      BETTER_AUTH_SECRET: true,
      BRIDGE_SECRET: false,
      ADMIN_EMAIL: false,
      ADMIN_PASSWORD: false,
      DATABASE_URL: true,
    })
    const json = JSON.stringify(config)
    expect(json).not.toContain('hunter2')
    expect(json).not.toContain('postgres://')
  })
})

describe('runtimeInfo', () => {
  it('reports the process', () => {
    const r = runtimeInfo()
    expect(r.node).toBe(process.version)
    expect(r.memory.rss).toBeGreaterThan(0)
    expect(r.eventLoopDelayMs.p99).toBeGreaterThanOrEqual(0)
    expect(new Date(r.startedAt).getTime()).toBeLessThanOrEqual(Date.now())
  })
})
