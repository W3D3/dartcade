import { games } from '../games/index.js'
import { noStats } from '../games/matchStats.js'
import { newSession, replay, StoredConfigSchema, type LoggedInput, type WarnFn } from '../session/replay.js'
import type { AtcDetail, MatchStats, X01Detail } from '../session/types.js'
import type { HistoryGame } from '../db/history.js'

/** The game's per-mode detail and match stats, from replaying its input log; null if its mode is gone. */
export function buildDetail(
  game: HistoryGame,
  events: LoggedInput[],
  warn: WarnFn,
): { detail: X01Detail | AtcDetail; stats: MatchStats } | null {
  const mod = games[game.game_id]
  const config = StoredConfigSchema.safeParse(game.config)
  if (!mod || !config.success) return null
  const session = newSession({
    id: game.id,
    ownerUserId: '',
    boardId: null,
    module: mod,
    config: config.data,
    seats: game.seats.map(s => ({ name: s.name, userId: null, controllerUserId: '', boardId: null, boardName: null, bot: null })),
    seed: game.rng_seed,
    createdAt: game.created_at,
  })
  const { visits } = replay(session, events, warn)
  const final = session.committedState
  return { detail: mod.detail(visits, final), stats: mod.matchStats?.(visits, final) ?? noStats() }
}
