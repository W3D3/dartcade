import { readable, type Readable } from 'svelte/store'
import { api } from '$lib/api'

/** The id of the user's running game, if any. */
export function pickActive(sessions: { id: string; status: string }[] | undefined): string | null {
  return sessions?.find(s => s.status === 'active')?.id ?? null
}

/** The running game, loaded when first used (the tab bar's Live tab). */
export const activeSessionId: Readable<string | null> = readable<string | null>(null, set => {
  api.GET('/api/sessions')
    .then(({ data }) => set(pickActive(data?.sessions)))
    .catch(() => { /* no Live tab */ })
})
