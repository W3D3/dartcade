import type { components } from '../schema/api.js'
import { isGameId, isUncounted, type GameId, type UncountedId } from '../shared/gameNames.js'

type ModeStats = components['schemas']['ProfileModeStats']
type Tile = ModeStats['tiles'][number]
type Raw = Omit<Tile, 'value'> & { value: number | null }

/** The user's seat in one finished game that counts (see `gameCounts`). */
export type SeatRow = { mode: string; placement: number; seats: number; stats: Record<string, number> }

const MAX_TILES = 6

const sum = (rows: SeatRow[], key: string) => rows.reduce((a, r) => a + (r.stats[key] ?? 0), 0)
const having = (rows: SeatRow[], key: string) => rows.filter(r => key in r.stats).map(r => r.stats[key])
const best = (rows: SeatRow[], key: string, pick: (...n: number[]) => number) => {
  const values = having(rows, key)
  return values.length ? pick(...values) : null
}
const ratio = (a: number, b: number) => (b > 0 ? a / b : null)

const int = (id: string, label: string, value: number | null): Raw => ({ id, label, value, format: 'int' })
const decimal = (id: string, label: string, value: number | null): Raw => ({ id, label, value, format: 'decimal' })
const percent = (id: string, label: string, value: number | null): Raw => ({ id, label, value, format: 'percent' })

/** Wins and win rate count contested games only: a solo run has no one to beat. */
function winTiles(rows: SeatRow[]): Raw[] {
  const contested = rows.filter(r => r.seats >= 2)
  if (contested.length === 0) return []
  const wins = contested.filter(r => r.placement === 1).length
  return [int('wins', 'Games won', wins), percent('winRate', 'Win rate', wins / contested.length)]
}

// A mode lists only what its seat stats really hold; a tile without a value is left out.
// One entry per mode, kept complete by the compiler. Practice modes never get here (`gameCounts` leaves them out).
const MODE_TILES: Record<Exclude<GameId, UncountedId>, (rows: SeatRow[]) => Raw[]> = {
  x01: rows => [
    ...winTiles(rows),
    decimal('average', '3-dart average', ratio(sum(rows, 'pointsScored') * 3, sum(rows, 'dartsThrown'))),
    int('count180', '180s', sum(rows, 'count180')),
    int('bestCheckout', 'Highest checkout', best(rows, 'bestCheckout', Math.max)),
    percent('checkoutRate', 'Checkout rate', ratio(sum(rows, 'checkoutHits'), sum(rows, 'checkoutAttempts'))),
  ],
  cricket: rows => [
    ...winTiles(rows),
    decimal('mpr', 'Marks per round', ratio(sum(rows, 'marksScored') * 3, sum(rows, 'dartsThrown'))),
    decimal('bestMpr', 'Best marks per round', best(rows, 'mpr', Math.max)),
  ],
  atc: rows => [
    ...winTiles(rows),
    int('completed', 'Completed runs', having(rows, 'dartsToFinish').length),
    int('fewestDarts', 'Fewest darts to finish', best(rows, 'dartsToFinish', Math.min)),
    decimal('dartsPerNumber', 'Darts per number', ratio(sum(rows, 'dartsThrown'), sum(rows, 'targetsHit'))),
  ],
  p121: rows => [
    int('highestMade', 'Highest checkout', best(rows, 'highestMade', Math.max)),
    percent('successRate', 'Checkout success rate', ratio(sum(rows, 'checkouts'), sum(rows, 'tries'))),
    int('bestRun', 'Best run', best(rows, 'bestRun', Math.max)),
  ],
  hilo: rows => [
    ...winTiles(rows),
    int('mostVisits', 'Longest game (visits)', best(rows, 'visits', Math.max)),
    int('highestSet', 'Highest set', best(rows, 'highestSet', Math.max)),
    int('livesLost', 'Lives lost', sum(rows, 'livesLostBetween') + sum(rows, 'livesLostMiss')),
  ],
  minigolf: rows => [
    ...winTiles(rows),
    int('holesInOne', 'Holes in one', sum(rows, 'holesInOne')),
    int('bestToPar', 'Best score vs par', best(rows, 'toPar', Math.min)),
  ],
  catch40: rows => [
    int('bestTotal', 'Best total (of 120)', best(rows, 'total', Math.max)),
    decimal('averageTotal', 'Average total', ratio(sum(rows, 'total'), having(rows, 'total').length)),
    int('checkouts', 'Checkouts', sum(rows, 'checkouts')),
  ],
  shanghai: rows => [
    ...winTiles(rows),
    int('bestScore', 'Best score', best(rows, 'total', Math.max)),
    int('shanghais', 'Shanghais', sum(rows, 'shanghais')),
  ],
}

// A mode id from the database that this build doesn't know (an old or removed game) shows wins only
const tilesOf = (mode: string, rows: SeatRow[]): Raw[] => (isGameId(mode) && !isUncounted(mode) ? MODE_TILES[mode](rows) : winTiles(rows))

const byMode = (rows: SeatRow[]) => {
  const modes = new Map<string, SeatRow[]>()
  for (const r of rows) modes.set(r.mode, [...(modes.get(r.mode) ?? []), r])
  return modes
}

/** One block per mode the player has finished a counting game in, the most played first. */
export function profileModeStats(rows: SeatRow[]): ModeStats[] {
  return [...byMode(rows)]
    .map(([mode, seats]) => ({
      mode,
      games: seats.length,
      tiles: tilesOf(mode, seats)
        .filter((t): t is Tile => t.value !== null)
        .slice(0, MAX_TILES),
    }))
    .sort((a, b) => b.games - a.games || a.mode.localeCompare(b.mode))
}
