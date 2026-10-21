// Daily and weekly challenges: the template catalogue (data), the seeded generator and the
// progress a finished game makes. All pure; the service (service.ts) stores what they decide.
// Concept: the Progression page's Challenges section.
import { seededRng, type Rng } from '../shared/rng.js'
import { addDays, daysBetween } from '../shared/progression.js'

export type Period = 'daily' | 'weekly'
export type Difficulty = 'easy' | 'medium' | 'hard'

/** What challenges pay, by period and difficulty. */
export const CHALLENGE_XP: Record<Period, Record<Difficulty, number>> = {
  daily: { easy: 40, medium: 75, hard: 125 },
  weekly: { easy: 250, medium: 400, hard: 600 },
}

/** A dart as the challenges read it: number (25 or 50 for the bull) and multiplier (0 = a miss). */
export type Seg = { n: number; m: number }
/** One of your visits in the game itself, in order; `scored` and `bust` only in X01. */
export type Visit = { leg: number; segs: Seg[]; scored: number | null; bust: boolean }
/** An X01 leg you checked out: the dart it ended on, the score it took out, your darts in the leg. */
export type Checkout = { last: Seg; value: number; darts: number; startScore: number }

/** What a finished game did, from your seat: what every template reads. */
export type ChallengeGame = {
  id: string
  mode: string
  /** Counts at all: enough darts, not forfeited (the XP rules' qualifying game). */
  qualifies: boolean
  won: boolean
  vsHuman: boolean
  ranked: boolean
  lobby: boolean
  boardDarts: number
  visits: Visit[]
  checkouts: Checkout[]
  /** X01: legs you lost. */
  legsLost: number
  /** X01: the most you trailed the leader by at a visit's end, in a leg. */
  maxDeficit: number
  /** X01: your 3-dart average. */
  average: number | null
  /** The other accounts you played with. */
  people: string[]
}

/** What the generator scales targets and picks templates from. */
export type ChallengeContext = {
  /** Board darts and qualifying games per active day over the last 30 days; null for a new player. */
  dartsPerDay: number | null
  gamesPerDay: number | null
  /** Your best X01 3-dart average of the last 30 days; null without one. */
  bestAverage: number | null
  /** Modes on for you that you haven't played for 14 days ("try something"). */
  untriedModes: string[]
}

/** A challenge's running state: the games already counted, and whatever a template remembers. */
export type ChallengeState = { games?: string[]; set?: (string | number)[]; run?: number; threshold?: number }

type Template = {
  id: string
  period: Period
  difficulty: Difficulty
  /** One template per metric in a set. */
  metric: string
  title: (target: number, state: ChallengeState) => string
  /** Base target, its floor, and what scales it (by your last 30 days); fixed when unset. */
  base: number
  floor?: number
  scale?: 'darts' | 'games'
  /** Only offered when this holds. */
  eligible?: (ctx: ChallengeContext) => boolean
  /** State a new challenge starts with. */
  init?: (ctx: ChallengeContext) => ChallengeState
  /** The progress after a game (absolute), and the state to keep. */
  step: (g: ChallengeGame, progress: number, state: ChallengeState) => { progress: number; state?: ChallengeState }
}

const count =
  (f: (g: ChallengeGame) => number) =>
  (g: ChallengeGame, p: number): { progress: number } => ({ progress: p + f(g) })
const once =
  (f: (g: ChallengeGame) => boolean) =>
  (g: ChallengeGame, p: number): { progress: number } => ({ progress: f(g) ? Math.max(p, 1) : p })
/** Counts distinct values across games; progress is how many. */
const distinct =
  (f: (g: ChallengeGame) => (string | number)[]) =>
  (g: ChallengeGame, _p: number, s: ChallengeState): { progress: number; state: ChallengeState } => {
    const set = [...new Set([...(s.set ?? []), ...f(g)])]
    return { progress: set.length, state: { ...s, set } }
  }

const isDouble = (s: Seg) => s.m === 2
const isBull = (s: Seg) => (s.n === 25 && s.m === 2) || s.n === 50
const trebles = (g: ChallengeGame) => g.visits.reduce((a, v) => a + v.segs.filter(s => s.m === 3).length, 0)
const doubles = (g: ChallengeGame) => g.visits.reduce((a, v) => a + v.segs.filter(isDouble).length, 0)
const tons = (g: ChallengeGame, min: number) => g.visits.filter(v => !v.bust && (v.scored ?? 0) >= min).length
const finishedOn = (g: ChallengeGame) => g.checkouts.flatMap(c => (isDouble(c.last) && c.last.n <= 20 ? [c.last.n] : []))
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export const MODE_NAMES: Record<string, string> = {
  x01: 'X01',
  atc: 'Around the Clock',
  p121: '121',
  minigolf: 'Minigolf',
  hilo: 'Higher Lower',
}

/** "Try something": a mode you haven't played for 14 days. Its id is `d.try.<mode>`. */
export const tryTemplate = (mode: string): Template => ({
  id: `d.try.${mode}`,
  period: 'daily',
  difficulty: 'easy',
  metric: `try.${mode}`,
  title: () => `Play a game of ${MODE_NAMES[mode] ?? mode}`,
  base: 1,
  step: once(g => g.qualifies && g.mode === mode),
})

export const TEMPLATES: readonly Template[] = [
  // ---- Daily ------------------------------------------------------------------------------
  {
    id: 'd.darts',
    period: 'daily',
    difficulty: 'easy',
    metric: 'darts',
    title: n => `Throw ${n} darts on a board`,
    base: 100,
    floor: 30,
    scale: 'darts',
    step: count(g => g.boardDarts),
  },
  {
    id: 'd.games',
    period: 'daily',
    difficulty: 'easy',
    metric: 'games',
    title: n => `Finish ${plural(n, 'game')}`,
    base: 3,
    floor: 1,
    scale: 'games',
    step: count(g => (g.qualifies ? 1 : 0)),
  },
  {
    id: 'd.win',
    period: 'daily',
    difficulty: 'medium',
    metric: 'wins',
    title: () => 'Win a game against another player',
    base: 1,
    step: once(g => g.qualifies && g.won && g.vsHuman),
  },
  {
    id: 'd.trebles',
    period: 'daily',
    difficulty: 'medium',
    metric: 'trebles',
    title: n => `Hit ${n} trebles`,
    base: 5,
    floor: 2,
    scale: 'darts',
    step: count(trebles),
  },
  {
    id: 'd.doubles',
    period: 'daily',
    difficulty: 'medium',
    metric: 'doubles',
    title: n => `Hit ${n} doubles`,
    base: 6,
    floor: 2,
    scale: 'darts',
    step: count(doubles),
  },
  {
    id: 'd.tons',
    period: 'daily',
    difficulty: 'medium',
    metric: 'tons',
    title: n => `Score 100 or more in ${plural(n, 'visit')}`,
    base: 3,
    floor: 1,
    step: count(g => tons(g, 100)),
  },
  // Daily, hard and creative: at most one a set
  {
    id: 'd.d16',
    period: 'daily',
    difficulty: 'hard',
    metric: 'finish',
    title: () => 'Finish a leg on double 16',
    base: 1,
    step: once(g => finishedOn(g).includes(16)),
  },
  {
    id: 'd.leg21',
    period: 'daily',
    difficulty: 'hard',
    metric: 'leg-darts',
    title: () => 'Win a 501 leg in 21 darts or fewer',
    base: 1,
    step: once(g => g.checkouts.some(c => c.startScore === 501 && c.darts <= 21)),
  },
  {
    id: 'd.bull',
    period: 'daily',
    difficulty: 'hard',
    metric: 'finish',
    title: () => 'Check out on the bull',
    base: 1,
    step: once(g => g.checkouts.some(c => isBull(c.last))),
  },
  {
    id: 'd.three-trebles',
    period: 'daily',
    difficulty: 'hard',
    metric: 'trebles',
    title: () => 'Hit three different trebles in one visit',
    base: 1,
    step: once(g => g.visits.some(v => v.segs.length === 3 && v.segs.every(s => s.m === 3) && new Set(v.segs.map(s => s.n)).size === 3)),
  },
  {
    id: 'd.comeback',
    period: 'daily',
    difficulty: 'hard',
    metric: 'wins',
    title: () => 'Win a game after trailing by 150 or more',
    base: 1,
    step: once(g => g.qualifies && g.won && g.maxDeficit >= 150),
  },
  {
    id: 'd.big-doubles',
    period: 'daily',
    difficulty: 'hard',
    metric: 'doubles',
    title: () => 'Hit a double 20, a double 19 and a double 18 today',
    base: 3,
    step: distinct(g => g.visits.flatMap(v => v.segs.filter(s => s.m === 2 && s.n >= 18 && s.n <= 20).map(s => s.n))),
  },
  {
    id: 'd.140-run',
    period: 'daily',
    difficulty: 'hard',
    metric: 'tons',
    title: () => 'Score 140 or more in three visits in a row',
    base: 1,
    step: once(g => {
      let run = 0
      for (const v of g.visits) {
        run = !v.bust && (v.scored ?? 0) >= 140 ? run + 1 : 0
        if (run >= 3) return true
      }
      return false
    }),
  },
  {
    id: 'd.same-single',
    period: 'daily',
    difficulty: 'hard',
    metric: 'grouping',
    title: () => 'Throw all three darts of a visit into the same single (not 20)',
    base: 1,
    step: once(g =>
      g.visits.some(v => v.segs.length === 3 && v.segs.every(s => s.m === 1 && s.n === v.segs[0].n && s.n !== 20 && s.n <= 20)),
    ),
  },
  {
    id: 'd.atc-ten',
    period: 'daily',
    difficulty: 'hard',
    metric: 'atc',
    title: () => 'Around the Clock: reach 10 within your first 15 darts',
    base: 1,
    step: once(g => {
      if (g.mode !== 'atc') return false
      let target = 1
      for (const s of g.visits.flatMap(v => v.segs).slice(0, 15)) if (s.m > 0 && s.n === target) target++
      return target > 10
    }),
  },
  // ---- Weekly -----------------------------------------------------------------------------
  {
    id: 'w.games',
    period: 'weekly',
    difficulty: 'easy',
    metric: 'games',
    title: n => `Play ${n} games`,
    base: 15,
    floor: 5,
    scale: 'games',
    step: count(g => (g.qualifies ? 1 : 0)),
  },
  {
    id: 'w.darts',
    period: 'weekly',
    difficulty: 'easy',
    metric: 'darts',
    title: n => `Throw ${n} darts on a board`,
    base: 700,
    floor: 200,
    scale: 'darts',
    step: count(g => g.boardDarts),
  },
  {
    id: 'w.modes',
    period: 'weekly',
    difficulty: 'medium',
    metric: 'modes',
    title: n => `Play ${n} different game modes`,
    base: 3,
    step: distinct(g => (g.qualifies ? [g.mode] : [])),
  },
  {
    id: 'w.tons',
    period: 'weekly',
    difficulty: 'medium',
    metric: 'tons',
    title: n => `Score 100 or more ${n} times`,
    base: 8,
    floor: 3,
    step: count(g => tons(g, 100)),
  },
  {
    id: 'w.wins',
    period: 'weekly',
    difficulty: 'medium',
    metric: 'wins',
    title: n => `Win ${plural(n, 'game')}`,
    base: 5,
    floor: 2,
    scale: 'games',
    step: count(g => (g.qualifies && g.won ? 1 : 0)),
  },
  // Weekly, hard and creative
  {
    id: 'w.ranked-lobby',
    period: 'weekly',
    difficulty: 'hard',
    metric: 'wins',
    title: n => `Win ${n} ranked or lobby games`,
    base: 5,
    step: count(g => (g.qualifies && g.won && g.vsHuman && (g.ranked || g.lobby) ? 1 : 0)),
  },
  {
    id: 'w.beat-average',
    period: 'weekly',
    difficulty: 'hard',
    metric: 'average',
    title: (_n, s) => `Beat your best 3-dart average of the last 30 days (${(s.threshold ?? 0).toFixed(1)})`,
    base: 1,
    eligible: ctx => ctx.bestAverage !== null,
    init: ctx => ({ threshold: ctx.bestAverage ?? 0 }),
    step: (g, p, s) => ({ progress: g.qualifies && (g.average ?? 0) > (s.threshold ?? Infinity) ? Math.max(p, 1) : p }),
  },
  {
    id: 'w.big-checkouts',
    period: 'weekly',
    difficulty: 'hard',
    metric: 'checkouts',
    title: () => 'Check out above 100 three times',
    base: 3,
    step: count(g => g.checkouts.filter(c => c.value > 100).length),
  },
  {
    id: 'w.win-modes',
    period: 'weekly',
    difficulty: 'hard',
    metric: 'modes',
    title: () => 'Win a game in three different modes',
    base: 3,
    step: distinct(g => (g.qualifies && g.won && g.vsHuman ? [g.mode] : [])),
  },
  {
    id: 'w.finish-set',
    period: 'weekly',
    difficulty: 'hard',
    metric: 'finish',
    title: () => 'Finish legs on D16, D20 and D8',
    base: 3,
    step: distinct(g => finishedOn(g).filter(n => n === 16 || n === 20 || n === 8)),
  },
  {
    id: 'w.people',
    period: 'weekly',
    difficulty: 'hard',
    metric: 'people',
    title: () => 'Play with 5 different people',
    base: 5,
    step: distinct(g => (g.qualifies ? g.people : [])),
  },
  {
    id: 'w.win-run',
    period: 'weekly',
    difficulty: 'hard',
    metric: 'win-run',
    title: () => 'Win three games in a row against humans',
    base: 3,
    step: (g, p, s) => {
      if (!g.qualifies || !g.vsHuman) return { progress: p, state: s }
      const run = g.won ? (s.run ?? 0) + 1 : 0
      return { progress: Math.max(p, run), state: { ...s, run } }
    },
  },
  {
    id: 'w.all-numbers',
    period: 'weekly',
    difficulty: 'hard',
    metric: 'numbers',
    title: () => 'Hit every number from 1 to 20 in a single game',
    base: 1,
    step: once(g => new Set(g.visits.flatMap(v => v.segs.filter(s => s.m > 0 && s.n <= 20).map(s => s.n))).size === 20),
  },
  {
    id: 'w.ranked-clean',
    period: 'weekly',
    difficulty: 'hard',
    metric: 'ranked',
    title: () => 'Win a ranked match without losing a leg',
    base: 1,
    step: once(g => g.ranked && g.won && g.legsLost === 0),
  },
]

export function templateById(id: string): Template | undefined {
  if (id.startsWith('d.try.')) return tryTemplate(id.slice('d.try.'.length))
  return TEMPLATES.find(t => t.id === id)
}

/** One generated challenge: its slot (1-3), template, target, XP and starting state. */
export type Challenge = { slot: number; templateId: string; difficulty: Difficulty; target: number; xp: number; state: ChallengeState }

/** FNV-1a: a stable 32-bit seed from a string. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]

/** The target from your last 30 days: between half and twice the base, never under the floor. */
export function scaledTarget(t: Pick<Template, 'base' | 'floor' | 'scale' | 'period'>, ctx: ChallengeContext): number {
  const rate = t.scale === 'darts' ? ctx.dartsPerDay : t.scale === 'games' ? ctx.gamesPerDay : null
  if (!t.scale || rate === null) return t.base
  // The base assumes 100 darts or 3 games a day
  const factor = Math.min(2, Math.max(0.5, rate / (t.scale === 'darts' ? 100 : 3)))
  const step = t.base >= 100 ? 10 : 1
  return Math.max(t.floor ?? 1, Math.round((t.base * factor) / step) * step)
}

/** The difficulty slot `slot` gets: 1 easy, 2 medium, 3 hard about half the time (else medium). */
function slotDifficulty(rng: Rng, slot: number): Difficulty {
  if (slot === 1) return 'easy'
  if (slot === 2) return 'medium'
  return rng() < 0.5 ? 'hard' : 'medium'
}

/**
 * The challenge in `slot` of a period's set: a pure function of (user, period key, slot, reroll),
 * the context, and the metrics the set's other slots already use. A daily set's first slot is a
 * "try something" about half the time, when there's a mode to try.
 */
export function generateChallenge(
  userId: string,
  period: Period,
  periodKey: string,
  slot: number,
  reroll: number,
  ctx: ChallengeContext,
  usedMetrics: readonly string[],
  difficulty?: Difficulty,
): Challenge {
  const rng = seededRng(hash(`${userId}|${period}|${periodKey}|${slot}|${reroll}`))
  const want = difficulty ?? slotDifficulty(rng, slot)
  const tries = ctx.untriedModes.map(tryTemplate).filter(t => !usedMetrics.includes(t.metric))
  const useTry = period === 'daily' && slot === 1 && tries.length > 0 && rng() < 0.5
  const pool = useTry
    ? tries
    : TEMPLATES.filter(t => t.period === period && t.difficulty === want && !usedMetrics.includes(t.metric) && (t.eligible?.(ctx) ?? true))
  // Every metric taken (never with today's catalogue): any template of the difficulty
  const t = pick(rng, pool.length > 0 ? pool : TEMPLATES.filter(x => x.period === period && x.difficulty === want))
  return {
    slot,
    templateId: t.id,
    difficulty: t.difficulty,
    target: scaledTarget(t, ctx),
    xp: CHALLENGE_XP[period][t.difficulty],
    state: t.init?.(ctx) ?? {},
  }
}

/** A new period's set of three, slot by slot (no metric twice, at most one hard). */
export function generateSet(userId: string, period: Period, periodKey: string, ctx: ChallengeContext): Challenge[] {
  const set: Challenge[] = []
  for (const slot of [1, 2, 3]) {
    const used = set.map(c => metricOf(c.templateId))
    set.push(generateChallenge(userId, period, periodKey, slot, 0, ctx, used))
  }
  return set
}

export const metricOf = (templateId: string): string => templateById(templateId)?.metric ?? templateId

/** The progress and state a game leaves; a game already counted changes nothing. */
export function applyGame(
  c: { templateId: string; progress: number; state: ChallengeState },
  g: ChallengeGame,
): { progress: number; state: ChallengeState } | null {
  const t = templateById(c.templateId)
  if (!t || c.state.games?.includes(g.id)) return null
  const next = t.step(g, c.progress, c.state)
  return { progress: next.progress, state: { ...(next.state ?? c.state), games: [...(c.state.games ?? []), g.id] } }
}

export function challengeTitle(c: { templateId: string; target: number; state: ChallengeState }): string {
  return templateById(c.templateId)?.title(c.target, c.state) ?? 'Challenge'
}

// ---- Periods ---------------------------------------------------------------------------------

/** A daily set's key is its local date; a weekly set's is its Monday. */
export function periodKey(period: Period, localDate: string): string {
  if (period === 'daily') return localDate
  const weekday = new Date(`${localDate}T00:00:00Z`).getUTCDay()
  return addDays(localDate, -((weekday + 6) % 7))
}

/** The local date the period after `key` starts on. */
export function periodEnd(period: Period, key: string): string {
  return addDays(key, period === 'daily' ? 1 : 7)
}

/** Whether `localDate` falls in the period keyed `key`. */
export const inPeriod = (period: Period, key: string, localDate: string): boolean => {
  const d = daysBetween(key, localDate)
  return d >= 0 && d < (period === 'daily' ? 1 : 7)
}
