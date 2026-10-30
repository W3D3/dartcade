import type { Kysely } from 'kysely'
import { z } from 'zod'
import type { Database } from './schema.js'
import { friendIdsOf } from './friends.js'

export type HomeLobby = {
  id: string
  name: string
  hostName: string
  state: 'open' | 'in_game'
  mode: string | null
  /** X01's start score; null for another mode or none set. */
  startScore: number | null
  people: number
  boards: number
}

// A running game's config, or the lobby's next one: only what the one-line summary reads
const GameSchema = z.object({ gameId: z.string(), config: z.object({ startScore: z.number().optional() }) })

/**
 * Open lobbies of the viewer's friends that friends may join (the host is a friend and the lobby
 * is on `friends` access), newest first. One whose game is running reads `in_game` and shows that
 * game; there is nothing to join or watch there yet.
 */
export async function homeLobbies(db: Kysely<Database>, viewerId: string): Promise<HomeLobby[]> {
  const friendIds = await friendIdsOf(db, viewerId)
  if (friendIds.length === 0) return []
  const lobbies = await db
    .selectFrom('lobbies as l')
    .innerJoin('user as host', 'host.id', 'l.host_user_id')
    .select(['l.id', 'l.name', 'l.next_game', 'host.name as host_name'])
    .where('l.closed_at', 'is', null)
    .where('l.access', '=', 'friends')
    // As in the friends list, an Invisible host's lobby is not shown
    .where('host.invisible', '=', false)
    .where('l.host_user_id', 'in', friendIds)
    .orderBy('l.created_at', 'desc')
    .orderBy('l.id', 'desc')
    .execute()
  if (lobbies.length === 0) return []
  const ids = lobbies.map(l => l.id)
  const [people, running] = await Promise.all([
    db
      .selectFrom('lobby_people')
      .select(eb => ['lobby_id', eb.fn.countAll<string>().as('people'), eb.fn.count<string>('board_id').distinct().as('boards')])
      .where('lobby_id', 'in', ids)
      .groupBy('lobby_id')
      .execute(),
    db
      .selectFrom('game_sessions')
      .select(['lobby_id', 'game_id', 'config'])
      .where('lobby_id', 'in', ids)
      .where('status', '=', 'active')
      .execute(),
  ])
  return lobbies.map(l => {
    const counts = people.find(p => p.lobby_id === l.id)
    const live = running.find(r => r.lobby_id === l.id)
    const next = GameSchema.safeParse(l.next_game)
    const game = live ? GameSchema.safeParse({ gameId: live.game_id, config: live.config }) : next
    return {
      id: l.id,
      name: l.name,
      hostName: l.host_name,
      state: live ? 'in_game' : 'open',
      mode: game.success ? game.data.gameId : null,
      startScore: game.success && game.data.gameId === 'x01' ? (game.data.config.startScore ?? null) : null,
      people: Number(counts?.people ?? 0),
      boards: Number(counts?.boards ?? 0),
    }
  })
}
