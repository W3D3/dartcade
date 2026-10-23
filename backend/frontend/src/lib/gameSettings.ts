import { z } from 'zod'
import type { ScoreUpdates } from './heldScore.js'

/** In-game display and sound settings, cached per device in localStorage; the account-wide ones
 *  (`ACCOUNT_KEYS` in accountSettings.ts) also follow the signed-in account. */
export interface GameSettings {
  /** 3+ player Around the Clock: other players' targets as initials on the board. */
  showMarkers: boolean
  /** Suggested checkout darts in the empty slots, rings on the board, "Can finish". */
  checkoutSuggestions: boolean
  /** The double the player likes to finish on (1–20, 25 for the bull); null: the table's first
   *  route. Not in the settings drawer yet. */
  favouriteDouble: number | null
  visitSum: boolean
  chalkboard: boolean
  /** When the big score left counts down: after every dart, or once the visit is over. */
  scoreUpdates: ScoreUpdates
  /** 0–1 */
  volume: number
  soundHit: boolean
  /** Trebles get their own sound; off: they play the hit sound (when that's on). */
  soundTreble: boolean
  soundMiss: boolean
  soundSwitch: boolean
  soundBust: boolean
  /** Minigolf: the ball knocking into things and dropping into the cup. */
  soundBall: boolean
  /** A fanfare when the game is won. */
  soundWin: boolean
  /** The thrower's sound pack (a progression reward) when a dart lands or a visit busts. */
  soundEffects: boolean
  /** A sound pack (perk id) for every dart on this screen; null: each thrower's own. */
  soundPack: string | null
  /** 0–1, the sound packs' own volume. */
  effectsVolume: number
  /** Minigolf: the direction wheel around the ball while aiming. */
  aimDial: boolean
  /** Minigolf: rolls slow down near the cup. */
  slowMotion: boolean
  /** The match screen's input: the board or the keypad, as last picked; null until picked. */
  inputView: 'board' | 'entry' | null
  /** X01: the caller says each visit. */
  callerOn: boolean
  /** The caller's voice: one of the user's packs (its id) or `builtin:<id>`; null for the default built-in voice. */
  callerVoice: string | null
  /** X01: the caller says what the next thrower requires when they can finish ("You require 121"). */
  callerCheckouts: boolean
  /** X01: the checkout call is said again while the thrower's score stays the same (after a bust or a no-score visit). */
  callerCheckoutRepeat: boolean
  /** The match screen's board: drawn, or a camera's still of the real board under the marks
   *  (combined: the three cameras blended, each region from the sharpest). */
  boardView: BoardView
  /** The camera view the board-on-board toggle restores when switching back from Drawn. */
  lastCameraView: CameraView
  /** New game defaults: X01's start score, check-out, legs to win and throw order (bull off),
   *  pre-filled on the Play page. Values from X01's own settings. */
  x01StartScore: 301 | 501 | 701
  x01OutMode: 'straight' | 'double' | 'master'
  x01FirstTo: number
  x01BullOff: 'off' | 'wdc' | 'pdc'
}

export const BOARD_VIEWS = ['svg', 'cam1', 'cam2', 'cam3', 'combined'] as const
export type BoardView = (typeof BOARD_VIEWS)[number]

/** A camera view, i.e. every board view but the drawn one. */
export const CAMERA_VIEWS = BOARD_VIEWS.filter((v): v is CameraView => v !== 'svg')
export type CameraView = Exclude<BoardView, 'svg'>

/** Labels shown in the settings drawer and the board's own toggle; kept in one place so they
 *  can't drift apart. */
export const BOARD_VIEW_LABELS: Record<BoardView, string> = {
  svg: 'Drawn',
  cam1: 'Cam 1',
  cam2: 'Cam 2',
  cam3: 'Cam 3',
  combined: 'Combined',
}

export const defaultSettings: GameSettings = {
  showMarkers: false,
  checkoutSuggestions: true,
  favouriteDouble: null,
  visitSum: true,
  chalkboard: true,
  scoreUpdates: 'dart',
  volume: 0.7,
  soundHit: false,
  soundTreble: false,
  soundMiss: false,
  soundSwitch: false,
  soundBust: false,
  soundBall: false,
  soundWin: false,
  soundEffects: true,
  soundPack: null,
  effectsVolume: 0.5,
  aimDial: true,
  slowMotion: true,
  inputView: null,
  callerOn: false,
  callerVoice: null,
  callerCheckouts: true,
  callerCheckoutRepeat: true,
  boardView: 'svg',
  lastCameraView: 'combined',
  x01StartScore: 501,
  x01OutMode: 'double',
  x01FirstTo: 3,
  x01BullOff: 'off',
}

export const SETTINGS_KEY = 'dartcade_game_settings'

/** Keys of the settings that are on/off switches. */
export type BooleanSettingKey = { [K in keyof GameSettings]: GameSettings[K] extends boolean ? K : never }[keyof GameSettings]

const d = defaultSettings
const flag = (def: boolean) => z.boolean().catch(def).default(def)
const unit = (def: number) =>
  z
    .number()
    .refine(Number.isFinite)
    .transform(v => Math.min(1, Math.max(0, v)))
    .catch(def)
    .default(def)
// Each setting falls back to its default on its own; unknown keys are dropped
const SettingsSchema = z
  .object({
    showMarkers: flag(d.showMarkers),
    checkoutSuggestions: flag(d.checkoutSuggestions),
    favouriteDouble: z
      .number()
      .int()
      .refine(v => (v >= 1 && v <= 20) || v === 25)
      .nullable()
      .catch(null)
      .default(null),
    visitSum: flag(d.visitSum),
    chalkboard: flag(d.chalkboard),
    scoreUpdates: z.enum(['dart', 'visit']).catch(d.scoreUpdates).default(d.scoreUpdates),
    volume: unit(d.volume),
    soundHit: flag(d.soundHit),
    soundTreble: flag(d.soundTreble),
    soundMiss: flag(d.soundMiss),
    soundSwitch: flag(d.soundSwitch),
    soundBust: flag(d.soundBust),
    soundBall: flag(d.soundBall),
    soundWin: flag(d.soundWin),
    soundEffects: flag(d.soundEffects),
    soundPack: z.string().min(1).nullable().catch(null).default(null),
    effectsVolume: unit(d.effectsVolume),
    aimDial: flag(d.aimDial),
    slowMotion: flag(d.slowMotion),
    inputView: z.enum(['board', 'entry']).nullable().catch(null).default(null),
    callerOn: flag(d.callerOn),
    callerVoice: z.string().min(1).nullable().catch(null).default(null),
    callerCheckouts: flag(d.callerCheckouts),
    callerCheckoutRepeat: flag(d.callerCheckoutRepeat),
    boardView: z.enum(BOARD_VIEWS).catch(d.boardView).default(d.boardView),
    lastCameraView: z.enum(CAMERA_VIEWS).catch(d.lastCameraView).default(d.lastCameraView),
    x01StartScore: z
      .union([z.literal(301), z.literal(501), z.literal(701)])
      .catch(d.x01StartScore)
      .default(d.x01StartScore),
    x01OutMode: z.enum(['straight', 'double', 'master']).catch(d.x01OutMode).default(d.x01OutMode),
    // At most 99, as the account takes it
    x01FirstTo: z
      .number()
      .int()
      .min(1)
      .transform(v => Math.min(99, v))
      .catch(d.x01FirstTo)
      .default(d.x01FirstTo),
    x01BullOff: z.enum(['off', 'wdc', 'pdc']).catch(d.x01BullOff).default(d.x01BullOff),
  })
  .catch({ ...d })

/** Settings from untrusted data over the defaults; unknown keys and values of the wrong type are ignored. */
export function parseSettings(raw: unknown): GameSettings {
  return SettingsSchema.parse(raw ?? {})
}

/** Stored settings over the defaults; unknown keys and values of the wrong type are ignored. */
export function loadSettings(storage: Pick<Storage, 'getItem'> | null): GameSettings {
  try {
    return parseSettings(JSON.parse(storage?.getItem(SETTINGS_KEY) ?? 'null'))
  } catch {
    return { ...defaultSettings }
  }
}

export function saveSettings(storage: Pick<Storage, 'setItem'> | null, s: GameSettings): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // Storage full or blocked: settings just don't persist
  }
}
