import { z } from 'zod'

/** In-game display and sound settings, kept per device in localStorage. */
export interface GameSettings {
  /** 3+ player Around the Clock: other players' targets as initials on the board. */
  showMarkers: boolean
  /** Suggested checkout darts in the empty slots, rings on the board, "Can finish". */
  checkoutSuggestions: boolean
  visitSum: boolean
  chalkboard: boolean
  /** 0–1 */
  volume: number
  soundHit: boolean
  soundMiss: boolean
  soundSwitch: boolean
  soundBust: boolean
  /** The match screen's input: the board or the keypad, as last picked; null until picked. */
  inputView: 'board' | 'entry' | null
}

export const defaultSettings: GameSettings = {
  showMarkers: false,
  checkoutSuggestions: true,
  visitSum: true,
  chalkboard: true,
  volume: 0.7,
  soundHit: false,
  soundMiss: false,
  soundSwitch: false,
  soundBust: false,
  inputView: null,
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
  volume: z.number().refine(Number.isFinite).transform(v => Math.min(1, Math.max(0, v))).catch(d.volume).default(d.volume),
  soundHit: flag(d.soundHit),
  soundMiss: flag(d.soundMiss),
  soundSwitch: flag(d.soundSwitch),
  soundBust: flag(d.soundBust),
  inputView: z.enum(['board', 'entry']).nullable().catch(null).default(null),
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
