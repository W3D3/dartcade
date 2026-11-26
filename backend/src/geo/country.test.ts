import { describe, it, expect, vi } from 'vitest'
import { createCountryResolver, geoConfig } from './country.js'

const req = (h: Record<string, string>) => new Headers(h)
const fakeDb = (table: Record<string, string>) => () => Promise.resolve((ip: string) => table[ip] ?? null)
const resolver = (env: Record<string, string>, db: Record<string, string> = {}) =>
  createCountryResolver(geoConfig(env), () => undefined, fakeDb(db))

describe('geoConfig', () => {
  it('reads no header unless a proxy is trusted or GEO_TRUST_HEADER=1', () => {
    expect(geoConfig({}).headers).toEqual([])
    expect(geoConfig({ TRUST_PROXY: '1' }).headers).toEqual(['cf-ipcountry'])
    expect(geoConfig({ GEO_TRUST_HEADER: '1', COUNTRY_HEADER: 'X-Country-Code' }).headers).toEqual(['x-country-code'])
    expect(geoConfig({ GEO_TRUST_HEADER: '1', COUNTRY_HEADER: 'auto' }).headers).toContain('cloudfront-viewer-country')
  })
})

describe('country resolver', () => {
  it('takes the country from the trusted header, upper-cased', async () => {
    expect(await resolver({ GEO_TRUST_HEADER: '1' })(req({ 'cf-ipcountry': 'at' }))).toBe('AT')
  })
  it('ignores the header when nothing trusts it', async () => {
    expect(await resolver({})(req({ 'cf-ipcountry': 'AT' }))).toBeNull()
  })
  it('does nothing when neither a header nor a database is set', async () => {
    expect(await resolver({ GEO_TRUST_HEADER: '1' })(req({}))).toBeNull()
  })
  it.each(['XX', 'T1', 'A1', 'A2', 'EU', 'AP', 'ZZ', 'AUT', ''])('rejects %j', async code => {
    expect(await resolver({ GEO_TRUST_HEADER: '1' })(req({ 'cf-ipcountry': code }))).toBeNull()
  })
  it('auto tries each known header in turn', async () => {
    const r = resolver({ GEO_TRUST_HEADER: '1', COUNTRY_HEADER: 'auto' })
    expect(await r(req({ 'x-vercel-ip-country': 'DE' }))).toBe('DE')
    expect(await r(req({ 'cf-ipcountry': 'XX', 'x-country-code': 'FR' }))).toBe('FR')
  })
  it('falls back to the database by client address, and skips private or unknown ones', async () => {
    const r = resolver({ GEOIP_DB_PATH: '/x.mmdb' }, { '1.2.3.4': 'JP', '5.6.7.8': 'XX' })
    expect(await r(req({ 'x-dartcade-client-ip': '1.2.3.4' }))).toBe('JP')
    expect(await r(req({ 'x-dartcade-client-ip': '5.6.7.8' }))).toBeNull()
    expect(await r(req({ 'x-dartcade-client-ip': '10.0.0.1' }))).toBeNull()
  })
  it('prefers the header over the database', async () => {
    const r = resolver({ GEO_TRUST_HEADER: '1', GEOIP_DB_PATH: '/x.mmdb' }, { '1.2.3.4': 'JP' })
    expect(await r(req({ 'cf-ipcountry': 'AT', 'x-dartcade-client-ip': '1.2.3.4' }))).toBe('AT')
  })
  it('leaves null when the database is missing or throws', async () => {
    const warn = vi.fn()
    const broken = createCountryResolver(geoConfig({ GEOIP_DB_PATH: '/nope' }), warn, () => Promise.reject(new Error('ENOENT')))
    expect(await broken(req({ 'x-dartcade-client-ip': '1.2.3.4' }))).toBeNull()
    expect(await broken(req({ 'x-dartcade-client-ip': '5.6.7.8' }))).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('/nope')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('1.2.3.4')
    const throws = createCountryResolver(
      geoConfig({ GEOIP_DB_PATH: '/x' }),
      () => undefined,
      () =>
        Promise.resolve(() => {
          throw new Error('bad ip')
        }),
    )
    expect(await throws(req({ 'x-dartcade-client-ip': 'nonsense' }))).toBeNull()
  })
})
