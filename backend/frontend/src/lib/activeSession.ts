import { derived } from 'svelte/store'
import { me } from './lobby/sockets.js'

/** The id of the user's running game, if any (the tab bar's Live tab, the banner): what
 * /ws/me says, live. Null until it connects (no fetch of its own: the server decides). */
export const activeSessionId = derived(me, $me => $me?.game?.sessionId ?? null)
