import type { FastifyInstance, RouteOptions } from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import fastifyStatic from '@fastify/static'
import rateLimit from '@fastify/rate-limit'
import fastifySwagger, { type StaticDocumentSpec } from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import type { Kysely } from 'kysely'
import { toNodeHandler } from 'better-auth/node'
import type { Database } from './db/schema.js'
import type { SessionEngine } from './session/engine.js'
import { autoOpenBigScreen } from './boards/bigScreenOpen.js'
import { bridgeGwPlugin } from './bridge-gw/handler.js'
import { browserConnections, browserGwPlugin, pushCamera } from './browser-gw/handler.js'
import { lobbyGwPlugin } from './browser-gw/lobby.js'
import { sessionsApiPlugin } from './api/sessions.js'
import { gamesApiPlugin } from './api/games.js'
import { boardsApiPlugin } from './api/boards.js'
import { bridgeReleases } from './boards/bridgeRelease.js'
import { buildInfo } from './system/info.js'
import { lightsApiPlugin } from './api/lights.js'
import { pairingApiPlugin } from './api/pairing.js'
import { usersApiPlugin } from './api/users.js'
import { meApiPlugin } from './api/me.js'
import { lobbiesApiPlugin } from './api/lobbies.js'
import { voicesApiPlugin } from './api/voices.js'
import { friendsApiPlugin } from './api/friends.js'
import { rankedApiPlugin } from './api/ranked.js'
import { homeApiPlugin } from './api/home.js'
import { progressApiPlugin } from './api/progress.js'
import { minigolfCoursesApiPlugin } from './api/minigolfCourses.js'
import { adminUsersApiPlugin } from './api/adminUsers.js'
import { applyBan } from './auth/ban.js'
import { adminGamesApiPlugin } from './api/adminGames.js'
import { adminFlagsApiPlugin } from './api/adminFlags.js'
import { systemApiPlugin } from './api/system.js'
import { bridgeConnections } from './bridge-gw/connections.js'
import { getOpenLobbyIds } from './db/lobbies.js'
import { boardsWithWledDevices, rehostWledDevices } from './db/lights.js'
import type { LightsService } from './lights/service.js'
import { envFlagValues, envFlagsOn, setupFlags } from './flags/index.js'
import { ofrepApiPlugin } from './api/ofrep.js'
import { parsePreview, previewApiPlugin } from './api/preview.js'
import { authInfoApiPlugin } from './api/authInfo.js'
import { feedbackAddress, feedbackApiPlugin } from './api/feedback.js'
import { legalApiPlugin } from './api/legal.js'
import { loadLegal, legalValues } from './legal/load.js'
import { createFastify } from './api/fastify.js'
import { auth, mailConfig, mailer } from './auth/index.js'
import type { LobbyService } from './lobby/service.js'
import type { LobbyHub } from './lobby/hub.js'
import type { FriendsService } from './friends/service.js'
import type { MatchmakingService } from './matchmaking/service.js'
import { bigScreenGwPlugin } from './browser-gw/bigScreen.js'
import type { BigScreenService } from './bigscreen/service.js'
import { matchmakingApiPlugin } from './api/matchmaking.js'
import bundledSpec from './schema/api-v1.bundled.json' with { type: 'json' }
import { z } from 'zod'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type AppDeps = {
  engine: SessionEngine
  db: Kysely<Database>
  /** Lobby rules and pushes (see lobby/service.ts). */
  lobbies: LobbyService
  /** Open lobby and /ws/me sockets. */
  hub: LobbyHub
  /** Friend requests and friends' status (see friends/service.ts). */
  friends: FriendsService
  /** Sends wled scenes/flashes as games change (see lights/service.ts); omitted in tests that don't exercise it. */
  lights?: LightsService
  /** The big screen's follow service (see bigscreen/service.ts). */
  bigScreen: BigScreenService
  /** The ranked queue (see matchmaking/service.ts). */
  matchmaking: MatchmakingService
  /** Built frontend to serve; omitted in tests. */
  frontendDist?: string
  /** Observe route registration (the spec coverage test uses this). */
  onRoute?: (route: RouteOptions) => void
}

// The JSON import types its enums as plain strings, which the OpenAPI types don't accept;
// the document itself is our generated spec, checked here for its top-level shape
const OpenApiShapeSchema = z.object({
  openapi: z.string(),
  info: z.record(z.string(), z.unknown()),
  paths: z.record(z.string(), z.unknown()),
})
function isOpenApiDocument(v: unknown): v is StaticDocumentSpec['document'] {
  return OpenApiShapeSchema.safeParse(v).success
}

// The largest legitimate message is a 1 MiB camera still (MAX_STILL_BYTES), base64 in a JSON envelope (~1.4 MiB)
export const WS_MAX_PAYLOAD = 2 * 1024 * 1024

// 'urls.primaryName' is a Swagger UI option that @fastify/swagger-ui's types leave out
const swaggerUiConfig = {
  urls: [
    { url: '/api/docs/json', name: 'Dartcade API' },
    { url: '/api/auth/open-api/generate-schema', name: 'Auth (better-auth)' },
  ],
  'urls.primaryName': 'Dartcade API',
}

/** The SPA's index.html with its link-preview URLs made absolute from PUBLIC_URL (crawlers need that); relative when unset. */
function readIndex(frontendDist: string): string | undefined {
  try {
    const origin = (process.env.PUBLIC_URL ?? '').replace(/\/+$/, '')
    return readFileSync(join(frontendDist, 'index.html'), 'utf8').replaceAll('__ORIGIN__', origin)
  } catch {
    return undefined // not built yet
  }
}

/** All HTTP/WebSocket routes of the backend, without listening or touching the database. */
export async function buildApp({
  engine,
  db,
  lobbies,
  hub,
  friends,
  lights,
  bigScreen,
  matchmaking,
  frontendDist,
  onRoute,
}: AppDeps): Promise<FastifyInstance> {
  const app = createFastify()
  const indexHtml = frontendDist ? readIndex(frontendDist) : undefined
  if (onRoute) app.addHook('onRoute', onRoute)
  // Feature flags (OpenFeature): the provider is set before any route evaluates one
  await setupFlags(envFlagsOn(), envFlagValues())

  const legalDocs = await loadLegal(process.env.LEGAL_DIR, legalValues(process.env))
  for (const [doc, { missing }] of Object.entries(legalDocs)) {
    if (missing.length) app.log.warn({ doc, missing }, 'legal text has unfilled placeholders')
  }

  await app.register(fastifyWebsocket, { options: { maxPayload: WS_MAX_PAYLOAD } })
  // RATE_LIMIT_MAX: the e2e stack raises it, since every test browser shares one IP
  await app.register(rateLimit, { max: Number(process.env.RATE_LIMIT_MAX) || 1000, timeWindow: '1 minute' })

  // API docs: our spec plus better-auth's generated one, in one Swagger UI
  if (!isOpenApiDocument(bundledSpec)) throw new Error('schema/api-v1.bundled.json is not an OpenAPI document')
  await app.register(fastifySwagger, { mode: 'static', specification: { document: bundledSpec } })
  // @fastify/swagger-ui@4.2.0 builds asset links as `.${routePrefix}/static/...`, assuming a
  // single-segment routePrefix; with routePrefix: '/api/docs' that resolves (relative to the
  // no-trailing-slash document URL /api/docs) to /api/api/docs/static/... → 404s, leaving the
  // UI blank. Registering it with routePrefix: '/docs' inside an '/api'-prefixed scope keeps the
  // public URLs identical (/api/docs, /api/docs/json, /api/docs/static/*) while the generated
  // relative links become `./docs/static/...`, which resolves correctly to /api/docs/static/....
  await app.register(
    async api => {
      await api.register(fastifySwaggerUi, {
        routePrefix: '/docs',
        uiConfig: swaggerUiConfig,
      })
    },
    { prefix: '/api' },
  )

  app.all('/api/auth/*', async (req, reply) => {
    // better-auth only trusts a single-valued X-Forwarded-For, never the socket; req.ip is
    // Fastify's own resolution (honouring TRUST_PROXY). Overwrite unconditionally — a client-sent
    // value here must not survive, or it could be spoofed into hitting someone else's rate limit.
    req.raw.headers['x-dartcade-client-ip'] = req.ip
    // Fastify consumes the body stream; expose parsed body so better-call's fallback can re-serialize it
    if (req.body !== undefined) Object.assign(req.raw, { body: req.body })
    // better-call throws on a malformed Host or X-Forwarded-Proto; unhandled, that would exit Node
    toNodeHandler(auth)(req.raw, reply.raw).catch((err: unknown) => {
      req.log.warn({ err }, 'auth request failed')
      if (reply.raw.headersSent) return reply.raw.end()
      reply.raw.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'bad request' }))
    })
    return reply.hijack()
  })

  if (frontendDist) {
    try {
      await app.register(fastifyStatic, { root: frontendDist, wildcard: false, index: false })
    } catch {
      /* not built yet */
    }
  }

  await app.register(bridgeGwPlugin, {
    engine,
    db,
    onBoardPresence: boardId => {
      lobbies.onBoardPresence(boardId)
      bigScreen.onBoardPresence(boardId)
    },
    onBoardStatus: (ownerUserId, boardId, online) => {
      hub.sendBoardStatus(ownerUserId, boardId, online)
    },
    onBigScreenStartup: boardId =>
      autoOpenBigScreen(db, boardId, bigScreen, (message, details) => {
        app.log.warn({ details }, message)
      }),
    onCameraStill: (boardId, cam, version) => {
      pushCamera(engine, boardId, cam, version)
    },
    // Returned (not discarded with `void`): callHook only catches a rejection it can see, so a
    // thrown/rejected hook is logged there instead of becoming an unhandled rejection.
    onBridgeHello: lights ? boardId => lights.onBridgeHello(boardId) : undefined,
    onBoardEvent: lights ? (boardId, kind, data) => lights.onBoardEvent(boardId, kind, data) : undefined,
    onLightsFound: lights
      ? (boardId, found) =>
          rehostWledDevices(db, boardId, found).then(changed => {
            if (changed) return lights.devicesChanged(boardId)
          })
      : undefined,
  })
  await app.register(browserGwPlugin, { engine, isLobbyMember: (lobbyId, userId) => lobbies.isMember(lobbyId, userId) })
  await app.register(lobbyGwPlugin, { lobbies, hub, friends, matchmaking })
  await app.register(bigScreenGwPlugin, { db, service: bigScreen })
  await app.register(sessionsApiPlugin, { engine, db, isLobbyMember: (lobbyId, userId) => lobbies.isMember(lobbyId, userId) })
  await app.register(usersApiPlugin, { db })
  await app.register(meApiPlugin, {
    db,
    onChanged: userId => {
      friends.touch([userId])
    },
    onRenamed: (userId, name) => lobbies.renamed(userId, name),
    onAvatarChanged: userId => lobbies.profileChanged(userId),
  })
  await app.register(lobbiesApiPlugin, { lobbies })
  await app.register(gamesApiPlugin, { db })
  await app.register(ofrepApiPlugin, { db })
  await app.register(previewApiPlugin, { preview: parsePreview(process.env) })
  const feedbackTo = feedbackAddress(process.env)
  await app.register(authInfoApiPlugin, {
    mail: mailConfig.smtpUrl !== null,
    verification: mailConfig.verification,
    contactEmail: legalValues(process.env).contactEmail?.trim() || null,
    feedback: mailer !== null && feedbackTo !== null,
  })
  await app.register(feedbackApiPlugin, { db, mailer, to: feedbackTo })
  await app.register(legalApiPlugin, { docs: legalDocs })
  // Asked once now, so the Boards page knows of an update on its first load
  const releases = bridgeReleases(buildInfo(process.env).version)
  void releases.refresh()
  await app.register(boardsApiPlugin, {
    db,
    releaseBoard: boardId => lobbies.releaseBoard(boardId),
    getSessionByBoard: boardId => engine.getSessionByBoard(boardId),
    isLobbyMember: (lobbyId, userId) => lobbies.isMember(lobbyId, userId),
    bridgeReleases: releases,
    bigScreen,
  })
  await app.register(lightsApiPlugin, { db, lights })
  await app.register(pairingApiPlugin, { db })
  await app.register(voicesApiPlugin, { db })
  await app.register(friendsApiPlugin, { friends })
  await app.register(rankedApiPlugin, { db })
  await app.register(homeApiPlugin, { db })
  await app.register(progressApiPlugin, { db })
  await app.register(minigolfCoursesApiPlugin, { db })
  await app.register(adminUsersApiPlugin, {
    db,
    onBanned: userId =>
      applyBan(
        {
          engine,
          lobbies,
          closeSockets: (id, code, reason) => {
            hub.closeUser(id, code, reason)
            browserConnections.closeUser(id, code, reason)
          },
          goOffline: id => friends.dropPresence(id),
        },
        userId,
      ),
  })
  await app.register(adminGamesApiPlugin, { db })
  // The lights flag changed: boards with strips are darkened (off) or get their devices back (on)
  const onFlagChanged = lights
    ? (key: string) => {
        if (key !== 'lights.enabled') return
        void boardsWithWledDevices(db)
          .then(ids => Promise.all(ids.map(id => lights.devicesChanged(id))))
          .catch((err: unknown) => app.log.warn({ err }, 'lights flag change failed'))
      }
    : undefined
  await app.register(adminFlagsApiPlugin, { db, onFlagChanged })
  await app.register(systemApiPlugin, {
    db,
    live: async () => {
      const { bridges, boards } = bridgeConnections.counts()
      return {
        browsers: browserConnections.socketCount() + hub.socketCount(),
        bridges,
        boardsOnline: boards,
        runningGames: engine.getAllSessions().filter(s => s.status === 'active').length,
        openLobbies: (await getOpenLobbyIds(db)).length,
      }
    },
  })
  await app.register(matchmakingApiPlugin, { db, matchmaking })

  // Any unmatched method+path under our reserved prefixes gets our ErrorResponse 404
  // (not Fastify's default `{ message, error: 'Not Found', statusCode }`); an unmatched
  // GET elsewhere falls through to the SPA's index.html for client-side routing.
  app.setNotFoundHandler((req, reply) => {
    const reserved = req.url.startsWith('/api') || req.url.startsWith('/ws') || req.url.startsWith('/bridge')
    if (!reserved && req.method === 'GET' && indexHtml) {
      return reply.header('cache-control', 'no-cache').type('text/html').send(indexHtml)
    }
    return reply.code(404).send({ error: 'not found' })
  })

  return app
}
