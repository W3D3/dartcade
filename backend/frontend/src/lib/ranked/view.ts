import { THEME } from '$lib/theme'
// What the Matchmaking and Ranks pages show for a ranked profile (MM-Home, MM-Ranks boards).
// The rank maths lives in $shared/ranked, shared with the server.
import type { components } from '$lib/api/schema'
import { PLACEMENT_MATCHES, RANK_COUNT, TIERS, nextStage, rank, rankThreshold, type Rank, type Tier } from '$shared/ranked.js'
import { MONTHS, calendarDaysAgo, pad2, weekday } from '$lib/fmt'

export type RankedRating = components['schemas']['RankedRating']
export type RankedGame = components['schemas']['RankedGame']

/** "1 284": RP with a thin space every three digits, as the design writes them. */
export function fmtRp(n: number): string {
  const s = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return n < 0 ? `−${s}` : s
}

/** "+17", "−12", "±0". */
export function signedRp(n: number): string {
  return n > 0 ? `+${fmtRp(n)}` : n < 0 ? fmtRp(n) : '±0'
}

/** A time limit as the page says it: '60 s', '90 s', '3 min'. */
export function fmtSeconds(s: number): string {
  return s > 60 && s % 60 === 0 ? `${s / 60} min` : `${s} s`
}

/** Each tier's colour for text, a lighter shade than the insignia's (MM-Ranks board). */
export const TIER_TEXT: Record<Tier, string> = {
  Wood: '#c99a6b',
  Bronze: '#e0a06a',
  Silver: '#cfd5dd',
  Gold: '#f2c94c',
  Diamond: '#7fd6f5',
  Elite: THEME.accent,
}

/** The tint a tier's column fades in from at the top (MM-Ranks board). */
export const TIER_TINT: Record<Tier, string> = {
  Wood: '#8a5a32',
  Bronze: '#a8652f',
  Silver: '#9aa3af',
  Gold: '#d39b1c',
  Diamond: '#36a9dc',
  Elite: '#9dc63a',
}

/** Each tier's colour, from the Rank insignia board. */
export const TIER_COLOR: Record<Tier, string> = {
  Wood: '#b88660',
  Bronze: '#d48d52',
  Silver: '#c9d0d8',
  Gold: '#eac24f',
  Diamond: '#74d2f2',
  Elite: THEME.accent,
}

/** Where a rating stands between its stage and the next (the Ranks page's progress bar). */
export type ProgressBar = { percent: number; from: string; missing: string; next: Rank }

export function progressBar(rankIndex: number, rating: number): ProgressBar | null {
  const next = nextStage(rankIndex, rating)
  if (!next) return null
  const from = rankThreshold(rankIndex)
  const percent = Math.floor(Math.min(1, Math.max(0, (rating - from) / (next.rank.min - from))) * 100)
  return { percent, from: fmtRp(from), missing: `${fmtRp(next.missing)} RP`, next: next.rank }
}

export type RatingCardView = {
  label: string
  /** '1 284', or '2 / 5' (matches played) while the rating is hidden. */
  rating: string
  /** 'RP', or 'placed' while placing. */
  unit: string
  /** null while placing. */
  rank: Rank | null
  /** 'Silver V' or 'Placement'. */
  title: string
  /** '· 16 to Gold I', '· rank shown after 5', '· top rank'. */
  progress: string
  /** The way to the next stage; null while placing and at the top. */
  bar: ProgressBar | null
  /** '+46 in the last 30 days'. */
  trend: string
  /** The phone's shorter trend: '+46 in 30 days'. */
  trendShort: string
  trendUp: boolean
}

export function ratingCard(r: RankedRating): RatingCardView {
  const label = `Rating · ${r.mode}`
  // The rating stays hidden while placing (the server sends none)
  if (r.rankIndex === null || r.rating === null) {
    return {
      label,
      rating: `${r.matches}\u2009/\u2009${PLACEMENT_MATCHES}`,
      unit: 'placed',
      rank: null,
      title: 'Placement',
      progress: `· rank shown after ${PLACEMENT_MATCHES}`,
      bar: null,
      trend: r.matches === 0 ? 'Your first matches place you' : 'Your rating stays hidden until then',
      trendShort: r.matches === 0 ? 'Not placed yet' : 'Rating hidden',
      trendUp: false,
    }
  }
  const trend = `${signedRp(r.change30d)} in the last 30 days`
  const trendShort = `${signedRp(r.change30d)} in 30 days`
  const base = { label, rating: fmtRp(r.rating), unit: 'RP', trend, trendShort, trendUp: r.change30d > 0 }
  const held = rank(r.rankIndex)
  const next = nextStage(r.rankIndex, r.rating)
  return {
    ...base,
    rank: held,
    title: held.name,
    progress: next ? `· ${next.missing} to ${next.rank.name}` : '· top rank',
    bar: progressBar(r.rankIndex, r.rating),
  }
}

/** Both modes together: "23–17" and "57% won · 3 wins in a row" ("57% won" on phones). */
export function record(ratings: RankedRating[]): { score: string; line: string; short: string } {
  const wins = ratings.reduce((a, r) => a + r.wins, 0)
  const played = ratings.reduce((a, r) => a + r.matches, 0)
  if (played === 0) return { score: '0–0', line: 'No ranked matches yet', short: 'None yet' }
  const pct = Math.floor((wins / played) * 100)
  // The streak of the mode played last isn't known here; the longer one is the one worth showing
  const streak = ratings.reduce((a, r) => (Math.abs(r.streak) > Math.abs(a) ? r.streak : a), 0)
  const run = streak >= 2 ? ` · ${streak} wins in a row` : streak <= -2 ? ` · ${-streak} losses in a row` : ''
  return { score: `${wins}–${played - wins}`, line: `${pct}% won${run}`, short: `${pct}% won` }
}

/** "Today, 20:14", "Yesterday", "Mon", "3 Oct". */
export function whenPlayed(at: Date, now: Date): string {
  const days = calendarDaysAgo(at, now)
  if (days <= 0) return `Today, ${pad2(at.getHours())}:${pad2(at.getMinutes())}`
  if (days === 1) return 'Yesterday'
  if (days < 7) return weekday(at)
  return `${at.getDate()} ${MONTHS[at.getMonth()]}`
}

/** `change` is 'Placement' for a placement match, whose RP stay hidden. */
export type RecentRow = {
  key: string
  won: boolean
  name: string
  meta: string
  change: string
  placement: boolean
  /** The one opponent's avatar in 1v1; null for 2v2 (no single face to show). */
  opponent: { userId: string; avatar: RankedGame['opponents'][number]['avatar'] } | null
  /** Legs, yours first: '2–1'; null when the game did not record them. */
  score: string | null
  /** The 1v1 opponent's rank going into the game; null in 2v2 and while they were placing. */
  opponentRank: Rank | null
  /** The day alone, for the phone's short line: 'Today', 'Yesterday', 'Mon'. */
  day: string
}

/** One line of Recent ranked matches: "Marco & Jule", "2v2 · Yesterday · 1 230 RP", "+14". */
export function recentRow(g: RankedGame, now: Date): RecentRow {
  const name = g.opponents.map(o => o.name).join(' & ') || 'Unknown'
  // Ratings of opponents who were still placing are hidden
  const known = g.opponents.flatMap(o => (o.rating === null ? [] : [o.rating]))
  const opp = known.length === g.opponents.length && known.length > 0 ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : null
  const meta = [g.mode, whenPlayed(new Date(g.at), now), ...(opp === null ? [] : [`${fmtRp(opp)} RP`])].join(' · ')
  const placement = g.change === null
  const opponent = g.opponents.length === 1 ? { userId: g.opponents[0].userId, avatar: g.opponents[0].avatar } : null
  const heldRank = g.opponents.length === 1 ? g.opponents[0].rankIndex : null
  return {
    key: g.sessionId,
    won: g.won,
    name,
    meta,
    change: g.change === null ? 'Placement' : signedRp(g.change),
    placement,
    opponent,
    score: g.score ? `${g.score.mine}–${g.score.theirs}` : null,
    opponentRank: heldRank === null ? null : rank(heldRank),
    day: whenPlayed(new Date(g.at), now).split(',')[0],
  }
}

export type TierRow = { tier: Tier; range: string; stages: Rank[] }

/** What a stage row says it takes: 'Start', '750 RP', '2 000+ RP' for the open-ended last stage. */
export function stageThreshold(r: Rank): string {
  return r.index === 0 ? 'Start' : `${fmtRp(r.min)}${r.index === RANK_COUNT - 1 ? '+' : ''} RP`
}

/** The Ranks page's ladder, Wood to Elite, stage V first within each tier. */
export function ladder(): TierRow[] {
  return TIERS.map((tier, t) => {
    const lo = t === 0 ? 0 : rankThreshold(t * 5)
    const hi = t + 1 < TIERS.length ? rankThreshold((t + 1) * 5) - 1 : null
    const range = hi === null ? `${fmtRp(lo)}+` : `${fmtRp(lo)} – ${fmtRp(hi)}`
    const stages = Array.from({ length: 5 }, (_, s) => rank(t * 5 + 4 - s))
    return { tier, range, stages }
  })
}

/** The board a ranked match is played on, as the Matchmaking page says it: the first one online, else the first paired. */
export function playingOn<B extends { name: string; online: boolean }>(boards: readonly B[]): B | null {
  return boards.find(b => b.online) ?? boards.at(0) ?? null
}
