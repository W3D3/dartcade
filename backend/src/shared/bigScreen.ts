/** When a board's big screen runs: never, whenever a game starts, or only when the owner starts it. */
export type BigScreenMode = 'off' | 'auto' | 'manual'

export const BIG_SCREEN_MODES: readonly BigScreenMode[] = ['off', 'auto', 'manual']

/** How long a finished game's result stays on the big screen. */
export const RESULT_HOLD_MS = 60_000

export type BigScreenScreen =
  | { kind: 'idle' }
  | { kind: 'game'; snapshot: unknown }
  | {
      kind: 'result'
      snapshot: unknown
      /** Epoch ms when the result is dropped. */
      until: number
    }

export type BigScreenMessage = {
  type: 'big_screen'
  board: { id: string; name: string; online: boolean }
  prefs: Record<string, unknown> // the board owner's account settings
  screen: BigScreenScreen
}
