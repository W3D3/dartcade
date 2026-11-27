// Dungeon: a co-op roguelike (docs/superpowers/specs/2026-11-27-dungeon-design.md). The rules and the
// content live in shared/dungeon; this module maps the engine's darts and actions onto the run and
// the run onto the view. The run's generator is seeded from `init`'s rng, so a replay is the same run.
import { defencesAt } from '../shared/dungeon/content/enemies.js'
import { intentOf, intentValue } from '../shared/dungeon/enemyTurn.js'
import { hitOf } from '../shared/dungeon/hit.js'
import { DEFAULT_CONFIG, DIFFICULTIES, DUNGEON_RULES, FLOOR_COUNTS, rulesOf, type DungeonConfig } from '../shared/dungeon/rules.js'
import {
  beginRun,
  endVisit,
  openVisit,
  pickClass,
  pickTreasure,
  startRun,
  throwDart,
  voteEvent,
  type RunState,
} from '../shared/dungeon/run.js'
import { runSummary } from '../shared/dungeon/summary.js'
import { alive } from '../shared/dungeon/state.js'
import { seededRng } from '../shared/rng.js'
import type { ConfigFieldMeta, DungeonDetail, GameModule, MatchStats, Player, SeatResult, SummaryContext } from '../session/types.js'
import type { DungeonView } from '../session/views.js'
import { validateOptions } from './configMeta.js'
import { row, values } from './matchStats.js'

export type { DungeonConfig }

const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' } as const

export const configMeta: Record<keyof DungeonConfig, ConfigFieldMeta> = {
  difficulty: {
    label: 'Difficulty',
    tooltip: 'Enemy HP and damage: Easy for a first run, Medium for about 25 to 45 a visit, Hard and Expert for strong throwers.',
    options: DIFFICULTIES.map(d => ({ value: d, label: DIFFICULTY_LABEL[d] })),
  },
  floors: {
    label: 'Floors',
    tooltip: 'How long the act is; the last floor is the boss.',
    options: FLOOR_COUNTS.map(n => ({ value: n, label: String(n) })),
  },
}

const MATCH_STATS_ROWS = [
  row('damage', 'Damage dealt', 'integer', 'higher'),
  row('bestVisit', 'Best visit', 'integer', 'higher', { compact: true }),
  row('healed', 'Healed', 'integer', 'higher', { compact: true }),
  row('blocked', 'Blocked', 'integer', 'higher', { compact: true }),
  row('hp', 'HP left', 'integer', 'higher'),
]

const over = (s: RunState) => s.scene.phase === 'ended'
const outcomeOf = (s: RunState) => (s.scene.phase === 'ended' ? s.scene.outcome : null)

// No more darts count: the vote is cast, the visit resolved, or the scene takes none
function locked(s: RunState): boolean {
  switch (s.scene.phase) {
    case 'map':
      return s.scene.votes[s.turn] !== null
    case 'battle':
      return s.scene.battle.resolved
    case 'rest':
      return false
    default:
      return true
  }
}

export const dungeonModule: GameModule<RunState, DungeonConfig, DungeonView, 'dungeon', DungeonDetail> = {
  id: 'dungeon',
  version: 1,
  defaultConfig: DEFAULT_CONFIG,
  configMeta,

  validate(cfg: DungeonConfig, players: Player[]): string | null {
    const { minParty, maxParty } = rulesOf(cfg)
    if (players.length < minParty || players.length > maxParty) return `A party is ${minParty} to ${maxParty} heroes`
    return validateOptions(cfg, configMeta)
  },

  init: (cfg, players, rng = seededRng(1)) => startRun(cfg, players.length, Math.floor(rng() * 2 ** 32)),

  getCurrentPlayer: s => s.turn,

  onBoardEvent(s, e) {
    if (over(s)) return { state: s }
    switch (e.kind) {
      case 'visit.opened':
        return { state: openVisit(s) }
      case 'dart.detected':
        return { state: throwDart(s, hitOf(e.data.dart.segment)) }
      // A Reset ends the visit like a takeout
      case 'takeout.finished':
      case 'visit.cleared':
        return { state: endVisit(s) }
      default:
        return { state: s }
    }
  },

  onUserAction(s, a) {
    if (over(s)) return { state: s }
    switch (a.type) {
      case 'dungeon_pick_class':
        return { state: pickClass(s, a.seat, a.classId, a.healSegment ?? null) }
      case 'dungeon_choose_reward':
        return { state: pickTreasure(s, a.seat, a.index) }
      case 'dungeon_vote':
        return { state: voteEvent(s, a.seat, a.decision) }
      case 'dungeon_start':
        return { state: beginRun(s) }
      default:
        return { state: s }
    }
  },

  view(s: RunState): DungeonView {
    const scene = s.scene
    const battle = scene.phase === 'battle' ? scene.battle : null
    const next = over(s) ? s : endVisit(s)
    return {
      phase: scene.phase,
      difficulty: s.cfg.difficulty,
      floors: s.cfg.floors,
      floor: s.floor,
      room: s.room,
      cleared: s.cleared,
      map: s.map,
      path: s.path,
      votes: scene.phase === 'map' ? scene.votes : s.heroes.map(() => null),
      currentPlayer: s.turn,
      nextPlayer: over(next) ? null : next.turn,
      winner: over(s) ? 0 : null,
      outcome: outcomeOf(s),
      visitLocked: locked(s),
      gold: s.gold,
      heroes: s.heroes,
      items: s.items,
      battle: battle && {
        room: battle.room,
        round: battle.round,
        target: battle.enemies.find(alive)?.uid ?? null,
        enemies: battle.enemies.map(e => {
          const intent = intentOf(e, battle.round)
          return {
            ...e,
            intent: {
              kind: intent.kind,
              value: intentValue(e, battle.round, s.cfg.difficulty, DUNGEON_RULES),
              pierce: 'pierce' in intent && intent.pierce === true,
            },
            ...defencesAt(e.kind, e.hp, e.maxHp),
          }
        }),
        lastEnemyTurn: battle.lastEnemyTurn,
      },
      trace: s.trace,
      offers: scene.phase === 'treasure' ? scene.offers : null,
      event: scene.phase === 'event' ? { id: scene.event, votes: scene.votes } : null,
      lastEvent: s.lastEvent,
      lastHeal: s.lastHeal,
      summary: over(s) ? runSummary(s) : null,
    }
  },

  // Co-op: the party wins or loses together, so every seat shares first place
  summarize(s: RunState, ctx: SummaryContext): SeatResult[] {
    return s.heroes.map(h => ({
      placement: 1,
      stats: {
        victory: outcomeOf(s) === 'victory' ? 1 : 0,
        cleared: s.cleared,
        damage: s.stats[h.seat].damage,
        bestVisit: s.stats[h.seat].bestVisit,
        dartsThrown: ctx.totalDarts[h.seat] ?? 0,
      },
    }))
  },

  detail: (visits, s): DungeonDetail => ({
    mode: 'dungeon',
    summary: runSummary(s),
    darts: s.heroes.map(h => visits.filter(v => v.seat === h.seat).reduce((n, v) => n + v.darts.length, 0)),
  }),

  matchStats: (_visits, s): MatchStats => ({
    rows: MATCH_STATS_ROWS,
    seats: s.heroes.map(h => {
      const st = s.stats[h.seat]
      return {
        index: h.seat,
        values: values({ damage: st.damage, bestVisit: st.bestVisit, healed: st.healed, blocked: st.blocked, hp: h.hp }),
      }
    }),
  }),
}
