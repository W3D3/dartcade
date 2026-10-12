// The game modes: the tiles the Play page and the lobby pick from, and what the backend says
// about each (its default settings and their labels), loaded once for both.
import { api, type GameInfo } from '$lib/api'
import { loadOnce } from './loadOnce.js'

/** `flag`: the feature flag that has to be on for the mode to show (see lib/flags.ts). */
export type GameMode = { id: string; glyph: string; name: string; desc: string; available: boolean; flag?: string }

export const GAME_MODES: GameMode[] = [
  {
    id: 'atc',
    glyph: 'ATC',
    name: 'Around the Clock',
    desc: 'Hit 1 through 20 in order, then finish on your chosen target.',
    available: true,
  },
  {
    id: 'x01',
    glyph: 'X01',
    name: 'X01',
    desc: 'Count down from your chosen score. Configure check-in, check-out, and bull off.',
    available: true,
  },
  {
    id: 'minigolf',
    glyph: 'Par 3',
    name: 'Minigolf',
    desc: 'Your dart is the putter. Angle sets direction, distance sets power.',
    available: true,
    flag: 'gamemode.minigolf.enabled',
  },
  { id: 'soccer', glyph: 'Soccer', name: 'Dart Soccer', desc: 'Coming soon.', available: false },
  { id: 'tournament', glyph: 'R16', name: 'Tournament', desc: 'Coming soon.', available: false },
]

/** The modes to show: those without a flag, and those whose flag is on. */
export function visibleModes(modes: readonly GameMode[], isOn: (flag: string) => boolean): GameMode[] {
  return modes.filter(m => m.flag === undefined || isOn(m.flag))
}

/** The saved mode if the backend lists it (it leaves out modes whose flag is off), else its first. */
export function listedMode(saved: string, games: readonly { id: string }[]): string {
  return games.some(g => g.id === saved) ? saved : (games[0]?.id ?? saved)
}

/** The modes the backend has, with their defaults and settings meta; [] until loaded. */
export const gameModes = loadOnce<GameInfo[]>(async () => {
  const { data } = await api.GET('/api/gamemodes')
  if (!data) throw new Error('no game modes')
  return data.modes
}, [])

/** A mode's settings: the saved ones over its defaults, so every field the form reads exists. */
export function withDefaults(saved: Record<string, unknown>, defaults: Record<string, unknown> | undefined): Record<string, unknown> {
  return { ...(defaults ?? {}), ...saved }
}

/** Whether the next game can switch to this mode: picked, playable, known to the backend, and not the current one. */
export function canSwitchTo(picked: string | null, current: string | null, games: GameInfo[]): boolean {
  if (!picked || picked === current) return false
  return GAME_MODES.some(m => m.id === picked && m.available) && games.some(g => g.id === picked)
}

/**
 * The settings changes still on their way to the lobby's snapshot: those it doesn't show yet,
 * minus those whose save already came back (`settled`, the values sent) — a snapshot after
 * the save shows what the server kept, even if that's not what was sent.
 */
export function settlePending(
  pending: Record<string, unknown>,
  saved: Record<string, unknown>,
  settled: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(pending).filter(([key, value]) => value !== saved[key] && !(key in settled && settled[key] === value)),
  )
}
