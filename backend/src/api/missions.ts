// Missions (schema/api-v1.yaml, tag missions): list, read, write, report, highscores and start, plus
// the moderators' hide/restore; admins make a mission official with `official` on the create and update. Every route is behind
// missions.enabled (404 while it is off). Who sees what is canSee/visibleTo in db/missions.ts.
// Design: docs/superpowers/specs/2026-11-24-missions-design.md.
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { isAdmin, isModerator, requireModerator } from '../auth/admin.js'
import { requireAuth } from '../auth/middleware.js'
import { loadFlagUser } from '../flags/index.js'
import { friendIdsOf } from '../db/friends.js'
import { lobbyUserIds, ownBoardSeats } from '../db/lobbies.js'
import {
  canSee,
  canWrite,
  createMission,
  deleteMission,
  dismissMissionReports,
  getMission,
  hideMission,
  highscores,
  cardsOf,
  hiddenMissionIds,
  listMissions,
  listReports,
  ownBests,
  ownedCount,
  reportMission,
  restoreMission,
  updateMission,
  type Best,
  type MissionCard,
  type MissionRow,
  type MissionViewer,
} from '../db/missions.js'
import { MISSION_LIMITS, MissionSchema, type Mission } from '../shared/missions/types.js'
import type { MissionConfig } from '../games/mission.js'
import type { SessionEngine } from '../session/engine.js'
import type { LobbyService } from '../lobby/service.js'
import { engineApiError } from './engineErrors.js'
import { ApiError, notFound } from './errors.js'
import { requireFlag } from './flagGate.js'
import { RATE } from './rateLimits.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & {
  db: Kysely<Database>
  engine: Pick<SessionEngine, 'createWithSeats' | 'getSessionByBoard'>
  lobbies: Pick<LobbyService, 'startGame'>
}

/** The signed-in user as the mission rules see them, once missions.enabled is on for them (else 404). */
async function viewerOf(db: Kysely<Database>, userId: string): Promise<MissionViewer> {
  await requireFlag(db, 'missions.enabled', userId)
  const user = await loadFlagUser(db, userId)
  return {
    id: userId,
    admin: !!user && isAdmin(user),
    moderator: !!user && isModerator(user),
    friendIds: new Set(await friendIdsOf(db, userId)),
  }
}

/** The body's mission, checked by the shared rules (bounds the spec can't say: windows, unique targets, text). */
function bodyMission(body: unknown): Mission {
  const r = MissionSchema.safeParse(body)
  if (r.success) return r.data
  throw new ApiError(400, {
    error: 'invalid request',
    details: r.error.issues.map(i => ({ path: ['body', 'mission', ...i.path].join('/'), message: i.message })),
  })
}

/** A mission the viewer may see; 404 for one they may not (as if it did not exist). */
async function visible(db: Kysely<Database>, id: string, v: MissionViewer): Promise<MissionRow> {
  const m = await getMission(db, id)
  if (!m || !canSee(m, v)) throw notFound()
  return m
}

/** A mission the viewer may change: 404 for one they can't see, 403 for one they can only see. */
async function writable(db: Kysely<Database>, id: string, v: MissionViewer): Promise<MissionRow> {
  const m = await visible(db, id, v)
  if (!canWrite(m, v)) throw new ApiError(403, { error: 'forbidden' })
  return m
}

const toBest = (b: Best | null) =>
  b && { userId: b.userId, name: b.name, timeMs: b.timeMs, darts: b.darts, achievedAt: b.achievedAt.toISOString() }

const toCard = (c: MissionCard, v: MissionViewer) => ({
  id: c.id,
  mission: c.mission,
  visibility: c.visibility,
  official: c.ownerUserId === null,
  author: c.ownerUserId !== null && c.authorName !== null ? { id: c.ownerUserId, name: c.authorName } : null,
  plays: c.plays,
  yourBest: toBest(c.yourBest),
  friendsBest: toBest(c.friendsBest),
  hidden: c.hiddenAt ? { at: c.hiddenAt.toISOString(), reason: c.hiddenReason ?? '' } : null,
  canEdit: canWrite(c, v),
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
})

function requireReason(reason: string): string {
  const trimmed = reason.trim()
  if (!trimmed) throw new ApiError(400, { error: 'invalid request', details: [{ path: 'body/reason', message: 'must not be blank' }] })
  return trimmed
}

export function missionsApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db, engine, lobbies } = opts
  const card = async (v: MissionViewer, id: string) => {
    const [found] = await cardsOf(db, v, [(await visible(db, id, v)).id])
    return toCard(found, v)
  }

  app.get<Route<'listMissions'>>('/api/missions', { preValidation: requireAuth, schema: fromSpec('listMissions') }, async req => {
    const v = await viewerOf(db, req.userId)
    const missions = await listMissions(db, v, req.query.filter ?? 'all', req.query.difficulty)
    return { missions: missions.map(c => toCard(c, v)) }
  })

  app.post<Route<'createMission'>>(
    '/api/missions',
    { preValidation: requireAuth, schema: fromSpec('createMission'), config: { rateLimit: RATE.strict } },
    async (req, reply) => {
      const v = await viewerOf(db, req.userId)
      const mission = bodyMission(req.body.mission)
      const { official } = req.body
      if (official !== undefined && !v.admin) throw new ApiError(403, { error: 'forbidden' })
      if (!official && (await ownedCount(db, v.id)) >= MISSION_LIMITS.perPlayer) throw new ApiError(409, { error: 'limit reached' })
      const id = await createMission(db, official ? null : v.id, mission, official ? 'public' : req.body.visibility)
      return reply.code(201).send(await card(v, id))
    },
  )

  app.get<Route<'getMission'>>('/api/missions/:id', { preValidation: requireAuth, schema: fromSpec('getMission') }, async req =>
    card(await viewerOf(db, req.userId), req.params.id),
  )

  app.put<Route<'updateMission'>>('/api/missions/:id', { preValidation: requireAuth, schema: fromSpec('updateMission') }, async req => {
    const v = await viewerOf(db, req.userId)
    const m = await writable(db, req.params.id, v)
    const { official } = req.body
    // Only admins make a mission official or take it back (the client's flag is never trusted)
    if (official !== undefined && !v.admin) throw new ApiError(403, { error: 'forbidden' })
    const wasOfficial = m.ownerUserId === null
    const toOfficial = official ?? wasOfficial
    const change = toOfficial === wasOfficial ? undefined : { ownerUserId: toOfficial ? null : v.id, adminId: v.id }
    // A hidden mission can't be restored once official (moderators don't act on those): restore it first
    if (change?.ownerUserId === null && m.hiddenAt !== null) throw new ApiError(409, { error: 'hidden' })
    if (change?.ownerUserId && (await ownedCount(db, v.id)) >= MISSION_LIMITS.perPlayer) throw new ApiError(409, { error: 'limit reached' })
    // An official mission is everyone's
    await updateMission(db, m.id, bodyMission(req.body.mission), toOfficial ? 'public' : req.body.visibility, change)
    return card(v, m.id)
  })

  app.delete<Route<'deleteMission'>>(
    '/api/missions/:id',
    { preValidation: requireAuth, schema: fromSpec('deleteMission') },
    async (req, reply) => {
      const m = await writable(db, req.params.id, await viewerOf(db, req.userId))
      await deleteMission(db, m.id)
      return reply.code(204).send()
    },
  )

  app.get<Route<'missionHighscores'>>(
    '/api/missions/:id/highscores',
    { preValidation: requireAuth, schema: fromSpec('missionHighscores') },
    async req => {
      const m = await visible(db, req.params.id, await viewerOf(db, req.userId))
      return { highscores: (await highscores(db, m)).map(b => toBest(b)).filter(b => b !== null) }
    },
  )

  app.post<Route<'reportMission'>>(
    '/api/missions/:id/report',
    { preValidation: requireAuth, schema: fromSpec('reportMission'), config: { rateLimit: RATE.strict } },
    async (req, reply) => {
      const v = await viewerOf(db, req.userId)
      const m = await visible(db, req.params.id, v)
      // Only a player's mission everyone sees can be reported
      if (m.ownerUserId === null || m.visibility !== 'public' || m.hiddenAt !== null) throw notFound()
      if (m.ownerUserId === v.id) throw new ApiError(409, { error: 'your own mission' })
      if ((await reportMission(db, m.id, v.id, requireReason(req.body.reason))) === 'duplicate')
        throw new ApiError(409, { error: 'already reported' })
      return reply.code(204).send()
    },
  )

  app.post<Route<'startMission'>>(
    '/api/missions/:id/start',
    { preValidation: requireAuth, schema: fromSpec('startMission'), config: { rateLimit: RATE.strict } },
    async (req, reply) => {
      const v = await viewerOf(db, req.userId)
      const m = await visible(db, req.params.id, v)
      const { test, lobbyId, force } = req.body
      if (test && !canWrite(m, v)) throw new ApiError(403, { error: 'only its author can test a mission' })
      if (test && lobbyId) throw new ApiError(400, { error: 'a test run is played alone' })
      // A hidden mission can still be tested by its author, not played for times
      if (!test && m.hiddenAt !== null) throw new ApiError(403, { error: 'hidden' })
      const config: MissionConfig = {
        missionId: m.id,
        test,
        mission: m.mission,
        highscores: (await highscores(db, m)).map(b => ({ userId: b.userId, name: b.name, timeMs: b.timeMs, darts: b.darts })),
        // Everyone in the lobby, whoever plays: the lobby's own start picks the seats
        bests: await ownBests(db, m.id, lobbyId ? await lobbyUserIds(db, lobbyId) : [v.id]),
      }
      // In a lobby the host starts it for everyone who plays, taking turns (the lobby's seats and boards)
      if (lobbyId) return reply.code(201).send(await lobbies.startGame(v.id, lobbyId, { gameId: 'mission', config }, force))
      const user = await db.selectFrom('user').select('name').where('id', '=', v.id).executeTakeFirstOrThrow()
      const seats = await ownBoardSeats(db, [{ userId: v.id, name: user.name }], id => engine.getSessionByBoard(id) !== undefined)
      let sessionId: string
      try {
        ;({ sessionId } = await engine.createWithSeats({ ownerUserId: v.id, gameId: 'mission', config, seats }))
      } catch (err) {
        throw engineApiError(err)
      }
      return reply.code(201).send({ sessionId })
    },
  )

  app.get<Route<'listMissionReports'>>(
    '/api/admin/missions/reports',
    { preValidation: [requireAuth, requireModerator], schema: fromSpec('listMissionReports') },
    async req => {
      const v = await viewerOf(db, req.userId)
      const [reports, hiddenIds] = await Promise.all([listReports(db), hiddenMissionIds(db)])
      const cards = new Map((await cardsOf(db, v, [...reports.map(r => r.missionId), ...hiddenIds])).map(c => [c.id, toCard(c, v)]))
      return {
        reported: reports.flatMap(r => {
          const mission = cards.get(r.missionId)
          return mission ? [{ mission, reports: r.reports.map(x => ({ ...x, createdAt: x.createdAt.toISOString() })) }] : []
        }),
        hidden: hiddenIds.flatMap(id => cards.get(id) ?? []),
      }
    },
  )

  const moderated = (r: 'ok' | 'missing') => {
    if (r === 'missing') throw notFound()
  }

  app.post<Route<'hideMission'>>(
    '/api/admin/missions/:id/hide',
    { preValidation: [requireAuth, requireModerator], schema: fromSpec('hideMission') },
    async (req, reply) => {
      await viewerOf(db, req.userId)
      moderated(await hideMission(db, req.userId, req.params.id, requireReason(req.body.reason)))
      return reply.code(204).send()
    },
  )

  app.post<Route<'restoreMission'>>(
    '/api/admin/missions/:id/restore',
    { preValidation: [requireAuth, requireModerator], schema: fromSpec('restoreMission') },
    async (req, reply) => {
      await viewerOf(db, req.userId)
      moderated(await restoreMission(db, req.userId, req.params.id))
      return reply.code(204).send()
    },
  )

  app.post<Route<'dismissMissionReports'>>(
    '/api/admin/missions/:id/dismiss-reports',
    { preValidation: [requireAuth, requireModerator], schema: fromSpec('dismissMissionReports') },
    async (req, reply) => {
      await viewerOf(db, req.userId)
      moderated(await dismissMissionReports(db, req.userId, req.params.id))
      return reply.code(204).send()
    },
  )

  done()
}
