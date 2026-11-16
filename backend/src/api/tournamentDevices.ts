import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import { setDeviceCookie } from '../auth/deviceSession.js'
import { requireAuth } from '../auth/middleware.js'
import type { Database } from '../db/schema.js'
import { addDevice, listDevices, pairDevice, renameDevice, revokeDevices, type DeviceRow } from '../db/tournamentDevices.js'
import { getTournamentRow } from '../db/tournamentRun.js'
import { canOrganize, viewerRole } from '../db/tournaments.js'
import { cutDevices } from '../tournaments/deviceSockets.js'
import { normalizeCode } from '../shared/lobbyCode.js'
import { ApiError, notFound } from './errors.js'
import { requireTournamentsFlag } from './flagGate.js'
import { RATE } from './rateLimits.js'
import type { Route } from './route.js'
import { fromSpec } from './spec.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

const listed = (d: DeviceRow) => ({
  id: d.id,
  name: d.name,
  paired: d.paired,
  createdAt: d.createdAt.toISOString(),
  lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
  expiresAt: d.expiresAt.toISOString(),
})

/**
 * Venue devices of an in-person tournament (tournament mode): organizers add, list and revoke
 * them; a device opens its pairing code and then names and reads its own session. The
 * session itself is enforced in auth/middleware.ts (an allow list of routes) and the sockets.
 */
export function tournamentDevicesApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts

  /** The tournament the caller organizes (404 when they may not see it, 403 when they only watch). */
  async function organized(id: string, userId: string) {
    await requireTournamentsFlag(db, userId)
    const t = await getTournamentRow(db, id)
    const seen = t && (await viewerRole(db, t, userId))
    if (!t || !seen) throw notFound()
    if (!canOrganize(seen.role)) throw new ApiError(403, { error: 'only organizers can do this' })
    return t
  }

  app.post<Route<'pairTournamentDevice'>>(
    '/api/tournament-devices/pair',
    { config: { rateLimit: RATE.strict }, schema: fromSpec('pairTournamentDevice') },
    async (req, reply) => {
      const paired = await pairDevice(db, normalizeCode(req.body.code), new Date())
      if (!paired) throw notFound()
      setDeviceCookie(reply, paired.token)
      return { id: paired.session.id, tournamentId: paired.session.tournamentId, name: paired.session.name }
    },
  )

  app.register((own, _opts, next) => {
    own.addHook('preValidation', requireAuth)
    own.addHook('preValidation', async req => {
      if (!req.tournamentDevice) throw notFound()
      await requireTournamentsFlag(db, req.userId)
    })
    const config = { tournamentDevice: true }

    own.get<Route<'getTournamentDeviceSession'>>(
      '/api/tournament-device',
      { config, schema: fromSpec('getTournamentDeviceSession') },
      req => {
        const d = req.tournamentDevice
        if (!d) throw notFound()
        return { id: d.id, tournamentId: d.tournamentId, name: d.name }
      },
    )
    own.patch<Route<'renameTournamentDevice'>>(
      '/api/tournament-device',
      { config, schema: fromSpec('renameTournamentDevice') },
      async req => {
        const d = req.tournamentDevice
        if (!d) throw notFound()
        const name = req.body.name.trim()
        if (!name) throw new ApiError(400, { error: 'invalid request', details: [{ path: 'body/name', message: 'is empty' }] })
        await renameDevice(db, d.id, name)
        return { id: d.id, tournamentId: d.tournamentId, name }
      },
    )
    next()
  })

  app.register((organizer, _opts, next) => {
    organizer.addHook('preValidation', requireAuth)

    organizer.get<Route<'listTournamentDevices'>>(
      '/api/tournaments/:id/devices',
      { schema: fromSpec('listTournamentDevices') },
      async req => {
        const t = await organized(req.params.id, req.userId)
        return { devices: (await listDevices(db, t.id, new Date())).map(listed) }
      },
    )
    organizer.post<Route<'addTournamentDevice'>>(
      '/api/tournaments/:id/devices',
      { config: { rateLimit: RATE.strict }, schema: fromSpec('addTournamentDevice') },
      async (req, reply) => {
        const t = await organized(req.params.id, req.userId)
        if (t.access !== 'in_person') throw new ApiError(409, { error: 'only an in-person tournament has devices' })
        if (t.status === 'finished' || t.status === 'cancelled')
          throw new ApiError(409, { error: `a ${t.status} tournament takes no devices` })
        const d = await addDevice(db, t.id, req.userId, new Date())
        return reply.code(201).send({ id: d.id, code: d.code, expiresAt: d.expiresAt.toISOString() })
      },
    )
    organizer.delete<Route<'revokeTournamentDevices'>>(
      '/api/tournaments/:id/devices',
      { schema: fromSpec('revokeTournamentDevices') },
      async (req, reply) => {
        const t = await organized(req.params.id, req.userId)
        cutDevices(await revokeDevices(db, t.id, null, new Date()))
        return reply.code(204).send()
      },
    )
    organizer.delete<Route<'revokeTournamentDevice'>>(
      '/api/tournaments/:id/devices/:deviceId',
      { schema: fromSpec('revokeTournamentDevice') },
      async (req, reply) => {
        const t = await organized(req.params.id, req.userId)
        const gone = await revokeDevices(db, t.id, req.params.deviceId, new Date())
        if (gone.length === 0) throw notFound()
        cutDevices(gone)
        return reply.code(204).send()
      },
    )
    next()
  })

  done()
}
