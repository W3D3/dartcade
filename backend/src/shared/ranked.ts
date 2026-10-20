// Ranked play: ratings (Elo, in RP) and the ranks they map to. Shared by the backend, which moves
// ratings after ranked games, and the frontend, which shows ranks, stakes and progress.
// Design: docs/superpowers/specs/2026-10-14-matchmaking-design.md

/** Solo 1v1 and duo 2v2 are rated separately. */
export type RankedMode = '1v1' | '2v2'
export const RANKED_MODES: readonly RankedMode[] = ['1v1', '2v2']

/** Where you start without an X01 average to go on. */
export const START_RATING = 1200
/**
 * The first matches in a mode place you: your rating stays hidden, moves twice as fast, and counts
 * how well you threw as well as whether you won.
 */
export const PLACEMENT_MATCHES = 5
/** In a placement match, the share of the score that is the result; the rest is your average against theirs. */
export const PLACEMENT_RESULT_WEIGHT = 0.7
/**
 * The ranked time limit: seconds for each visit, then a reserve per player (per team in 2v2) that
 * a visit running over eats into; an empty reserve forfeits. These are the defaults of the flags
 * matchmaking.visitSeconds and matchmaking.reserveSeconds, which a deployment can change.
 */
export const VISIT_SECONDS = 60
export const RESERVE_SECONDS = 180
/** RP below a stage you have to fall before you drop out of it. */
export const DEMOTION_BUFFER = 25

const K = 32
const K_PLACEMENT = 64

export const TIERS = ['Wood', 'Bronze', 'Silver', 'Gold', 'Diamond', 'Elite'] as const
export type Tier = (typeof TIERS)[number]
export const STAGES_PER_TIER = 5
const STAGE_NAMES = ['I', 'II', 'III', 'IV', 'V'] as const
export const RANK_COUNT = TIERS.length * STAGES_PER_TIER

/** Wood I is where you start from 0; every stage after it is 50 RP up, from Wood II at 600 to Elite V at 2 000. */
export function rankThreshold(index: number): number {
  return index === 0 ? 0 : 550 + 50 * index
}

export type Rank = {
  /** 0 (Wood I) to 29 (Elite V). */
  index: number
  tier: Tier
  /** 1 (I) to 5 (V). */
  stage: number
  /** 'Silver V' */
  name: string
  /** 'V' */
  numeral: string
  /** The RP this stage starts at. */
  min: number
}

export function rank(index: number): Rank {
  const i = Math.max(0, Math.min(RANK_COUNT - 1, Math.trunc(index)))
  const tier = TIERS[Math.floor(i / STAGES_PER_TIER)]
  const stage = (i % STAGES_PER_TIER) + 1
  const numeral = STAGE_NAMES[stage - 1]
  return { index: i, tier, stage, name: `${tier} ${numeral}`, numeral, min: rankThreshold(i) }
}

/** The highest stage this rating has reached, with no demotion buffer. */
export function rankIndexFor(rating: number): number {
  let i = 0
  while (i + 1 < RANK_COUNT && rating >= rankThreshold(i + 1)) i++
  return i
}

/**
 * The rank after a rating change. You promote the moment you reach a stage, but only drop once you
 * are DEMOTION_BUFFER below the stage you hold, so one loss never demotes you on the spot.
 * `held` is null while you are still placing: the rating alone decides.
 */
export function nextRankIndex(held: number | null, rating: number): number {
  const reached = rankIndexFor(rating)
  if (held === null || reached >= held) return reached
  return rating < rankThreshold(held) - DEMOTION_BUFFER ? reached : held
}

/** The next stage up and the RP still missing to it; null at Elite V. */
export function nextStage(index: number, rating: number): { rank: Rank; missing: number } | null {
  if (index + 1 >= RANK_COUNT) return null
  const next = rank(index + 1)
  return { rank: next, missing: Math.max(0, next.min - rating) }
}

/** The chance Elo gives a side rated `rating` to beat one rated `opponent`. */
export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400))
}

/**
 * The RP a ranked side gains for a win and loses for a loss against `opponent` (both positive).
 * A duo plays as one side rated on the average of its two ratings; both players move by the same RP.
 */
export function stakes(rating: number, opponent: number): { win: number; loss: number } {
  const e = expectedScore(rating, opponent)
  return { win: Math.max(1, Math.round(K * (1 - e))), loss: Math.max(1, Math.round(K * e)) }
}

/**
 * The hidden rating a new player starts from, read off their 3-dart average in X01: each tier is
 * about 15 average points wide (Bronze from 30, Silver from 45, Gold from 60 …), so a point of
 * average is 50/3 RP. Kept between Wood II and Elite I; no average starts at START_RATING.
 */
export function seedRating(average: number | null): number {
  if (average === null || !Number.isFinite(average) || average <= 0) return START_RATING
  return Math.max(600, Math.min(1800, Math.round(800 + ((average - 30) * 50) / 3)))
}

/** How a side threw against the other in a match, 0 to 1: even averages 0.5, 20 points better 1. */
export function performance(average: number, opponent: number): number {
  return Math.max(0, Math.min(1, 0.5 + (average - opponent) / 40))
}

/**
 * The RP a game moves a player by. Once ranked, only the result counts (the stakes). While
 * placing, the score is PLACEMENT_RESULT_WEIGHT the result and the rest `performance` (the result
 * alone when an average is missing); a win never costs RP and a loss never gains any.
 */
export function ratingChange(g: { rating: number; opponent: number; won: boolean; placing: boolean; performance: number | null }): number {
  if (!g.placing) {
    const s = stakes(g.rating, g.opponent)
    return g.won ? s.win : -s.loss
  }
  const result = g.won ? 1 : 0
  const score = PLACEMENT_RESULT_WEIGHT * result + (1 - PLACEMENT_RESULT_WEIGHT) * (g.performance ?? result)
  const delta = Math.round(K_PLACEMENT * (score - expectedScore(g.rating, g.opponent)))
  return g.won ? Math.max(1, delta) : Math.min(-1, delta)
}

/** The rating of a side: one player's, or a duo's average. */
export function sideRating(ratings: readonly number[]): number {
  return Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)
}

/** What a player's rating row holds (db ranked_ratings). */
export type RatingState = { rating: number; rankIndex: number | null; matches: number; wins: number; streak: number }

export type RatedSide = { won: boolean; players: { userId: string; average: number | null }[] }

export type PlayerRating = {
  userId: string
  won: boolean
  /** One of the player's placement matches. */
  placement: boolean
  average: number | null
  before: RatingState
  after: RatingState
}

/** A player's state after a game that moved their rating by `change`. */
export function applyResult(before: RatingState, won: boolean, change: number): RatingState {
  const rating = Math.max(0, before.rating + change)
  const matches = before.matches + 1
  return {
    rating,
    rankIndex: matches < PLACEMENT_MATCHES ? null : nextRankIndex(before.rankIndex, rating),
    matches,
    wins: before.wins + (won ? 1 : 0),
    streak: won ? Math.max(0, before.streak) + 1 : Math.min(0, before.streak) - 1,
  }
}

/**
 * What one finished ranked game does to each player: the live path and the replay that follows a
 * deleted game both rate games with this. `states` holds every player's rating before the game.
 * Each side is rated on its players' average rating; a ranked player gains or loses the side's
 * stakes, one still placing moves by their placement score (`ratingChange`).
 */
export function rateGame(states: ReadonlyMap<string, RatingState>, sides: readonly [RatedSide, RatedSide]): PlayerRating[] {
  const state = (userId: string): RatingState => {
    const s = states.get(userId)
    if (!s) throw new Error(`no rating for ${userId}`)
    return s
  }
  const ratingOf = (s: RatedSide) => sideRating(s.players.map(p => state(p.userId).rating))
  const averageOf = (s: RatedSide) => {
    const all = s.players.map(p => p.average)
    return all.every(a => a !== null) ? all.reduce((a, b) => a + b, 0) / all.length : null
  }
  return sides.flatMap((side, i) => {
    const other = sides[1 - i]
    const own = ratingOf(side)
    const opp = ratingOf(other)
    const ownAvg = averageOf(side)
    const oppAvg = averageOf(other)
    const perf = ownAvg !== null && oppAvg !== null ? performance(ownAvg, oppAvg) : null
    return side.players.map(p => {
      const before = state(p.userId)
      const placing = before.matches < PLACEMENT_MATCHES
      const change = ratingChange({ rating: own, opponent: opp, won: side.won, placing, performance: perf })
      const after = applyResult(before, side.won, change)
      return { userId: p.userId, won: side.won, placement: placing, average: p.average, before, after }
    })
  })
}
