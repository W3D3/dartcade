// Playing a match from tournament mode (Tournament-Mode-Board): the boards a match may be played on,
// who throws first, and starting it. A venue device acts for the organizer who paired it.
import { api } from '$lib/api/client'
import { deviceStore } from '$lib/storage'
import { refusal } from './browse'
import type { LiveMatch, LiveMessage } from './live'
import { matchLabel } from './mode'
import type { Tournament } from '$lib/api'

export interface PlayBoard {
  id: string
  name: string
  state: 'free' | 'in_use' | 'offline'
  /** The bracket key of the tournament match using it. */
  matchKey: string | null
}

/** Who throws first: a bull off, or the match's first or second side. */
export type First = 'bull_off' | 'a' | 'b'

const LAST_BOARD_KEY = 'tournamentMode.lastBoard'

/** The board this device played on last, so it is offered first ("last used on this device"). */
export function lastBoardId(): string | null {
  try {
    return deviceStore()?.getItem(LAST_BOARD_KEY) || null
  } catch {
    return null
  }
}

export function rememberBoard(id: string | null): void {
  try {
    if (id) deviceStore()?.setItem(LAST_BOARD_KEY, id)
  } catch {
    // Not remembered: no board is preselected next time
  }
}

/** A board in use or offline cannot be picked. */
export const pickable = (b: PlayBoard): boolean => b.state === 'free'

/** The preselected board: the one used last if it is free, else the first free one; null (no board) when none is. */
export function defaultBoard(boards: readonly PlayBoard[], last: string | null): string | null {
  return (boards.find(b => b.id === last && pickable(b)) ?? boards.find(pickable))?.id ?? null
}

/** "QF 2, Mia K. vs Paul": the match a board is in use by. */
export function matchTitle(m: LiveMessage, format: Tournament['format'], match: LiveMatch): string {
  const name = (i: 0 | 1) => m.entries.find(e => e.id === match.sides[i])?.name ?? 'To be decided'
  return `${matchLabel(m, format, match)}, ${name(0)} vs ${name(1)}`
}

/** A board's second line: "Free · last used on this device", "In use · QF 2, Mia K. vs Paul", "Offline". */
export function boardLine(b: PlayBoard, last: string | null, using: string | null): string {
  if (b.state === 'offline') return 'Offline'
  if (b.state === 'in_use') return using ? `In use · ${using}` : 'In use · another game'
  return b.id === last ? 'Free · last used on this device' : 'Free'
}

/** The first-thrower choices of a match, by the names of its two sides. */
export function firstChoices(names: [string, string]): { id: First; label: string }[] {
  return [
    { id: 'bull_off', label: 'Bull-off' },
    { id: 'a', label: names[0] },
    { id: 'b', label: names[1] },
  ]
}

/** The tournament's boards for this device, and whether its game asks who throws first; null when they could not be loaded. */
export async function loadPlayBoards(tournamentId: string): Promise<{ boards: PlayBoard[]; choosesFirst: boolean } | null> {
  try {
    return (await api.GET('/api/tournaments/{id}/play-boards', { params: { path: { id: tournamentId } } })).data ?? null
  } catch {
    return null
  }
}

/** Starts the match; the game to open, or what refused it. */
export async function startMatch(
  tournamentId: string,
  matchKey: string,
  boardId: string | null,
  first: First,
): Promise<{ sessionId: string } | { error: string }> {
  try {
    const res = await api.POST('/api/tournaments/{id}/matches/{matchKey}/start', {
      params: { path: { id: tournamentId, matchKey } },
      body: { boardId, first },
    })
    if (res.data) return res.data
    return { error: refusal(res.error.error) }
  } catch {
    return { error: 'Something went wrong. Try again.' }
  }
}
