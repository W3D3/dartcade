// Named teams' rules (Team-Create board): the API enforces them, the New team form shows them.
import { CONTROL_CHARS, normalizeName } from './names.js'

export const TEAM_LIMITS = {
  /** Players a team needs to register for a tournament. */
  minPlayers: 2,
  /** Members and pending invites together. */
  maxPlayers: 8,
  /** Teams one player may be in. */
  teamsPerPlayer: 5,
  inviteDays: 7,
  nameMin: 3,
  nameMax: 24,
} as const

/** The colours a team picks from, in the board's order. */
export const TEAM_COLORS = ['#9b7bff', '#4fd1c5', '#ff8a4a', '#3fb6e8', '#eac24f', '#7fd18f', '#ff6b9a', '#c6f24e'] as const
export type TeamColor = (typeof TEAM_COLORS)[number]
/** What the colour picker reads out. */
export const TEAM_COLOR_NAMES: Record<TeamColor, string> = {
  '#9b7bff': 'Violet',
  '#4fd1c5': 'Teal',
  '#ff8a4a': 'Orange',
  '#3fb6e8': 'Blue',
  '#eac24f': 'Gold',
  '#7fd18f': 'Green',
  '#ff6b9a': 'Pink',
  '#c6f24e': 'Lime',
}

/** The name as stored and compared (unique ignoring case): trimmed, NFC, inner runs of spaces as one. */
export const cleanTeamName = (raw: string): string => normalizeName(raw).replace(/\s+/gu, ' ')

/** Why a cleaned name can't be used, or null. */
export function teamNameProblem(name: string): string | null {
  const length = Array.from(name).length
  if (length < TEAM_LIMITS.nameMin || length > TEAM_LIMITS.nameMax) return `${TEAM_LIMITS.nameMin} to ${TEAM_LIMITS.nameMax} characters`
  if (CONTROL_CHARS.test(name)) return 'no control characters'
  return null
}

/** The tag as stored: capital letters. */
export const cleanTeamTag = (raw: string): string => raw.trim().toUpperCase()

export const isTeamTag = (tag: string): boolean => /^[A-Z]{2,4}$/.test(tag)
