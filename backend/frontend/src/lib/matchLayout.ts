export type MatchLayout = 'phone' | 'solo' | 'duel' | 'party'

/** How the match screen lays out its players: one phone layout, or by player count. */
export function matchLayout(playerCount: number, phone: boolean): MatchLayout {
  if (phone) return 'phone'
  return playerCount === 1 ? 'solo' : playerCount === 2 ? 'duel' : 'party'
}
