// The win screen after a game: who won, the final standings and the match stats we keep.
// Placements come from the final snapshot (the server ranks the same way); the per-player
// X01 stats (average, best checkout) and the legs come from the saved game, once it loads.
import type { AtcGame, GameDetail, Snapshot, X01Game } from './api'
import { atcPlayer, fmtAvg } from './playerStats.js'
import { atcRules, x01Rules } from './gameViews/meta.js'
import { teamsLabel } from './teams.js'
import { plural } from './fmt.js'

type X01Detail = Extract<GameDetail['detail'], { mode: 'x01' }>

/** One side of the result: a player, or a team in a team game. */
export type Competitor = {
  name: string
  /** A guest (no account): a dashed avatar. */
  guest: boolean
  /** The team's players; empty for a single player. */
  members: string[]
  seats: number[]
  placement: number
  /** The big number: legs won (X01) or targets done (Around the Clock). */
  score: number
  /** "2 legs · 80.8 avg" / "21 of 21 · 48 darts". */
  sub: string
  /** Standings cells, in `WinView.columns` order. */
  cells: string[]
}

export type WinLeg = { n: number; name: string; guest: boolean; byWinner: boolean; text: string }
export type StatRow = { label: string; values: [string, string]; share: number }

export type WinView = {
  mode: 'x01' | 'atc'
  layout: 'duel' | 'party'
  /** By placement: the winner first. */
  competitors: Competitor[]
  /** "Game shot", above the duel's score and the party's headline. */
  kicker: string
  /** Under the duel's score: "Legs · first to 3". */
  scoreLabel: string
  /** Under the party's headline. */
  note: string
  /** "Christoph checked out 75 with T17 · D12 to take leg 4 in 17 darts." */
  checkout: { name: string; left: number; darts: string; tail: string } | null
  /** Every leg of a match of more than one; empty otherwise. */
  legs: WinLeg[]
  /** The duel's side-by-side match stats. */
  stats: StatRow[]
  /** The standings table's columns (after rank and player). */
  columns: string[]
  /** Party highlights. */
  highlights: { name: string; guest: boolean; label: string; text: string }[]
}

const pair = (a: string, b: string): [string, string] => [a, b]
const dartName = (d: { segment?: { name?: string } }) => d.segment?.name || 'Miss'
const stat = (detail: GameDetail | null, seat: number, key: string): number | undefined => {
  const p = detail?.game.players.find(s => s.seat === seat)
  return p && Object.hasOwn(p.stats, key) ? p.stats[key] : undefined
}

/** The header's line: the rules, and "A vs B" for two. */
export function winMeta(snapshot: Snapshot): string {
  const n = snapshot.players.length
  const vs = n === 2 ? ` · ${snapshot.players[0].name} vs ${snapshot.players[1].name}` : ''
  if (snapshot.gameId === 'x01') {
    const g = snapshot.game
    const teams = g.teams ? teamsLabel(g.teams) : undefined
    return x01Rules({ ...g.config, firstTo: g.firstTo }, n, teams) + (teams ? '' : vs)
  }
  return atcRules(snapshot.game.cfg, n) + vs
}

/** The board everyone threw on; null when the seats used different boards (or none). */
export function sharedBoard(snapshot: Snapshot): string | null {
  const names = new Set(snapshot.seats.map(s => s.boardName))
  const [only] = names
  return names.size === 1 ? (only ?? null) : null
}

/** Places 1..n: the winner first, the rest by `better` (ties share a place). */
function rank(count: number, winner: number | null, better: (a: number, b: number) => number): number[] {
  const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => (a === winner ? -1 : b === winner ? 1 : better(a, b)))
  const places = new Array<number>(count)
  order.forEach((c, i) => {
    const prev = order[i - 1]
    places[c] = i > 0 && c !== winner && prev !== winner && better(prev, c) === 0 ? places[prev] : i + 1
  })
  return places
}

const byPlacement = (cs: Competitor[]) => [...cs].sort((a, b) => a.placement - b.placement)

export function x01Win(snapshot: Snapshot & { game: X01Game }, detail: GameDetail | null): WinView {
  const g = snapshot.game
  const seatsOf: number[][] = g.teams ? g.teams.map(t => t.seats) : snapshot.players.map((_, i) => [i])
  const sideOf = (seat: number) => seatsOf.findIndex(s => s.includes(seat))
  const winnerSide = g.winner === null ? null : sideOf(g.winner)
  // Every seat of a side carries its legs and score
  const legs = seatsOf.map(s => g.legs[s[0]] ?? 0)
  const left = seatsOf.map(s => g.scores[s[0]] ?? 0)
  // The saved game's placements once it loads (they know who forfeited); a side shares its best seat's
  const saved = detail?.game.players
  const ranked = rank(seatsOf.length, winnerSide, (a, b) => legs[b] - legs[a] || left[a] - left[b])
  const savedPlace = (seats: number[]) => {
    const found = seats.flatMap(i => saved?.find(p => p.seat === i)?.placement ?? [])
    return found.length ? Math.min(...found) : null
  }
  const places = seatsOf.map((s, i) => savedPlace(s) ?? ranked[i])

  const sum = (seats: number[], key: string) => seats.reduce((a, s) => a + (stat(detail, s, key) ?? 0), 0)
  const darts = seatsOf.map(s => s.reduce((a, i) => a + (g.totalDarts[i] ?? 0), 0))
  // A side's average over all its darts; unknown until the saved game loads
  const avg = seatsOf.map((s, i) => (detail && darts[i] > 0 ? (sum(s, 'pointsScored') / darts[i]) * 3 : null))
  const best = seatsOf.map(s => Math.max(0, ...s.map(i => stat(detail, i, 'bestCheckout') ?? 0)))

  const competitors = byPlacement(
    seatsOf.map((seats, i): Competitor => ({
      name: g.teams?.[i].name ?? snapshot.players[i].name,
      guest: !g.teams && snapshot.seats[i]?.userId === null,
      members: g.teams ? seats.map(s => snapshot.players[s].name) : [],
      seats,
      placement: places[i],
      score: legs[i],
      sub: [plural(legs[i], 'leg'), avg[i] === null ? null : `${fmtAvg(avg[i])} avg`].filter(Boolean).join(' · '),
      cells: [String(legs[i]), fmtAvg(avg[i]), String(darts[i])],
    })),
  )
  const order = competitors.map(c => seatsOf.findIndex(s => s === c.seats))
  const w = order[0]
  const r = order.at(1)

  const legList = detail?.detail.mode === 'x01' ? detail.detail.legs : []
  const sideDarts = (leg: X01Detail['legs'][number], seats: number[]) =>
    leg.visits.filter(v => seats.includes(v.seat)).reduce((a, v) => a + v.darts.length, 0)
  const legs_: WinLeg[] =
    legList.length < 2
      ? []
      : legList.map(leg => {
          if (leg.winner === null) return { n: leg.leg + 1, name: 'No winner', guest: false, byWinner: false, text: 'Cut short' }
          const side = sideOf(leg.winner)
          const finish = leg.visits.findLast(v => v.seat === leg.winner)
          return {
            n: leg.leg + 1,
            name: snapshot.players[leg.winner].name,
            guest: snapshot.seats[leg.winner]?.userId === null,
            byWinner: side === winnerSide,
            text: [plural(sideDarts(leg, seatsOf[side]), 'dart'), ...(finish?.darts.map(dartName) ?? [])].join(' · '),
          }
        })

  const last = legList.findLast(l => l.winner !== null)
  const finish = last && last.winner !== null ? last.visits.findLast(v => v.seat === last.winner) : undefined
  const checkout =
    last && last.winner !== null && finish && sideOf(last.winner) === winnerSide
      ? {
          name: snapshot.players[last.winner].name,
          left: finish.scored,
          darts: finish.darts.map(dartName).join(' · '),
          tail: `${legList.length > 1 ? `to take leg ${last.leg + 1}` : 'to win'} in ${plural(sideDarts(last, seatsOf[sideOf(last.winner)]), 'dart')}.`,
        }
      : null

  const share = (a: number, b: number) => (a + b > 0 ? a / (a + b) : 0.5)
  const [aw, ar] = r === undefined ? [null, null] : [avg[w], avg[r]]
  const stats: StatRow[] =
    r === undefined
      ? []
      : [
          ...(aw !== null && ar !== null ? [{ label: '3-dart average', values: pair(fmtAvg(aw), fmtAvg(ar)), share: share(aw, ar) }] : []),
          ...(detail
            ? [
                {
                  label: 'Highest finish',
                  values: pair(best[w] ? String(best[w]) : '—', best[r] ? String(best[r]) : '—'),
                  share: share(best[w], best[r]),
                },
              ]
            : []),
          { label: 'Darts thrown', values: pair(String(darts[w]), String(darts[r])), share: share(darts[w], darts[r]) },
        ]

  const top = competitors.reduce<{ c: Competitor; seat: number; v: number } | null>((acc, c) => {
    for (const seat of c.seats) {
      const v = stat(detail, seat, 'bestCheckout') ?? 0
      if (v > (acc?.v ?? 0)) acc = { c, seat, v }
    }
    return acc
  }, null)
  const played = legs.reduce((a, l) => a + l, 0)
  const second = competitors.at(1)

  return {
    mode: 'x01',
    layout: seatsOf.length > 2 ? 'party' : 'duel',
    competitors,
    kicker: seatsOf.length > 2 && played > 1 ? `Game shot · leg ${played}` : 'Game shot',
    scoreLabel: seatsOf.length === 1 ? plural(darts[0], 'dart') : `Legs · first to ${g.firstTo}`,
    note:
      g.firstTo > 1 && second
        ? `${plural(competitors[0].score, 'leg')} to ${second.name}'s ${second.score} · the rest ranked by legs, then by points left in the last leg`
        : 'The rest ranked by points left',
    checkout,
    legs: legs_,
    stats,
    columns: ['Legs', 'Avg', 'Darts'],
    highlights: top
      ? [
          {
            name: snapshot.players[top.seat].name,
            guest: snapshot.seats[top.seat]?.userId === null,
            label: 'Highest finish',
            text: `Checked out ${top.v}.`,
          },
        ]
      : [],
  }
}

export function atcWin(snapshot: Snapshot & { game: AtcGame }): WinView {
  const g = snapshot.game
  const views = snapshot.players.map((_, i) => atcPlayer(g, i))
  const places = rank(views.length, g.winner, (a, b) => views[b].done - views[a].done || views[a].darts - views[b].darts)
  const competitors = byPlacement(
    views.map((v, i): Competitor => ({
      name: snapshot.players[i].name,
      guest: snapshot.seats[i]?.userId === null,
      members: [],
      seats: [i],
      placement: places[i],
      score: v.done,
      sub: `${v.done} of ${v.total} · ${plural(v.darts, 'dart')}`,
      cells: [String(v.done), String(v.darts), v.hitRate],
    })),
  )
  const ranked = competitors.map(c => views[c.seats[0]])
  const w = ranked[0]
  const r = ranked.at(1)
  const share = (a: number, b: number) => (a + b > 0 ? a / (a + b) : 0.5)
  // Hits per dart, for the hit rate's bar
  const rate = (seat: number) => (g.totalDarts[seat] ? (g.hitCounts[seat] ?? 0) / g.totalDarts[seat] : 0)
  const [ws, rs] = competitors.map(c => c.seats[0])
  return {
    mode: 'atc',
    layout: views.length > 2 ? 'party' : 'duel',
    competitors,
    kicker: 'Game over',
    scoreLabel: views.length === 1 ? plural(w.darts, 'dart') : `Targets · of ${w.total}`,
    note: 'The rest ranked by targets done, then by fewest darts',
    checkout: null,
    legs: [],
    stats:
      r === undefined
        ? []
        : [
            { label: 'Targets done', values: pair(String(w.done), String(r.done)), share: share(w.done, r.done) },
            { label: 'Darts thrown', values: pair(String(w.darts), String(r.darts)), share: share(w.darts, r.darts) },
            { label: 'Hit rate', values: pair(w.hitRate, r.hitRate), share: share(rate(ws), rate(rs)) },
          ],
    columns: ['Targets', 'Darts', 'Hit rate'],
    highlights: [],
  }
}

/** The win screen once a won game has ended (not while its winning visit waits for Finish); null before, or when nobody won. */
export function winView(snapshot: Snapshot | null, detail: GameDetail | null): WinView | null {
  if (!snapshot || snapshot.status !== 'finished' || snapshot.game.winner === null) return null
  if (snapshot.gameId === 'x01') return x01Win(snapshot, detail?.detail.mode === 'x01' ? detail : null)
  return atcWin(snapshot)
}
