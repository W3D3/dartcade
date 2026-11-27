// What the Missions list and the Mission-Play screen show, as pure functions of the API's cards and
// the snapshot's MissionGame (docs/superpowers/specs/2026-11-24-missions-design.md).
import type { components } from '$lib/api/schema'
import type { MissionGame, MissionRun, MissionStep } from '$lib/api/game-ws'
import { plural } from '$lib/fmt'
import { compareRuns } from '$shared/missions/highscores'
import { elapsed } from '$shared/missions/run'
import { stepDetail } from '$shared/missions/describe'

export type MissionCard = components['schemas']['MissionCard']
export type MissionBest = components['schemas']['MissionBest']
export type MissionVisibility = components['schemas']['MissionVisibility']
export type Difficulty = MissionCard['mission']['difficulty']

export const MISSION_FILTERS = ['all', 'mine', 'friends', 'popular', 'completed'] as const
export type MissionFilter = (typeof MISSION_FILTERS)[number]

/** Each tab's label; `short` on a phone's segmented control. */
export const FILTER_LABELS: Record<MissionFilter, { label: string; short: string }> = {
  all: { label: 'All', short: 'All' },
  mine: { label: 'Mine', short: 'Mine' },
  friends: { label: 'From friends', short: 'Friends' },
  popular: { label: 'Popular', short: 'Popular' },
  completed: { label: 'Completed', short: 'Done' },
}

export const filterOf = (s: string | undefined): MissionFilter => MISSION_FILTERS.find(f => f === s) ?? 'all'

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard', 'expert']
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' }
/** The difficulty pill's colour (Missions artboard: easy lime, medium amber, hard red). */
export const DIFFICULTY_TONE: Record<Difficulty, Tone> = { easy: 'accent', medium: 'clock', hard: 'live', expert: 'expert' }

export const VISIBILITIES: readonly MissionVisibility[] = ['private', 'friends', 'public']
export const VISIBILITY_LABEL: Record<MissionVisibility, string> = { private: 'Only me', friends: 'Friends', public: 'Everyone' }

/** What a card's ⋯ menu asks for. */
export type CardAction =
  | { kind: 'edit' }
  | { kind: 'duplicate' }
  | { kind: 'delete' }
  | { kind: 'report' }
  | { kind: 'visibility'; to: MissionVisibility }

export type Tone = 'neutral' | 'ice' | 'clock' | 'accent' | 'live' | 'expert'
export type Pill = { label: string; tone: Tone }

/** "12:30" (minutes and seconds), "1:02:05" past an hour. */
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const [h, m, r] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(r).padStart(2, '0')}`
}

/** A time limit as a pill: "15 MIN", "45 S". */
const limitLabel = (seconds: number) =>
  seconds % 60 === 0 ? `${seconds / 60} min` : seconds < 60 ? `${seconds} s` : `${Math.round(seconds / 60)} min`

/** The pills under a card's name: steps, the order (more than one step), official, the time limit. */
export function cardPills(card: Pick<MissionCard, 'mission' | 'official'>): Pill[] {
  const { steps, order, timeLimit } = card.mission
  const pills: Pill[] = [{ label: plural(steps.length, 'step'), tone: 'neutral' }]
  if (steps.length > 1) pills.push({ label: order === 'any' ? 'Any order' : 'In order', tone: 'ice' })
  if (card.official) pills.push({ label: 'Official', tone: 'accent' })
  if (timeLimit !== undefined) pills.push({ label: limitLabel(timeLimit), tone: 'clock' })
  return pills
}

/** A best run as the mission ranks it: its time, or its darts for a darts race. */
export const bestValue = (rankBy: MissionCard['mission']['rankBy'], best: Pick<MissionBest, 'timeMs' | 'darts'>): string =>
  rankBy === 'darts' ? plural(best.darts, 'dart') : fmtClock(best.timeMs)

/** "by you", "by Dartcade", "by Lena" (a deleted author: "by a player"). */
export const authorLabel = (card: Pick<MissionCard, 'author' | 'official'>, viewerId: string | null): string =>
  card.official ? 'by Dartcade' : card.author === null ? 'by a player' : card.author.id === viewerId ? 'by you' : `by ${card.author.name}`

export const authorName = (card: Pick<MissionCard, 'author' | 'official'>): string =>
  card.official ? 'Dartcade' : (card.author?.name ?? 'Player')

/** The card's Your best and Friends' best: a mission of your own you never finished shows a dash, not "Not tried". */
export function bests(card: MissionCard, viewerId: string | null): { yours: string; friends: string } {
  const rankBy = card.mission.rankBy
  const own = card.author?.id === viewerId
  return {
    yours: card.yourBest ? bestValue(rankBy, card.yourBest) : own ? '—' : 'Not tried',
    friends: card.friendsBest ? bestValue(rankBy, card.friendsBest) : '—',
  }
}

/** Who may report a card: someone else's player mission that everyone sees. */
export const canReport = (card: Pick<MissionCard, 'official' | 'visibility' | 'author'>, viewerId: string | null): boolean =>
  !card.official && card.visibility === 'public' && card.author !== null && card.author.id !== viewerId

/** What an empty tab says. */
export function emptyLine(filter: MissionFilter, difficulty: Difficulty | null): string {
  if (difficulty) return `No ${DIFFICULTY_LABEL[difficulty].toLowerCase()} missions here. Try another difficulty.`
  switch (filter) {
    case 'all':
      return 'No missions yet. Make the first one.'
    case 'mine':
      return "You haven't made a mission yet. New mission builds one from steps."
    case 'friends':
      return "Your friends haven't shared a mission with you yet."
    case 'popular':
      return 'Nobody has played a mission yet.'
    case 'completed':
      return "You haven't completed a mission yet. Finish one to see it here."
  }
}

// ── The play screen ───────────────────────────────────────────────────────

/** A step in the steps list: done, the one being played, failed (the run ended on it), started earlier, or untouched. */
export type StepState = 'done' | 'active' | 'failed' | 'started' | 'idle'

export function stepState(run: MissionRun, i: number): StepState {
  const s = run.steps[i]
  if (s.doneAt !== null) return 'done'
  if (i === run.active) return run.status === 'failed' ? 'failed' : 'active'
  return s.attempts > 1 || s.best > 0 || s.darts > 0 ? 'started' : 'idle'
}

const streaky = (step: MissionStep) => step.type === 'hit' && step.inARow

/** The line under a step in the steps list. */
export function stepStatusLine(step: MissionStep, run: MissionRun, i: number, anyOrder: boolean): string {
  const s = run.steps[i]
  const best = `best ${streaky(step) ? 'streak ' : ''}${s.best}`
  switch (stepState(run, i)) {
    case 'done':
      return `Done · ${plural(s.darts, 'dart')} · ${fmtClock(s.doneAt ?? 0)}`
    case 'failed':
      return run.failure === 'time' ? `Time ran out · attempt ${s.attempts}` : `Gave up · attempt ${s.attempts}`
    case 'active':
      return `Attempt ${s.attempts} · ${best}`
    case 'started':
      return `Attempt ${s.attempts} · ${best}${anyOrder ? ' · switch any time' : ''}`
    case 'idle':
      return anyOrder ? 'Not started · switch any time' : 'Not started'
  }
}

/** The current step's big number: the score left (checkout, leg), the average, or progress of a goal. */
export type BigNumber = { value: string; of: string | null; caption: string | null }

export function bigNumber(step: MissionStep, progress: MissionRun['steps'][number]['progress']): BigNumber {
  if (progress.left !== undefined) return { value: String(progress.left), of: null, caption: 'left' }
  if (step.type === 'average')
    return { value: progress.average == null ? '–' : progress.average.toFixed(1), of: String(step.average), caption: 'average' }
  return { value: String(progress.value), of: String(progress.of), caption: null }
}

/** The progress cells under the big number: one per unit when there are few enough, else none (a bar). */
export const SEGMENT_MAX = 21
export type Segment = 'done' | 'next' | 'empty'
export function segments(progress: { value: number; of: number }): Segment[] | null {
  if (progress.of > SEGMENT_MAX || progress.of < 1) return null
  return Array.from({ length: progress.of }, (_, i) => (i < progress.value ? 'done' : i === progress.value ? 'next' : 'empty'))
}

/** The rule under the big number. */
export const stepRule = (step: MissionStep): string => (streaky(step) ? 'A miss resets the streak to 0.' : stepDetail(step))

/** "+1", "0", "−40". */
export const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

/** The board's lime target: a hit step on one number (its whole wedge), or a bull. */
export function boardTarget(step: MissionStep): number | null {
  if (step.type !== 'hit' || step.targets.length !== 1) return null
  const t = step.targets[0]
  if (t === 'B') return 25
  if (t === 'DB') return 50
  return Number(t.replace(/^[SDT]/, ''))
}

/**
 * A run's mission time at `now` (ms since the epoch): the clock runs only while it is the run's turn,
 * from its first input. `now` is this device's time.
 * shortcut: this device's clock stands in for the server's; a skew of a few seconds shows. Upgrade
 * by sending the server's time in the snapshot.
 */
export function liveElapsed(run: Pick<MissionRun, 'clock' | 'status' | 'timeMs'>, now: number): number {
  if (run.status !== 'playing') return run.timeMs ?? elapsed(run.clock)
  const { startedAt, pausedAt, pausedMs } = run.clock
  if (startedAt === null) return 0
  return pausedAt === null ? Math.max(elapsed(run.clock), now - startedAt - pausedMs) : elapsed(run.clock)
}

/** The time left (ms) of a mission with a limit; null without one. */
export function timeLeft(
  game: Pick<MissionGame, 'mission'>,
  run: Pick<MissionRun, 'clock' | 'status' | 'timeMs'>,
  now: number,
): number | null {
  const limit = game.mission.timeLimit
  return limit === undefined ? null : Math.max(0, limit * 1000 - liveElapsed(run, now))
}

/** How often the screen asks the server again once its countdown reached 0 (the server's clock may lag this device's). */
export const CLOCK_RETRY_MS = 2_000

/** The clock turns red in its last minute (Mission-Play: amber, then red). */
export const CLOCK_WARN_MS = 60_000

/** A run's progress in one line, for the other players' rows: "Step 2 of 3 · 5/9", "Done · 9:58", "Out · gave up". */
export function runLine(game: Pick<MissionGame, 'mission'>, run: MissionRun): string {
  const n = game.mission.steps.length
  const done = run.steps.filter(s => s.doneAt !== null).length
  if (run.status === 'completed') return `Done · ${fmtClock(run.timeMs ?? 0)}`
  if (run.status === 'failed') return `Out · ${run.failure === 'time' ? 'time ran out' : 'gave up'} · ${done}/${n} steps`
  const p = run.steps[run.active].progress
  return `Step ${run.active + 1} of ${n} · ${p.left ?? `${p.value}/${p.of}`}${p.left !== undefined ? ' left' : ''}`
}

// ── The result ────────────────────────────────────────────────────────────

export type ResultRow = { seat: number; name: string; place: number | null; steps: string; time: string; darts: number; outcome: string }

const OUTCOME = { completed: 'Completed', time: 'Time ran out', gave_up: 'Gave up', playing: 'Not finished' } as const

export function resultRows(game: Pick<MissionGame, 'mission' | 'runs'>, names: string[]): ResultRow[] {
  const n = game.mission.steps.length
  return game.runs
    .map((run, seat) => ({
      seat,
      name: names[seat] ?? `Player ${seat + 1}`,
      place: run.place,
      steps: `${run.steps.filter(s => s.doneAt !== null).length}/${n}`,
      time: fmtClock(run.timeMs ?? elapsed(run.clock)),
      darts: run.darts,
      outcome: OUTCOME[run.status === 'failed' ? (run.failure ?? 'gave_up') : run.status],
    }))
    .sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || a.seat - b.seat)
}

/**
 * Whether `userId`'s completed run beats their own best from before the game (the config's `bests`;
 * never the top-10 highscores, which may not hold it). An account the game has no entry for: no.
 */
export function personalBest(
  game: Pick<MissionGame, 'mission' | 'bests' | 'test'>,
  run: Pick<MissionRun, 'status' | 'timeMs' | 'darts'>,
  userId: string,
): boolean {
  if (game.test || run.status !== 'completed' || run.timeMs === null || !(userId in game.bests)) return false
  const before = game.bests[userId]
  return before === null || compareRuns(game.mission.rankBy, { timeMs: run.timeMs, darts: run.darts }, before) < 0
}

/** Where the run would sit in the highscores it started with, if it completed: 1-based, null otherwise. */
export function highscoreRank(
  game: Pick<MissionGame, 'mission' | 'highscores' | 'test'>,
  run: Pick<MissionRun, 'status' | 'timeMs' | 'darts'>,
): number | null {
  if (game.test || run.status !== 'completed' || run.timeMs === null) return null
  const mine = { timeMs: run.timeMs, darts: run.darts }
  return game.highscores.filter(h => compareRuns(game.mission.rankBy, h, mine) <= 0).length + 1
}
