export interface GameSettings {
  showMarkers: boolean
  soundHit: boolean
  soundMiss: boolean
  soundSwitch: boolean
}

export const defaultSettings: GameSettings = {
  showMarkers: false,
  soundHit: false,
  soundMiss: false,
  soundSwitch: false,
}
