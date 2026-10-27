import type { Snapshot } from '../ws.js'
import { winView } from '../winScreen.js'

/** The winner and placings of a finished game: its win view's ranking, else the players as they sit (121, minigolf without a winner). */
export function placings(snapshot: Snapshot): { name: string; placement: number }[] {
  const ranked = winView(snapshot, null)?.competitors.map(c => ({ name: c.name, placement: c.placement })) ?? []
  return ranked.length ? ranked : snapshot.players.map((p, i) => ({ name: p.name, placement: i + 1 }))
}
