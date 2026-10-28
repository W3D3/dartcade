// Each game's rules as one line, from its config, for every place that shows them: the match
// header, the win screen, History, the details page and the lobby's next game. One parser per
// game: a config that doesn't parse (an old or foreign one) gives no line rather than a wrong one.
import { z } from 'zod'
import { isGameId, type GameId } from '$shared/gameNames'
import { COURSES } from '$shared/minigolf/courses/index'
import { atcRules, hiloRules, minigolfRules, p121Rules, x01Rules } from './meta.js'

const int = z.number().int()
const ModeSchema = z.enum(['straight', 'double', 'master'])
// Settings a saved lobby config may leave out read as what the game plays without them
export const X01ConfigSchema = z.object({
  startScore: int,
  inMode: ModeSchema.catch('straight'),
  outMode: ModeSchema.catch('straight'),
  firstTo: int.catch(3),
})
export const AtcConfigSchema = z.object({
  order: z.enum(['asc', 'desc', 'random']),
  finishOn: z.enum(['twenty', 'single_bull', 'bull']),
  multiplierAdvances: z.boolean(),
})
export const P121ConfigSchema = z.object({ startTarget: int, tries: int, dartsPerTry: int, outMode: ModeSchema.catch('double') })
export const HiloConfigSchema = z.object({ startHigh: int, startLow: int, lives: int })
export const MinigolfConfigSchema = z.object({
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
export function minigolfCourse(c: { course: string; courseName?: string; holes?: unknown[] }): { name: string; holes: number } {
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
  hilo: config => {
    const c = HiloConfigSchema.safeParse(config)
    return c.success ? hiloRules(c.data) : ''
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
