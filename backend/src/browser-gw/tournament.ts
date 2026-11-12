import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import type { Kysely } from 'kysely'
import { z } from 'zod'
import { socketQuery, withAuthedSocket } from './authedSocket.js'
import type { Database } from '../db/schema.js'
import { getTournamentRow } from '../db/tournamentRun.js'
import { viewerRole } from '../db/tournaments.js'
import { flagEnabled, loadFlagUser } from '../flags/index.js'
import { WsCloseCode } from '../schema/game-ws.js'
import type { TournamentLive } from '../tournaments/live.js'
import { isOpen, onceGone } from '../util/socket.js'

const QuerySchema = z.object({ tournamentId: z.string().min(1), code: z.string().optional() })

type Opts = FastifyPluginOptions & { db: Kysely<Database>; live: TournamentLive }

/**
 * The tournament socket (/ws/tournament?tournamentId=…[&code=…]): pushes the running state
 * (schema/tournament-ws-v1.json) to anyone who may see the tournament, as GET /api/tournaments/{id}
 * decides (an invite link's `code` included). Closed NotFound, like that route's 404, otherwise or
 * while tournaments.enabled is off for the caller.
 */
export function tournamentGwPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db, live } = opts

  app.get('/ws/tournament', { websocket: true }, (connection: SocketStream, req) => {
    withAuthedSocket(connection, req, async (socket, userId) => {
      const query = socketQuery(socket, req.query, QuerySchema, 'missing tournamentId')
      if (!query) return
      const t = (await flagEnabled('tournaments.enabled', await loadFlagUser(db, userId)))
        ? await getTournamentRow(db, query.tournamentId)
        : undefined
      const seen = t && (await viewerRole(db, t, userId, query.code))
      if (!isOpen(socket)) return
      if (!seen) {
        socket.close(WsCloseCode.NotFound, 'tournament not found')
        return
      }
      onceGone(socket, () => {
        live.remove(query.tournamentId, socket)
      })
      await live.add(query.tournamentId, socket)
    })
  })

  done()
}
