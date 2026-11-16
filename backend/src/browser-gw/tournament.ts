import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import type { RawData } from 'ws'
import type { Kysely } from 'kysely'
import { z } from 'zod'
import { socketQuery, withAuthedSocket } from './authedSocket.js'
import type { Database } from '../db/schema.js'
import { getTournamentRow } from '../db/tournamentRun.js'
import { canOrganize, viewerRole } from '../db/tournaments.js'
import { flagEnabled, loadFlagUser } from '../flags/index.js'
import { WsCloseCode } from '../schema/game-ws.js'
import { TournamentClientMessageSchema } from '../schema/zod.js'
import type { TournamentLive, Viewer } from '../tournaments/live.js'
import { isOpen, onceGone, rawText } from '../util/socket.js'

const QuerySchema = z.object({
  tournamentId: z.string().min(1),
  code: z.string().optional(),
  // A device in tournament mode: its name and the id its browser keeps
  device: z.string().trim().min(1).max(40).optional(),
  deviceId: z.string().min(1).max(64).optional(),
  // The match a device played before it reconnected
  hold: z.string().min(1).max(32).optional(),
})

type Opts = FastifyPluginOptions & { db: Kysely<Database>; live: TournamentLive }

/**
 * The tournament socket (/ws/tournament?tournamentId=…[&code=…]): pushes the running state
 * (schema/tournament-ws-v1.json) to anyone who may see the tournament, as GET /api/tournaments/{id}
 * decides (an invite link's `code` included). Closed NotFound, like that route's 404, otherwise or
 * while tournaments.enabled is off for the caller. Organizers also get the devices in tournament
 * mode; a device (`device` and `deviceId`) must organize an in-person tournament (Forbidden
 * otherwise) and is the only socket whose messages count.
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
      const device =
        query.device !== undefined && query.deviceId !== undefined
          ? { id: query.deviceId, name: query.device, hold: query.hold }
          : undefined
      if (device && (t.play !== 'in_person' || !canOrganize(seen.role))) {
        socket.close(WsCloseCode.Forbidden, 'only organizers of an in-person tournament open tournament mode')
        return
      }
      const viewer: Viewer = canOrganize(seen.role) ? { organizer: true, device } : { organizer: false }
      socket.on('message', (raw: RawData) => {
        let data: unknown
        try {
          data = JSON.parse(rawText(raw))
        } catch {
          return
        }
        const msg = TournamentClientMessageSchema.safeParse(data)
        if (msg.success) live.onMessage(query.tournamentId, socket, msg.data)
      })
      onceGone(socket, () => {
        live.remove(query.tournamentId, socket)
      })
      await live.add(query.tournamentId, socket, viewer)
    })
  })

  done()
}
