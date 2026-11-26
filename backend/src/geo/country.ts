import { open, type CountryResponse, type Reader } from 'maxmind'
import { isCountryCode } from '../shared/countries.js'

/** Country headers set by the usual proxies and CDNs; COUNTRY_HEADER=auto tries them in this order. */
export const AUTO_HEADERS = ['cf-ipcountry', 'x-vercel-ip-country', 'x-country-code', 'cloudfront-viewer-country']

/** The header carrying the connecting address, set by app.ts from Fastify's own `req.ip`. */
const CLIENT_IP_HEADER = 'x-dartcade-client-ip'

export type GeoConfig = {
  /** Country headers to read, in order; empty when none is trusted. */
  headers: string[]
  /** A local GeoLite2/DB-IP country .mmdb, read from the client address when no header gave a country. */
  dbPath: string | null
}

/**
 * COUNTRY_HEADER (default cf-ipcountry, or `auto`) is read only behind a proxy the app already
 * trusts (TRUST_PROXY) or when GEO_TRUST_HEADER=1, so a client can't set it where nothing strips it.
 */
export function geoConfig(env: Record<string, string | undefined>): GeoConfig {
  const trusted = !!env.TRUST_PROXY || env.GEO_TRUST_HEADER === '1'
  const name = (env.COUNTRY_HEADER || 'cf-ipcountry').toLowerCase()
  return { headers: trusted ? (name === 'auto' ? AUTO_HEADERS : [name]) : [], dbPath: env.GEOIP_DB_PATH || null }
}

/** An upper-case code the country picker knows; 'XX', 'T1', 'EU' and the like are not. */
function known(code: string | null | undefined): string | null {
  const upper = code?.trim().toUpperCase()
  return upper && isCountryCode(upper) ? upper : null
}

type Lookup = (ip: string) => string | null

const openMmdb = async (path: string): Promise<Lookup> => {
  const reader: Reader<CountryResponse> = await open<CountryResponse>(path)
  return ip => reader.get(ip)?.country?.iso_code ?? null
}

/**
 * The country a sign-up connects from, or null. Never throws and never logs or keeps an address; it warns once if the database file can't be opened.
 * `openDb` is injectable so tests need no database file.
 */
export function createCountryResolver(
  config: GeoConfig,
  warn: (message: string, details?: unknown) => void,
  openDb: (path: string) => Promise<Lookup> = openMmdb,
) {
  let lookup: Promise<Lookup | null> | undefined
  const db = () =>
    (lookup ??= config.dbPath
      ? openDb(config.dbPath).catch((err: unknown) => {
          warn(`GEOIP_DB_PATH ${config.dbPath} could not be opened: sign-ups get no country from it`, err)
          return null
        })
      : Promise.resolve(null))

  return async (headers: Headers | undefined): Promise<string | null> => {
    if (!headers) return null
    for (const name of config.headers) {
      const code = known(headers.get(name))
      if (code) return code
    }
    const ip = headers.get(CLIENT_IP_HEADER)
    const find = ip ? await db() : null
    try {
      return find && ip ? known(find(ip)) : null
    } catch {
      return null // an address the database can't parse
    }
  }
}

export type CountryResolver = ReturnType<typeof createCountryResolver>
