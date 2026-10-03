export type MatchLayout = 'phone' | 'solo' | 'duel' | 'party' | 'teams'

/** How the match screen lays out its players: one phone layout, the team panels, or by player count. */
export function matchLayout(playerCount: number, phone: boolean, teams = false): MatchLayout {
  if (phone) return 'phone'
  if (teams) return 'teams'
  return playerCount === 1 ? 'solo' : playerCount === 2 ? 'duel' : 'party'
}
