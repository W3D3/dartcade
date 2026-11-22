// Each game's rules as one line, from its config, for every place that shows them: the match
// header, the win screen, History, the details page and the lobby's next game. One parser per
// game: a config that doesn't parse (an old or foreign one) gives no line rather than a wrong one.
import { z } from 'zod'
import { isGameId, type GameId } from '$shared/gameNames'
import { COURSES } from '$shared/minigolf/courses/index'
import { atcRules, catch40Rules, cricketRules, hiloRules, minigolfRules, p121Rules, shanghaiRules, x01Rules } from './meta.js'

const int = z.number().int()
const ModeSchema = z.enum(['straight', 'double', 'master'])
// Settings a saved lobby config may leave out read as what the game plays without them
const X01ConfigSchema = z.object({
  startScore: int,
  inMode: ModeSchema.catch('straight'),
  outMode: ModeSchema.catch('straight'),
  firstTo: int.catch(3),
  handicaps: z.array(z.unknown()).optional(),
})
const AtcConfigSchema = z.object({
  order: z.enum(['asc', 'desc', 'random']),
  finishOn: z.enum(['twenty', 'single_bull', 'bull']),
  multiplierAdvances: z.boolean(),
})
const P121ConfigSchema = z.object({ startTarget: int, tries: int, dartsPerTry: int, outMode: ModeSchema.catch('double') })
const HiloConfigSchema = z.object({ startHigh: int, startLow: int, lives: int })
const ShanghaiConfigSchema = z.object({ start: int, end: int, bullRound: z.boolean().catch(false), shanghaiWins: z.boolean().catch(true) })
const CricketConfigSchema = z.object({ mode: z.enum(['standard', 'cutthroat']), firstTo: int })
const MissionConfigSchema = z.object({
  mission: z.object({ name: z.string(), order: z.enum(['any', 'in_order']), steps: z.array(z.unknown()) }),
})
const MinigolfConfigSchema = z.object({
  course: z.string().catch(''),
  tries: int.catch(3),
  ballContact: z.boolean().catch(false),
  courseName: z.string().optional(),
  holes: z.array(z.unknown()).optional(),
})

/**
 * A finished minigolf game's course: its name and hole count. Its config carries both (copied
 * from the published course); a game from before courses moved to the database has only the
 * code course's id ("Mixed course": 9 of all its holes).
 */
function minigolfCourse(c: { course: string; courseName?: string; holes?: unknown[] }): { name: string; holes: number } {
  const code = COURSES.find(x => x.id === c.course)
  const name = c.courseName ?? code?.name ?? (c.course === 'mixed' ? 'Mixed course' : 'Course')
  if (c.holes) return { name, holes: c.holes.length }
  if (code) return { name, holes: code.holes.length }
  return {
    name,
    holes: Math.min(
      9,
      COURSES.reduce((n, x) => n + x.holes.length, 0),
    ),
  }
}

/** What a rules line may know beyond the config: a team game's format, a minigolf game's course. */
export type RulesExtra = {
  /** "Teams 2v2", leading an X01 team game's line. */
  teams?: string
  /** A minigolf course's name and hole count when the caller knows them (a lobby before the start: no holes yet). */
  course?: { name: string; holes: number | null }
}

type Rules = (config: unknown, players: number, extra: RulesExtra) => string

const RULES = {
  x01: (config, players, { teams }) => {
    const c = X01ConfigSchema.safeParse(config)
    return c.success ? x01Rules(c.data, players, teams) : ''
  },
  atc: (config, players) => {
    const c = AtcConfigSchema.safeParse(config)
    return c.success ? atcRules(c.data, players) : ''
  },
  p121: config => {
    const c = P121ConfigSchema.safeParse(config)
    return c.success ? p121Rules(c.data) : ''
  },
  catch40: () => catch40Rules(),
  hilo: config => {
    const c = HiloConfigSchema.safeParse(config)
    return c.success ? hiloRules(c.data) : ''
  },
  cricket: config => {
    const c = CricketConfigSchema.safeParse(config)
    return c.success ? cricketRules(c.data) : ''
  },
  // "Tungsten Gauntlet · 3 steps · any order"
  mission: config => {
    const c = MissionConfigSchema.safeParse(config)
    if (!c.success) return ''
    const { name, steps, order } = c.data.mission
    return `${name} · ${steps.length} ${steps.length === 1 ? 'step' : 'steps'} · ${order === 'any' ? 'any order' : 'in order'}`
  },
  shanghai: config => {
    const c = ShanghaiConfigSchema.safeParse(config)
    return c.success ? shanghaiRules(c.data) : ''
  },
  minigolf: (config, players, { course }) => {
    const c = MinigolfConfigSchema.safeParse(config)
    if (!c.success) return ''
    const { name, holes } = course ?? minigolfCourse(c.data)
    return minigolfRules(c.data, name, holes, players)
  },
} satisfies Record<GameId, Rules>

/** A game's rules line, e.g. "501 · Double out · First to 3 legs"; empty for a mode this build doesn't know. */
export function rulesOf(gameId: string, config: unknown, players: number, extra: RulesExtra = {}): string {
  return isGameId(gameId) ? RULES[gameId](config, players, extra) : ''
}
