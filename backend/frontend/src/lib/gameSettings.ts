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
}

export const SETTINGS_KEY = 'dartcade_game_settings'

/** Keys of the settings that are on/off switches. */
export type BooleanSettingKey = { [K in keyof GameSettings]: GameSettings[K] extends boolean ? K : never }[keyof GameSettings]

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)

/** Stored settings over the defaults; unknown keys and values of the wrong type are ignored. */
export function loadSettings(storage: Pick<Storage, 'getItem'> | null): GameSettings {
  let raw: unknown
  try {
    raw = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? 'null')
  } catch {
    return { ...defaultSettings }
  }
  const s = isRecord(raw) ? raw : {}
  const d = defaultSettings
  const volume = typeof s.volume === 'number' && Number.isFinite(s.volume) ? Math.min(1, Math.max(0, s.volume)) : d.volume
  return {
    showMarkers: bool(s.showMarkers, d.showMarkers),
    checkoutSuggestions: bool(s.checkoutSuggestions, d.checkoutSuggestions),
    visitSum: bool(s.visitSum, d.visitSum),
    chalkboard: bool(s.chalkboard, d.chalkboard),
    volume,
    soundHit: bool(s.soundHit, d.soundHit),
    soundMiss: bool(s.soundMiss, d.soundMiss),
    soundSwitch: bool(s.soundSwitch, d.soundSwitch),
    soundBust: bool(s.soundBust, d.soundBust),
  }
}

export function saveSettings(storage: Pick<Storage, 'setItem'> | null, s: GameSettings): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // Storage full or blocked: settings just don't persist
  }
}
