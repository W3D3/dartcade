// The minigolf scorecard (Minigolf-Scorecard.dc.html): holes × players with par, totals and the
// score to par, and when the match screen shows it between holes.
import { fmtToPar } from './match.js'

export type ScoreCell = { text: string; tone: 'under' | 'par' | 'over' | 'none'; ace: boolean }
export type ScoreRow = { seat: number; name: string; cells: ScoreCell[]; total: number; toPar: string }

/** One row per player, best total first (ties keep seat order); holes not played yet show "·". */
export function scorecardRows(scores: (number | null)[][], pars: number[], players: { name: string }[]): ScoreRow[] {
  const rows = players.map((p, seat): ScoreRow => {
    let total = 0
    let par = 0
    const cells = pars.map((holePar, h): ScoreCell => {
      const v = scores[h]?.[seat] ?? null
      if (v === null) return { text: '·', tone: 'none', ace: false }
      total += v
      par += holePar
      return { text: String(v), tone: v < holePar ? 'under' : v > holePar ? 'over' : 'par', ace: v === 1 }
    })
    return { seat, name: p.name, cells, total, toPar: fmtToPar(total - par) }
  })
  return rows.sort((a, b) => a.total - b.total || a.seat - b.seat)
}

/**
 * Whether the scorecard opens: the game moved on to a new hole since the last snapshot (not on
 * the first one this page sees, so a reload doesn't bring it back).
 */
export function holeJustFinished(prevHoleIdx: number | null, holeIdx: number): boolean {
  return prevHoleIdx !== null && holeIdx > prevHoleIdx
}

/** "Lena tees off first: best score on the last hole." (just "… first." when it's still the seat order). */
export function teeOffLine(name: string, byScore: boolean): string {
  return byScore ? `${name} tees off first: best score on the last hole.` : `${name} tees off first.`
}

/** The colour of each seat's paths on the finished hole. */
export const SEAT_COLOURS = ['#c6f24e', '#4ec6f2', '#f2a54e', '#e46bd8', '#efeee6', '#8f7cf2']
