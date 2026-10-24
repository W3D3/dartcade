import { games } from '../games/index.js'
import { noStats } from '../games/matchStats.js'
import { newSession, replayPooled, StoredConfigSchema, type LoggedInput, type WarnFn } from '../session/replay.js'
import type { AtcDetail, HiloDetail, MatchStats, MinigolfDetail, P121Detail, X01Detail } from '../session/types.js'
import type { HistoryGame } from '../db/history.js'

type Detail = X01Detail | AtcDetail | MinigolfDetail | P121Detail | HiloDetail

/** The game's per-mode detail and match stats, from replaying its input log; null if its mode is gone. */
export async function buildDetail(
  game: HistoryGame,
  events: LoggedInput[],
  warn: WarnFn,
): Promise<{ detail: Detail; stats: MatchStats } | null> {
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
    version: game.game_version,
  })
  const { visits } = await replayPooled(session, events, warn)
  const final = session.committedState
  const stats = mod.matchStats?.(visits, final) ?? noStats()
  if (mod.id === 'x01') return { detail: mod.detail(visits, final), stats }
  if (mod.id === 'atc') return { detail: mod.detail(visits, final), stats }
  if (mod.id === 'minigolf') return { detail: mod.detail(visits, final), stats }
  return { detail: mod.detail(visits, final), stats }
}
