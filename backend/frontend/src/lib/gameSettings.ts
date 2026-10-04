import { z } from 'zod'
import type { ScoreUpdates } from './heldScore.js'

/** In-game display and sound settings, kept per device in localStorage. */
export interface GameSettings {
  /** 3+ player Around the Clock: other players' targets as initials on the board. */
  showMarkers: boolean
  /** Suggested checkout darts in the empty slots, rings on the board, "Can finish". */
  checkoutSuggestions: boolean
  visitSum: boolean
  chalkboard: boolean
  /** When the big score left counts down: after every dart, or once the visit is over. */
  scoreUpdates: ScoreUpdates
  /** 0–1 */
  volume: number
  soundHit: boolean
  soundMiss: boolean
  soundSwitch: boolean
  soundBust: boolean
  /** The match screen's input: the board or the keypad, as last picked; null until picked. */
  inputView: 'board' | 'entry' | null
  /** X01: the caller says each visit. */
  callerOn: boolean
  /** The caller's voice: one of the user's packs (its id) or `builtin:<id>`; null for the default built-in voice. */
  callerVoice: string | null
  /** The match screen's board: drawn, or a camera's still of the real board under the marks. */
  boardView: BoardView
}

export const BOARD_VIEWS = ['svg', 'cam1', 'cam2', 'cam3'] as const
export type BoardView = (typeof BOARD_VIEWS)[number]

export const defaultSettings: GameSettings = {
  showMarkers: false,
  checkoutSuggestions: true,
  visitSum: true,
  chalkboard: true,
  scoreUpdates: 'dart',
  volume: 0.7,
  soundHit: false,
  soundMiss: false,
  soundSwitch: false,
  soundBust: false,
  inputView: null,
  callerOn: false,
  callerVoice: null,
  boardView: 'svg',
}

export const SETTINGS_KEY = 'dartcade_game_settings'

/** Keys of the settings that are on/off switches. */
export type BooleanSettingKey = { [K in keyof GameSettings]: GameSettings[K] extends boolean ? K : never }[keyof GameSettings]

const d = defaultSettings
const flag = (def: boolean) => z.boolean().catch(def).default(def)
// Each setting falls back to its default on its own; unknown keys are dropped
const SettingsSchema = z.object({
  showMarkers: flag(d.showMarkers),
  checkoutSuggestions: flag(d.checkoutSuggestions),
  visitSum: flag(d.visitSum),
  chalkboard: flag(d.chalkboard),
  scoreUpdates: z.enum(['dart', 'visit']).catch(d.scoreUpdates).default(d.scoreUpdates),
  volume: z.number().refine(Number.isFinite).transform(v => Math.min(1, Math.max(0, v))).catch(d.volume).default(d.volume),
  soundHit: flag(d.soundHit),
  soundMiss: flag(d.soundMiss),
  soundSwitch: flag(d.soundSwitch),
  soundBust: flag(d.soundBust),
  inputView: z.enum(['board', 'entry']).nullable().catch(null).default(null),
  callerOn: flag(d.callerOn),
  callerVoice: z.string().min(1).nullable().catch(null).default(null),
  boardView: z.enum(BOARD_VIEWS).catch(d.boardView).default(d.boardView),
}).catch({ ...d })

/** Stored settings over the defaults; unknown keys and values of the wrong type are ignored. */
export function loadSettings(storage: Pick<Storage, 'getItem'> | null): GameSettings {
  let raw: unknown
  try {
    raw = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? 'null')
  } catch {
    return { ...defaultSettings }
  }
  return SettingsSchema.parse(raw ?? {})
}

export function saveSettings(storage: Pick<Storage, 'setItem'> | null, s: GameSettings): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // Storage full or blocked: settings just don't persist
  }
}
