// The running server's build (GET /api/version) and the SPA's own, to show the version and spot a stale tab.
import { api, type BuildInfo } from '$lib/api'
import { writable } from 'svelte/store'
import { loadOnce } from './loadOnce.js'

export type { BuildInfo }

/** The build this SPA was bundled in (backend/Dockerfile stamps it); dev outside an image. */
export const SPA_BUILD: BuildInfo = {
  version: import.meta.env.VITE_APP_VERSION || 'dev',
  commit: import.meta.env.VITE_APP_COMMIT || null,
  buildTime: import.meta.env.VITE_APP_BUILD_TIME || null,
}

export const serverVersion = loadOnce<BuildInfo | null>(async () => {
  const { data } = await api.GET('/api/version')
  if (!data) throw new Error('no version')
  return data
}, null)

/** The stale-tab notice was dismissed: kept here, not in the notice, since every page mounts its own Layout. */
export const updateDismissed = writable(false)

/** Whether the server runs another build than this tab. An unstamped SPA (dev, PR previews) never counts as stale. */
export function isStale(spa: BuildInfo, server: BuildInfo | null): boolean {
  if (!server || spa.version === 'dev') return false
  return spa.version !== server.version || spa.commit !== server.commit
}

export const shortCommit = (sha: string): string => sha.slice(0, 7)
export const commitUrl = (sha: string): string => `https://github.com/W3D3/dartcade/commit/${sha}`
