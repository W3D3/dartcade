import { games } from '../games/index.js'
import { newSession, replay, StoredConfigSchema, type LoggedInput, type WarnFn } from '../session/replay.js'
import type { AtcDetail, X01Detail } from '../session/types.js'
import type { HistoryGame } from '../db/history.js'

/** The game's per-mode detail, from replaying its input log; null if its mode is gone. */
export function buildDetail(game: HistoryGame, events: LoggedInput[], warn: WarnFn): X01Detail | AtcDetail | null {
  const mod = games[game.game_id]
  const config = StoredConfigSchema.safeParse(game.config)
  if (!mod || !config.success) return null
  const session = newSession({
    id: game.id,
    ownerUserId: '',
    boardId: null,
    module: mod,
    config: config.data,
    seats: game.seats.map(s => ({ name: s.name, userId: null, controllerUserId: '', boardId: null, boardName: null })),
    seed: game.rng_seed,
    createdAt: game.created_at,
  })
  const { visits } = replay(session, events, warn)
  return mod.detail(visits, session.committedState)
}
