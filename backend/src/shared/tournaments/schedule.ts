// When each stage of a tournament is likely to be played (Q21): every match starts once what it
// waits for has ended (the matches its sides come from, the earlier matches of its players) and
// takes its longest length at a few minutes a leg; a match that ended or started counts with its
// real times, so the estimate moves with the tournament. Pure, no DB or IO.
import { BRACKET_ORDER, roundName, type Bracket, type Match } from './bracket.js'
import type { TournamentFormat } from './setup.js'
import type { MatchStatus } from './state.js'

/** A rough minutes-per-leg for every game (the tracking issue's example: X01's first to N). */
export const MINUTES_PER_LEG = 4

/** What the stored row of a match says about its timing (epoch ms). */
export interface MatchTimes {
  readonly status: MatchStatus
  readonly startedAt: number | null
  readonly finishedAt: number | null
}

/** A column of the bracket: a knockout round, a lower-bracket round, a grand final, or one round of every group. */
export interface Stage {
  readonly bracket: Bracket
  readonly round: number
}

export interface ScheduledStage extends Stage {
  readonly name: string
  /** done: every match is decided; now: one is ready or being played; later: none yet. */
  readonly state: 'done' | 'now' | 'later'
  /** For a later stage: when its first match is expected, to the minute. */
  readonly at: number | null
}

/** A stage's name, e.g. `Quarter-finals`, `Lower round 2`, `Grand final`; `rounds` is how many its bracket has. */
export function stageName(format: TournamentFormat, stage: Stage, rounds: number): string {
  const last = stage.round === rounds
  switch (stage.bracket) {
    case 'group':
      return `Groups · round ${stage.round}`
    case 'lower':
      return last ? 'Lower final' : `Lower round ${stage.round}`
    case 'final':
      return stage.round === 1 ? 'Grand final' : 'Grand final reset'
    case 'main':
      if (format === 'round_robin') return `Round ${stage.round}`
      if (format === 'double_elimination' && last) return 'Upper final'
      return roundName(stage.round, rounds).name
  }
}

/** How many rounds each bracket has. */
export const roundsOf = (matches: readonly Match[], bracket: Bracket): number =>
  Math.max(0, ...matches.filter(m => m.bracket === bracket).map(m => m.round))

const MINUTE = 60_000

/**
 * The stages in bracket order with their state and, for those still to come, an estimated start.
 * `times` holds each match's stored times by its key; `startsAt` is the tournament's start.
 */
export function schedule(
  format: TournamentFormat,
  matches: readonly Match[],
  times: ReadonlyMap<string, MatchTimes>,
  startsAt: number,
  now: number,
): ScheduledStage[] {
  const byKey = new Map(matches.map(m => [m.key, m]))
  const ends = new Map<string, number>()
  const earliest = Math.max(startsAt, now)
  const length = (m: Match) => (2 * m.firstTo - 1) * MINUTES_PER_LEG * MINUTE
  const entriesOf = (m: Match) => m.sides.flatMap(s => (s.entry === null ? [] : [s.entry]))

  // What a match waits for: where its sides come from, and its players' earlier matches
  const waitsFor = (m: Match): Match[] => [
    ...m.sides.flatMap(s => {
      const src = s.source
      if (src === null) return []
      if (src.from === 'group') return matches.filter(x => x.bracket === 'group' && x.group === src.group)
      return byKey.get(src.match) ?? []
    }),
    ...matches.filter(
      x => x.bracket === m.bracket && x.group === m.group && x.round < m.round && entriesOf(x).some(e => entriesOf(m).includes(e)),
    ),
  ]
  const startOf = (m: Match): number => Math.max(earliest, ...waitsFor(m).map(endOf))
  function endOf(m: Match): number {
    const known = ends.get(m.key)
    if (known !== undefined) return known
    const t = times.get(m.key)
    const end =
      t?.finishedAt != null
        ? t.finishedAt
        : m.result !== null
          ? earliest
          : t?.startedAt != null
            ? Math.max(now, t.startedAt + length(m))
            : startOf(m) + length(m)
    ends.set(m.key, end)
    return end
  }

  const stages = new Map<string, { stage: Stage; matches: Match[] }>()
  for (const m of matches) {
    const key = `${m.bracket}:${m.round}`
    const s = stages.get(key) ?? { stage: { bracket: m.bracket, round: m.round }, matches: [] }
    s.matches.push(m)
    stages.set(key, s)
  }
  return [...stages.values()]
    .sort((a, b) => BRACKET_ORDER[a.stage.bracket] - BRACKET_ORDER[b.stage.bracket] || a.stage.round - b.stage.round)
    .map(({ stage, matches: ms }) => {
      const name = stageName(format, stage, roundsOf(matches, stage.bracket))
      const done = (m: Match) => m.result !== null || times.get(m.key)?.status === 'finished'
      if (ms.every(done)) return { ...stage, name, state: 'done', at: null }
      if (ms.some(m => ['ready', 'live'].includes(times.get(m.key)?.status ?? ''))) return { ...stage, name, state: 'now', at: null }
      const at = Math.min(...ms.filter(m => !done(m)).map(startOf))
      return { ...stage, name, state: 'later', at: Math.floor(at / MINUTE) * MINUTE }
    })
}
