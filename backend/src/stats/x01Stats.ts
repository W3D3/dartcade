// The Stats page's X01 numbers (Stats.dc.html): a range of the player's legs, compared with the
// same range before it. Pure: legs in (x01Legs.ts), the API's X01Stats sections out.
import type { components } from '../schema/api.js'
import { canCheckOut } from '../shared/checkout.js'
import { groupBy } from '../util/groupBy.js'
import type { StatLeg, StatVisit } from './x01Legs.js'
import { DAY_MS } from '../shared/time.js'
import { MAX_VISIT, visitTier, type VisitTier } from '../shared/darts.js'

type Schemas = components['schemas']
type X01Stats = Schemas['X01Stats']
type StatRef = Schemas['StatRef']
type StatBest = Schemas['StatBest']
type StatMetric = Schemas['StatMetric']
type StatCount = Schemas['StatCount']
export type StatsRange = Schemas['StatsRange']

const RANGES: Record<StatsRange, { legs: number } | { days: number } | null> = {
  legs20: { legs: 20 },
  legs50: { legs: 50 },
  legs100: { legs: 100 },
  days30: { days: 30 },
  days90: { days: 90 },
  all: null,
}
const TREND_LEGS = 10
const SPARK_POINTS = 50
const CHART_LEGS = 100
const BY_VISIT = 7
const BUCKETS: [number, number, string][] = [
  [0, 19, '0–19'],
  [20, 39, '20–39'],
  [40, 59, '40–59'],
  [60, 79, '60–79'],
  [80, 99, '80–99'],
  [100, 139, '100–139'],
  [140, 179, '140–179'],
  [180, 180, '180'],
]

/** The range's legs and the same range before them; `legs` newest first, both returned that way.
 *  `before` is null for all time. */
export function pickWindow(legs: StatLeg[], range: StatsRange, now: Date): { current: StatLeg[]; before: StatLeg[] | null } {
  const r = RANGES[range]
  if (r === null) return { current: legs, before: null }
  if ('legs' in r) return { current: legs.slice(0, r.legs), before: legs.slice(r.legs, 2 * r.legs) }
  const start = now.getTime() - r.days * DAY_MS
  const at = (l: StatLeg) => l.game.finishedAt.getTime()
  return { current: legs.filter(l => at(l) >= start), before: legs.filter(l => at(l) < start && at(l) >= start - r.days * DAY_MS) }
}

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0)
const ratio = (num: number, den: number) => (den > 0 ? num / den : null)
const visitsOf = (legs: StatLeg[]) => legs.flatMap(l => l.visits)
const dartsIn = (vs: StatVisit[]) => sum(vs.map(v => v.darts.length))
const threeDart = (vs: StatVisit[]) => {
  const r = ratio(sum(vs.map(v => v.scored)), dartsIn(vs))
  return r === null ? null : r * 3
}
const attempts = (vs: StatVisit[]) => vs.flatMap(v => v.darts).filter(d => d.target !== null).length
/** Visits not started on a finish: the scoring the buckets, under 40 and common scores count. */
const scoringVisits = (legs: StatLeg[]) =>
  legs.flatMap(l => l.visits.filter(v => v.darts.length > 0 && !canCheckOut(v.start, l.game.outMode)))

// Each measure over a set of legs; the KPIs, their sparks and the comparison all use these
const average = (legs: StatLeg[]) => threeDart(visitsOf(legs))
const first9 = (legs: StatLeg[]) => threeDart(legs.flatMap(l => l.visits.slice(0, 3)))
const dartsPerLeg = (legs: StatLeg[]) => {
  const won = legs.filter(l => l.won)
  return ratio(sum(won.map(l => dartsIn(l.visits))), won.length)
}
const checkoutRate = (legs: StatLeg[]) => ratio(visitsOf(legs).filter(v => v.checkout).length, attempts(visitsOf(legs)))
const winRate = (legs: StatLeg[]) => ratio(legs.filter(l => l.won).length, legs.length)
const until170 = (legs: StatLeg[]) => threeDart(visitsOf(legs).filter(v => v.start > 170))
const dartsAtDouble = (legs: StatLeg[]) => {
  const won = legs.filter(l => l.won)
  return ratio(attempts(visitsOf(won)), won.length)
}

/** The measure over each leg's last ten, oldest first: a trend line. */
function trend(legs: StatLeg[], measure: (legs: StatLeg[]) => number | null): (number | null)[] {
  return legs.map((_, i) => measure(legs.slice(Math.max(0, i - TREND_LEGS + 1), i + 1)))
}

function metric(oldestFirst: StatLeg[], before: StatLeg[] | null, measure: (legs: StatLeg[]) => number | null): StatMetric {
  const line = trend(oldestFirst, measure).filter(v => v !== null)
  const step = Math.max(1, line.length / SPARK_POINTS)
  const spark = line.length <= SPARK_POINTS ? line : Array.from({ length: SPARK_POINTS }, (_, i) => line[Math.round(i * step)])
  return { value: measure(oldestFirst), before: before && measure(before), spark }
}

const count = (legs: StatLeg[], before: StatLeg[] | null, of: (legs: StatLeg[]) => number): StatCount => ({
  value: of(legs),
  before: before && of(before),
})

const refOf = (l: StatLeg, visit: number | null, wholeMatch = false): StatRef => ({
  gameId: l.game.id,
  finishedAt: l.game.finishedAt.toISOString(),
  leg: wholeMatch ? null : l.leg,
  visit,
  startScore: l.game.startScore,
  kind: l.game.kind,
  opponents: l.game.opponents,
})

/** The first item with the best `score` under `better`; null when none has one. */
function bestBy<T>(
  items: T[],
  score: (t: T) => number | null,
  better: (a: number, b: number) => boolean,
): { item: T; value: number } | null {
  let best: { item: T; value: number } | null = null
  for (const item of items) {
    const value = score(item)
    if (value !== null && (best === null || better(value, best.value))) best = { item, value }
  }
  return best
}

/** The share of the visits that scored from `from` to `to`; 0 without visits. */
const shareOf = (vs: StatVisit[], from: number, to: number) =>
  ratio(vs.filter(v => v.scored >= from && v.scored <= to).length, vs.length) ?? 0

/** The most legs won in a row. */
function longestRun(oldestFirst: StatLeg[]): number {
  let run = 0
  let best = 0
  for (const l of oldestFirst) {
    run = l.won ? run + 1 : 0
    best = Math.max(best, run)
  }
  return best
}

function checkouts(legs: StatLeg[]): { leg: StatLeg; visit: StatVisit; n: number }[] {
  return legs.flatMap(leg => leg.visits.flatMap((visit, i) => (visit.checkout ? [{ leg, visit, n: i + 1 }] : [])))
}

const best = (leg: StatLeg, value: number, visit: number | null = null, darts?: string[]): StatBest => ({
  value,
  ref: refOf(leg, visit),
  ...(darts && { darts }),
})

function bests(legs: StatLeg[]): X01Stats['overview']['bests'] {
  const won = legs.filter(l => l.won)
  const fewest = bestBy(
    won,
    l => dartsIn(l.visits),
    (a, b) => a < b,
  )
  const legAvg = bestBy(
    won,
    l => average([l]),
    (a, b) => a > b,
  )
  const games = [...groupBy(legs, l => l.game.id).values()]
  const matchAvg = bestBy(games, average, (a, b) => a > b)
  const tons = bestBy(
    games,
    g => visitsOf(g).filter(v => visitTier(v.scored) === 'max').length || null,
    (a, b) => a > b,
  )
  const high = bestBy(
    checkouts(legs),
    c => c.visit.start,
    (a, b) => a > b,
  )
  return {
    bestLeg: fewest && best(fewest.item, fewest.value),
    bestLegAverage: legAvg && best(legAvg.item, legAvg.value),
    bestMatchAverage: matchAvg && { value: matchAvg.value, ref: refOf(matchAvg.item[0], null, true) },
    highestCheckout:
      high &&
      best(
        high.item.leg,
        high.value,
        high.item.n,
        high.item.visit.darts.map(d => d.name),
      ),
    most180s: tons && { value: tons.value, ref: refOf(tons.item[0], null, true) },
  }
}

function overview(legs: StatLeg[], oldestFirst: StatLeg[], before: StatLeg[] | null): X01Stats['overview'] {
  const chart = oldestFirst.slice(-CHART_LEGS)
  const trendLine = trend(oldestFirst, average).slice(-CHART_LEGS)
  return {
    average: metric(oldestFirst, before, average),
    first9: metric(oldestFirst, before, first9),
    dartsPerLeg: metric(oldestFirst, before, dartsPerLeg),
    checkout: metric(oldestFirst, before, checkoutRate),
    legsWon: metric(oldestFirst, before, winRate),
    bestStreak: longestRun(oldestFirst),
    perLeg: chart.map((l, i) => ({ average: average([l]), trend: trendLine[i], won: l.won, darts: dartsIn(l.visits) })),
    bests: bests(legs),
  }
}

function scoring(legs: StatLeg[], oldestFirst: StatLeg[], before: StatLeg[] | null): X01Stats['scoring'] {
  const now = scoringVisits(legs)
  const then = before && scoringVisits(before)
  const thrown = (ls: StatLeg[]) => visitsOf(ls).filter(v => v.darts.length > 0)
  const inTier =
    (...tiers: VisitTier[]) =>
    (ls: StatLeg[]) =>
      thrown(ls).filter(v => tiers.some(t => t === visitTier(v.scored))).length
  const byScore = [...groupBy(now, v => v.scored)].map(([score, vs]) => ({ score, visits: vs.length }))
  const twenties = visitsOf(legs)
    .flatMap(v => v.darts)
    .filter(d => d.left > 170 && d.multiplier > 0 && [20, 1, 5].includes(d.number))
  const beds = [...groupBy(twenties, d => d.name)].map(([name, ds]) => ({ name, share: ds.length / twenties.length }))
  return {
    visits: thrown(legs).length,
    until170: metric(oldestFirst, before, until170),
    count180: count(legs, before, inTier('max')),
    count140: count(legs, before, inTier('140')),
    count100: count(legs, before, inTier('max', '140', 'ton')),
    share100: { value: shareOf(thrown(legs), 100, MAX_VISIT), before: before && shareOf(thrown(before), 100, MAX_VISIT) },
    under40: { value: shareOf(now, 0, 39), before: then && shareOf(then, 0, 39) },
    buckets: BUCKETS.map(([from, to, label]) => ({ label, now: shareOf(now, from, to), before: then && shareOf(then, from, to) })),
    byVisit: Array.from({ length: BY_VISIT }, (_, i) => {
      const nth = (ls: StatLeg[]) => {
        const vs = ls.flatMap(l => l.visits.slice(i, i + 1))
        return ratio(sum(vs.map(v => v.scored)), vs.length)
      }
      return { visit: i + 1, now: nth(legs), before: before && nth(before) }
    }),
    common: byScore.sort((a, b) => b.visits - a.visits || b.score - a.score).slice(0, 8),
    twenties: { darts: twenties.length, beds: beds.sort((a, b) => b.share - a.share).slice(0, 4) },
    list180: legs.flatMap(l => l.visits.flatMap((v, i) => (visitTier(v.scored) === 'max' ? [refOf(l, i + 1)] : []))),
  }
}

function checkout(legs: StatLeg[], oldestFirst: StatLeg[], before: StatLeg[] | null): X01Stats['checkout'] {
  const outMode = legs[0]?.game.outMode ?? 'double'
  const top = outMode === 'double' ? 170 : 180
  const ranges: [number, number][] = [
    [2, 40],
    [41, 60],
    [61, 80],
    [81, 100],
    [101, 120],
    [121, top],
  ]
  const onFinish = legs.flatMap(l => l.visits.filter(v => v.darts.length > 0 && canCheckOut(v.start, l.game.outMode)))
  const doubles = new Map<string, { hits: number; attempts: number }>()
  for (const v of visitsOf(legs))
    v.darts.forEach((d, i) => {
      if (d.target === null) return
      const t = doubles.get(d.target) ?? { hits: 0, attempts: 0 }
      doubles.set(d.target, { hits: t.hits + (v.checkout && i === v.darts.length - 1 ? 1 : 0), attempts: t.attempts + 1 })
    })
  return {
    tonPlus: count(legs, before, ls => checkouts(ls).filter(c => c.visit.start >= 100).length),
    dartsAtDouble: metric(oldestFirst, before, dartsAtDouble),
    busts: count(legs, before, ls => visitsOf(ls).filter(v => v.bust).length),
    doubles: [...doubles].map(([target, t]) => ({ target, ...t })).sort((a, b) => b.attempts - a.attempts),
    ranges: ranges.map(([from, to]) => {
      const vs = onFinish.filter(v => v.start >= from && v.start <= to)
      return { label: `${from}–${to}`, rate: ratio(vs.filter(v => v.checkout).length, vs.length), visits: vs.length }
    }),
    top: checkouts(legs)
      .sort((a, b) => b.visit.start - a.visit.start)
      .slice(0, 5)
      .map(c =>
        best(
          c.leg,
          c.visit.start,
          c.n,
          c.visit.darts.map(d => d.name),
        ),
      ),
  }
}

const span = (legs: StatLeg[]): Schemas['StatsSpan'] => ({
  legs: legs.length,
  from: legs.at(-1)?.game.finishedAt.toISOString() ?? null,
  to: legs[0]?.game.finishedAt.toISOString() ?? null,
})

/** The sections for `current` (newest first), compared with `before` (null: no comparison). */
function x01Stats(current: StatLeg[], before: StatLeg[] | null): Pick<X01Stats, 'window' | 'before' | 'overview' | 'scoring' | 'checkout'> {
  const compare = before && before.length > 0 ? before : null
  const oldestFirst = [...current].reverse()
  return {
    window: span(current),
    before: compare && span(compare),
    overview: overview(current, oldestFirst, compare),
    scoring: scoring(current, oldestFirst, compare),
    checkout: checkout(current, oldestFirst, compare),
  }
}

/** The games a range needs, newest first, for the range and the one before it: at most twice its
 *  legs (every game has a leg at least), or those of twice its days; all of them for all time. */
export function gamesFor(range: StatsRange, now: Date): { since?: Date; limit?: number } {
  const r = RANGES[range]
  if (r === null) return {}
  return 'legs' in r ? { limit: 2 * r.legs } : { since: new Date(now.getTime() - 2 * r.days * DAY_MS) }
}

/** The page's sections for the player's legs (newest first) over `range`, compared with the range before. */
export function x01Report(
  legs: StatLeg[],
  range: StatsRange,
  now: Date,
): Pick<X01Stats, 'window' | 'before' | 'overview' | 'scoring' | 'checkout'> {
  const { current, before } = pickWindow(legs, range, now)
  return x01Stats(current, before)
}
