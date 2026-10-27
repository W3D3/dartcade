import type { Component } from 'svelte'
import type { GameDetail } from '../api'
import type { GameSettings } from '../gameSettings.js'
import type { Snapshot } from '../ws.js'
import AtcLive from '../components/bigscreen/AtcLive.svelte'
import GenericResult from '../components/bigscreen/GenericResult.svelte'
import HiloLive from '../components/bigscreen/HiloLive.svelte'
import MinigolfLive from '../components/bigscreen/MinigolfLive.svelte'
import P121Live from '../components/bigscreen/P121Live.svelte'
import X01Live from '../components/bigscreen/X01Live.svelte'
import X01Win from '../components/bigscreen/X01Win.svelte'
import type { Orientation } from './stage.js'
import type { BigScreenState } from './store.js'

/** What the route gives every view; a view takes the ones it needs. */
export type ViewProps = {
  snapshot: Snapshot
  orientation: Orientation
  countdown: string
  detail: GameDetail | null
  settings: GameSettings
}

type Entry = {
  live: Component<ViewProps>
  /** The result design; a game without one shows the generic card. */
  result?: Component<ViewProps>
  /** Whether the result design can be drawn: a match without a winner (a forfeit) is ranked from the saved game, so it needs it. */
  resultReady?: (snapshot: Snapshot, hasDetail: boolean) => boolean
}

/** Every game with a big screen view; a game missing here shows the fallback card. */
export const BIG_SCREEN_VIEWS: Partial<Record<Snapshot['gameId'], Entry>> = {
  x01: { live: X01Live, result: X01Win, resultReady: (s, hasDetail) => s.gameId === 'x01' && (s.game.winner !== null || hasDetail) },
  atc: { live: AtcLive },
  p121: { live: P121Live },
  hilo: { live: HiloLive },
  minigolf: { live: MinigolfLive },
}

export type BigScreenView =
  | { kind: 'idle' }
  | { kind: 'fallback'; snapshot: Snapshot }
  | { kind: 'live' | 'result'; snapshot: Snapshot; component: Component<ViewProps> }

/** Which view the screen shows: a game's live view, its result design (or the generic card), or the fallback card. */
export function viewFor(screen: BigScreenState['screen']): BigScreenView {
  if (screen.kind === 'idle') return { kind: 'idle' }
  const { snapshot } = screen
  const entry: Entry | undefined = BIG_SCREEN_VIEWS[snapshot.gameId]
  if (!entry) return { kind: 'fallback', snapshot }
  if (screen.kind === 'game') return { kind: 'live', snapshot, component: entry.live }
  const ready = entry.resultReady?.(snapshot, screen.detail !== undefined) ?? true
  return { kind: 'result', snapshot, component: ready && entry.result ? entry.result : GenericResult }
}
