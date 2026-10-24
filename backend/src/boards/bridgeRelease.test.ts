import { describe, expect, it, vi } from 'vitest'
import { bridgeReleases, bridgeUpdateFor, pickBridgeRelease, type Release } from './bridgeRelease.js'

const signed = (tag: string, extra: Partial<Release> = {}): Release => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  assets: [{ name: 'dartcade-bridge_linux_arm64' }, { name: 'SHA256SUMS' }, { name: 'SHA256SUMS.sig' }],
  ...extra,
})

describe('pickBridgeRelease', () => {
  const all = ['v0.8.0', 'v0.9.0', 'v0.9.2', 'v0.10.0', 'v1.0.0', 'v1.4.1', 'v2.0.0'].map(t => signed(t))

  it('never offers a major above the backend', () => {
    expect(pickBridgeRelease('v1.2.0', all)).toBe('v1.4.1')
    expect(pickBridgeRelease('1.2.0', all)).toBe('v1.4.1')
    expect(pickBridgeRelease('v2.3.0', all)).toBe('v2.0.0')
    expect(pickBridgeRelease('v3.0.0', all)).toBe('v2.0.0')
  })

  it('caps the minor of a 0.x backend, but not the patch', () => {
    expect(pickBridgeRelease('v0.9.0', all)).toBe('v0.9.2')
    expect(pickBridgeRelease('v0.10.0', all)).toBe('v0.10.0')
    expect(pickBridgeRelease('v0.8.5', all)).toBe('v0.8.0')
    expect(pickBridgeRelease('v0.7.0', all)).toBeNull()
  })

  it('offers nothing from a dev or unparseable backend version', () => {
    for (const v of ['dev', '', 'dev+b503493-dirty', 'v1', 'latest', 'v1.0.0-rc.1']) expect(pickBridgeRelease(v, all)).toBeNull()
  })

  it('skips drafts, prereleases, odd tags and releases without signed checksums', () => {
    const releases = [
      signed('v1.0.0'),
      signed('v1.3.0', { draft: true }),
      signed('v1.2.0', { prerelease: true }),
      signed('v1.1.5-rc.1'),
      signed('1.1.4'),
      signed('v1.1.3', { assets: [{ name: 'SHA256SUMS' }] }),
    ]
    expect(pickBridgeRelease('v1.9.0', releases)).toBe('v1.0.0')
  })
})

describe('bridgeUpdateFor', () => {
  it('offers only an update newer than the bridge', () => {
    expect(bridgeUpdateFor('v0.9.0', 'v0.9.2')).toBe('v0.9.2')
    expect(bridgeUpdateFor('v0.9.2', 'v0.9.2')).toBeNull()
    expect(bridgeUpdateFor('v0.10.0', 'v0.9.2')).toBeNull()
    expect(bridgeUpdateFor('dev+b503493', 'v0.9.2')).toBeNull()
    expect(bridgeUpdateFor(null, 'v0.9.2')).toBeNull()
    expect(bridgeUpdateFor('v0.9.0', null)).toBeNull()
  })
})

describe('bridgeReleases', () => {
  it('answers from the cache, fetching once in the background', async () => {
    const fetchReleases = vi.fn(() => Promise.resolve([signed('v0.9.2')]))
    const releases = bridgeReleases('v0.9.0', fetchReleases)
    expect(releases.offered()).toBeNull()
    expect(releases.offered()).toBeNull()
    await releases.refresh()
    expect(releases.offered()).toBe('v0.9.2')
    expect(fetchReleases).toHaveBeenCalledTimes(1)
  })

  it('never asks GitHub from a dev backend', () => {
    const fetchReleases = vi.fn(() => Promise.resolve([]))
    expect(bridgeReleases('dev', fetchReleases).offered()).toBeNull()
    expect(fetchReleases).not.toHaveBeenCalled()
  })

  it('keeps the last answer when GitHub fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let fail = false
    const releases = bridgeReleases('v0.9.0', () => (fail ? Promise.reject(new Error('down')) : Promise.resolve([signed('v0.9.1')])))
    await releases.refresh()
    fail = true
    await releases.refresh()
    expect(releases.offered()).toBe('v0.9.1')
  })
})
