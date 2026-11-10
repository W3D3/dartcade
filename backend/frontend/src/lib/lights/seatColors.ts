// The seat colours' palette and names for the picker in Settings' Lights. The first six are the
// built-in defaults ($shared/lights/profile.ts); any other colour comes from the picker's custom field.
import { DEFAULT_SEAT_COLORS, LIME } from '$shared/lights/index.js'

export type PaletteColor = { hex: string; name: string }

// Names of the built-in colours, in seat order: zipped with DEFAULT_SEAT_COLORS so there is one source for the hexes
const DEFAULT_NAMES = ['cyan', 'off-white', 'orange', 'pink', 'violet', 'green'] as const

export const SEAT_PALETTE: readonly PaletteColor[] = [
  ...DEFAULT_SEAT_COLORS.map((hex, i) => ({ hex, name: DEFAULT_NAMES[i] })),
  { hex: '#ff3b30', name: 'red' },
  { hex: '#2f80ff', name: 'blue' },
  { hex: '#ffffff', name: 'white' },
  { hex: LIME, name: 'lime' },
  { hex: '#14b8a6', name: 'teal' },
  { hex: '#a855f7', name: 'purple' },
]

/** A colour's name for screen readers: its palette name, else the hex itself. */
export const colorName = (hex: string): string => SEAT_PALETTE.find(c => c.hex === hex.toLowerCase())?.name ?? hex.toLowerCase()

/** Whether these are the built-in colours, so there is nothing to reset. */
export const isDefaultSeatColors = (colors: readonly string[]): boolean =>
  colors.length === DEFAULT_SEAT_COLORS.length && colors.every((c, i) => c.toLowerCase() === DEFAULT_SEAT_COLORS[i])
