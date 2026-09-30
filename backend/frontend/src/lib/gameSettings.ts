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

/** Stored settings over the defaults; unknown keys and values of the wrong type are ignored. */
export function loadSettings(storage: Pick<Storage, 'getItem'> | null): GameSettings {
  const out: GameSettings = { ...defaultSettings }
  let raw: unknown
  try {
    raw = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? 'null')
  } catch {
    return out
  }
  if (!raw || typeof raw !== 'object') return out
  const stored = raw as Record<string, unknown>
  for (const key of Object.keys(defaultSettings) as (keyof GameSettings)[]) {
    if (typeof stored[key] === typeof defaultSettings[key]) (out as unknown as Record<string, unknown>)[key] = stored[key]
  }
  out.volume = Number.isFinite(out.volume) ? Math.min(1, Math.max(0, out.volume)) : defaultSettings.volume
  return out
}

export function saveSettings(storage: Pick<Storage, 'setItem'> | null, s: GameSettings): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // Storage full or blocked: settings just don't persist
  }
}
