export type MatchLayout = 'phone' | 'portrait' | 'solo' | 'duel' | 'party' | 'teams'

/**
 * How the match screen lays out its players: one phone layout, one portrait layout (players on
 * top, the board below, for any count and teams), the team panels, or by player count. `narrow`:
 * two 300 px panels and the board don't fit side by side (below `DUEL_MIN_WIDTH`), so two players
 * stack as rows, like three or more. `portrait`: the screen is taller than wide (`PORTRAIT_QUERY`).
 */
export function matchLayout(playerCount: number, phone: boolean, teams = false, narrow = false, portrait = false): MatchLayout {
  if (phone) return 'phone'
  if (portrait) return 'portrait'
  if (teams) return 'teams'
  if (playerCount === 1) return 'solo'
  return playerCount === 2 && !narrow ? 'duel' : 'party'
}

/** The narrowest viewport (px) with room for a 300 px panel either side of the board. */
export const DUEL_MIN_WIDTH = 1024

/** Below `DUEL_MIN_WIDTH`: two players stack as rows. */
export const NARROW_MATCH_QUERY = `(max-width: ${DUEL_MIN_WIDTH - 0.02}px)`

/** Taller than wide (an upright monitor or tablet), by aspect ratio rather than device. */
export const PORTRAIT_QUERY = '(orientation: portrait)'
