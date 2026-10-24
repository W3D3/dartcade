// Which bridge release this backend offers to its boards (the Boards page's Update bridge button).
import semver from 'semver'
import { z } from 'zod'

/** The repo the bridge downloads its releases from (bridge/internal/update builds the same URLs). */
export const RELEASES_URL = 'https://api.github.com/repos/W3D3/dartcade/releases?per_page=100'

// A release the bridge can verify publishes these (.github/workflows/release.yml)
const SIGNED_ASSETS = ['SHA256SUMS', 'SHA256SUMS.sig']

const ReleasesSchema = z.array(
  z.object({
    tag_name: z.string(),
    draft: z.boolean(),
    prerelease: z.boolean(),
    assets: z.array(z.object({ name: z.string() })),
  }),
)
export type Release = z.output<typeof ReleasesSchema>[number]

/**
 * The newest release a bridge may update to: never a major above the backend's own. In 0.x the
 * minor is the breaking part (semver), so a 0.x backend also caps the minor: 0.9.3 offers 0.9.x.
 * A dev or otherwise unparseable backend version offers nothing.
 */
export function pickBridgeRelease(backendVersion: string, releases: readonly Release[]): string | null {
  const own = semver.parse(backendVersion)
  if (!own || own.prerelease.length) return null
  const fits = (v: semver.SemVer) => (own.major === 0 ? v.major === 0 && v.minor <= own.minor : v.major <= own.major)
  let best: semver.SemVer | null = null
  for (const r of releases) {
    const v = semver.parse(r.tag_name)
    if (!v || r.draft || r.prerelease || v.prerelease.length || !r.tag_name.startsWith('v')) continue
    if (!SIGNED_ASSETS.every(name => r.assets.some(a => a.name === name))) continue
    if (fits(v) && (!best || semver.gt(v, best))) best = v
  }
  return best ? `v${best.version}` : null
}

/** The offered version when it is newer than the bridge's; null when it's current, ahead, or a dev build. */
export function bridgeUpdateFor(bridgeVersion: string | null | undefined, offered: string | null): string | null {
  if (!offered || !bridgeVersion) return null
  const own = semver.parse(bridgeVersion)
  return own && semver.lt(own, offered) ? offered : null
}

const FRESH_MS = 60 * 60 * 1000
const RETRY_MS = 5 * 60 * 1000

/**
 * The offered bridge version, from GitHub's releases (cached for an hour, retried after 5 minutes on
 * a failure). `offered()` never waits: it answers from the cache and refreshes it in the background.
 */
export function bridgeReleases(backendVersion: string, fetchReleases: () => Promise<unknown> = defaultFetch) {
  let cached: string | null = null
  let nextAt = 0
  let inFlight: Promise<void> | null = null

  function refresh(): Promise<void> {
    // A dev backend offers nothing: no need to ask GitHub
    if (!semver.valid(backendVersion)) return Promise.resolve()
    inFlight ??= fetchReleases()
      .then(body => {
        cached = pickBridgeRelease(backendVersion, ReleasesSchema.parse(body))
        nextAt = Date.now() + FRESH_MS
      })
      .catch((err: unknown) => {
        console.warn('Could not fetch the bridge releases from GitHub', err)
        nextAt = Date.now() + RETRY_MS
      })
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  return {
    offered(): string | null {
      if (Date.now() >= nextAt) void refresh()
      return cached
    },
    refresh,
  }
}
export type BridgeReleases = ReturnType<typeof bridgeReleases>

async function defaultFetch(): Promise<unknown> {
  const res = await fetch(RELEASES_URL, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'dartcade' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  return res.json()
}
