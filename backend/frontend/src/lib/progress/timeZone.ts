import { api as defaultApi } from '$lib/api/client'

type Api = Pick<typeof defaultApi, 'GET' | 'PUT'>

/** The browser's IANA time zone. */
export const browserTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone

/**
 * XP's daily limits and the day streak count days in the account's time zone: the first browser
 * an account signs in on sets it (Settings changes it later).
 */
export async function syncTimeZone(api: Api = defaultApi, zone = browserTimeZone()): Promise<void> {
  const { data } = await api.GET('/api/me/preferences')
  if (data && !data.timeZone) await api.PUT('/api/me/preferences', { body: { timeZone: zone } })
}
