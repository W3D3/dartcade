// Which rows the in-game settings drawer offers, per game: only options the game uses.
import type { GameSettings } from '../gameSettings.js'

type Key = keyof GameSettings
export interface DrawerRows {
  /** Display switches, in order (Board view follows them in every game). */
  display: Key[]
  /** Sound effect checkboxes, in order. */
  sounds: Key[]
}

const dartSounds: Key[] = ['soundHit', 'soundTreble', 'soundMiss', 'soundSwitch', 'soundWin']
const withBust: Key[] = ['soundHit', 'soundTreble', 'soundMiss', 'soundSwitch', 'soundBust', 'soundWin']

const rows: Partial<Record<string, DrawerRows>> = {
  x01: { display: ['checkoutSuggestions', 'visitSum', 'chalkboard'], sounds: withBust },
  atc: { display: ['showMarkers'], sounds: dartSounds },
  minigolf: { display: ['aimDial', 'slowMotion'], sounds: ['soundHit', 'soundMiss', 'soundSwitch', 'soundBall', 'soundWin'] },
  p121: { display: ['checkoutSuggestions'], sounds: withBust },
}

export const drawerRows = (gameId: string): DrawerRows => rows[gameId] ?? { display: [], sounds: dartSounds }
