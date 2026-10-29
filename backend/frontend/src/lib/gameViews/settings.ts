// Which rows the in-game settings drawer offers, per game: only options the game uses.
import type { GameSettings } from '../gameSettings.js'
import { isGameId, type GameId } from '$shared/gameNames'

type Key = keyof GameSettings
export interface DrawerRows {
  /** Display switches, in order (Board view follows them in every game). */
  display: Key[]
  /** Sound effect checkboxes, in order. */
  sounds: Key[]
}

const dartSounds: Key[] = ['soundHit', 'soundTreble', 'soundMiss', 'soundSwitch', 'soundWin']
const withBust: Key[] = ['soundHit', 'soundTreble', 'soundMiss', 'soundSwitch', 'soundBust', 'soundWin']

const rows = {
  x01: { display: ['checkoutSuggestions', 'visitSum', 'chalkboard'], sounds: withBust },
  atc: { display: ['showMarkers'], sounds: dartSounds },
  minigolf: { display: ['aimDial', 'slowMotion'], sounds: ['soundHit', 'soundMiss', 'soundSwitch', 'soundBall', 'soundWin'] },
  p121: { display: ['checkoutSuggestions'], sounds: withBust },
  // A lost life plays the bust sound
  hilo: { display: [], sounds: withBust },
  cricket: { display: [], sounds: dartSounds },
} satisfies Record<GameId, DrawerRows>

export const drawerRows = (gameId: string): DrawerRows => (isGameId(gameId) ? rows[gameId] : { display: [], sounds: dartSounds })
