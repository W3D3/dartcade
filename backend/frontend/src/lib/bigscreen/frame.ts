// The big screen draws the match screen's components in a same-origin iframe a fifth smaller than the
// stage and scales it up, so their media queries, vh sizes and breakpoints behave as in a 1536 px window.
// The page owns the socket, the audio and the previous snapshot; it posts what the frame draws.
import type { GameSettings } from '../gameSettings.js'
import type { VisitHistory } from '../visitHistory.js'
import type { BigScreenState } from './store.js'

export const FRAME_HASH = '#/big-screen-frame'
/** The stage is this much bigger than the frame's window (1920 / 1.25 = 1536). */
export const FRAME_SCALE = 1.25
export const FRAME_READY = 'bigscreen.ready'
/** The page was tapped or typed on: the frame's own audio wakes up too (it has its own AudioContext). */
export const FRAME_WAKE = 'bigscreen.wake'

export type FrameState = {
  screen: Exclude<BigScreenState['screen'], { kind: 'idle' }>
  settings: GameSettings
  /** Around the Clock's visits, tracked by the page. */
  history: VisitHistory
  countdown: string
}
/** `state` is null while nothing is played: the frame stays loaded, ready for the next game. */
export type FrameMessage = { type: 'bigscreen.state'; state: FrameState | null }

export const isFrameMessage = (data: unknown): data is FrameMessage =>
  typeof data === 'object' && data !== null && 'type' in data && data.type === 'bigscreen.state'
