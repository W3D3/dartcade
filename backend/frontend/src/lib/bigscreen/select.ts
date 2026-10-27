import type { Snapshot } from '../ws.js'
import type { BigScreenState } from './store.js'

export type ViewKey = 'idle' | 'x01' | 'atc' | 'p121' | 'hilo' | 'minigolf' | 'fallback' | 'x01-win' | 'generic-result'
export type BigScreenView = { component: ViewKey; snapshot: Snapshot | null }

/** Which view the screen shows: a game's live view, its result design, or a generic card. */
export function viewFor(screen: BigScreenState['screen']): BigScreenView {
  if (screen.kind === 'idle') return { component: 'idle', snapshot: null }
  const { snapshot } = screen
  const id = snapshot.gameId
  // The type knows every mode today; a game added to the schema before its big screen view lands here
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (id !== 'x01' && id !== 'atc' && id !== 'p121' && id !== 'hilo' && id !== 'minigolf') return { component: 'fallback', snapshot }
  if (screen.kind === 'game') return { component: id, snapshot }
  return { component: id === 'x01' ? 'x01-win' : 'generic-result', snapshot }
}
