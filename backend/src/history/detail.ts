import { games } from '../games/index.js'
import { noStats } from '../games/matchStats.js'
import { newSession, replayPooled, StoredConfigSchema, type LoggedInput, type WarnFn } from '../session/replay.js'
import type { AtcDetail, HiloDetail, MatchStats, MinigolfDetail, P121Detail, X01Detail } from '../session/types.js'
import { getGameDetail, saveGameDetail, type HistoryGame } from '../db/history.js'
import { getSessionEvents } from '../db/queries.js'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'

type Detail = X01Detail | AtcDetail | MinigolfDetail | P121Detail | HiloDetail
type Built = { detail: Detail; stats: MatchStats }

// Bump when a mode's detail() or matchStats() output changes without its module version: every
// stored detail is then rebuilt on its next load
const DETAIL_VERSION = 1

// The builds under way, so two first loads of a game replay it once
const building = new Map<string, Promise<Built | null>>()

/**
 * A finished game's detail and match stats: the stored ones if this code built them, else replayed
 * (buildDetail) and stored. Only the replay's result is stored: whatever can change later (the
 * invalidated mark) comes from the game row on each load.
 */
export async function storedDetail(db: Kysely<Database>, game: HistoryGame, warn: WarnFn): Promise<Built | null> {
  const mod = games[game.game_id]
  if (!mod) return null
  const version = `${mod.version}.${DETAIL_VERSION}`
  const row = await getGameDetail(db, game.id)
  if (row?.version === version) return { detail: row.detail, stats: row.stats }
  let pending = building.get(game.id)
  if (!pending) {
    pending = (async () => {
      const built = await buildDetail(game, await getSessionEvents(db, game.id), warn)
      if (built) await saveGameDetail(db, game.id, version, built)
      return built
    })().finally(() => building.delete(game.id))
    building.set(game.id, pending)
  }
  return pending
}

/** The game's per-mode detail and match stats, from replaying its input log; null if its mode is gone. */
export async function buildDetail(game: HistoryGame, events: LoggedInput[], warn: WarnFn): Promise<Built | null> {
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
  return { detail: mod.detail(visits, final), stats }
}
