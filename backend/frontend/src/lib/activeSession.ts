import { api } from '$lib/api'
import { loadOnce } from './loadOnce.js'

/** The id of the user's running game, if any. */
export function pickActive(sessions: { id: string; status: string }[] | undefined): string | null {
  return sessions?.find(s => s.status === 'active')?.id ?? null
}

/** The running game (the tab bar's Live tab): loaded once, refreshed when a game starts or ends. */
export const activeSessionId = loadOnce(async () => pickActive((await api.GET('/api/sessions')).data?.sessions), null)
