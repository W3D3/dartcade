import type { FastifyInstance, FastifyPluginOptions, FastifyReply } from 'fastify'
import { ulid } from 'ulid'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { WsCloseCode } from '../schema/game-ws.js'
import type { BigScreenService } from '../bigscreen/service.js'
import { requireAuth } from '../auth/middleware.js'
import { bridgeConnections, type BmRequest } from '../bridge-gw/connections.js'
import { askBoard, BM_TIMEOUT_MS, stateOf } from '../boards/bmState.js'
import {
  getBoardsByOwner,
  insertBoard,
  getBoardById,
  deleteBoard,
  renameBoard,
  setAutoStart,
  setResetOnNext,
  setBigScreenMode,
  hasActiveSessionOnBoard,
} from '../db/queries.js'
import { bigScreenState as defaultBigScreenState, type BigScreenState } from '../boards/bigScreenState.js'
import { openBigScreen, stopBigScreen } from '../boards/bigScreenOpen.js'
import { findOwnBoard } from '../boards/own.js'
import { newBoardToken } from '../boards/token.js'
import { fromSpec } from './spec.js'
import { cameraStills, type CameraStills } from '../camera/store.js'
import { canWatchSession, noLobbies, type IsLobbyMember } from '../session/access.js'
import type { Session } from '../session/types.js'
import type { Route } from './route.js'
import { bridgeUpdateFor, type BridgeReleases } from '../boards/bridgeRelease.js'
import { bridgeUpdates as defaultBridgeUpdates, type BridgeUpdates } from '../boards/bridgeUpdate.js'

const bigScreenOff = (reply: FastifyReply) => reply.code(409).send({ error: 'the big screen is off for this board' })

type Opts = FastifyPluginOptions & {
  db: Kysely<Database>
  releaseBoard?: (boardId: string) => Promise<void>
  /** The active game on a board (SessionEngine.getSessionByBoard): its watchers see the board's camera stills. */
  getSessionByBoard?: (boardId: string) => Session | undefined
  isLobbyMember?: IsLobbyMember
  /** Camera stills of the boards (tests pass their own). */
  stills?: CameraStills
  /** How long the live camera route waits for the bridge's frame (5 s; the bridge gives the camera 3 s). */
  liveCameraTimeoutMs?: number
  /** The bridge release this server offers (none without it). */
  bridgeReleases?: Pick<BridgeReleases, 'offered'>
  /** The boards' Update bridge progress (tests pass their own). */
  bridgeUpdates?: BridgeUpdates
  /** Cuts off open big-screen token sockets when the token is revoked or the board deleted. */
  bigScreen: Pick<BigScreenService, 'revoke'>
  /** What the boards' helpers reported (tests pass their own). */
  bigScreenState?: BigScreenState
}

// A still asked for by its current version never changes
const CACHE_FOR_GOOD = 'private, max-age=31536000, immutable'

// Board Manager commands, made by the bridge (bridge/internal/bm/relay.go): [operationId, route suffix and op]
const ACTIONS = [
  ['startBoard', 'start'],
  ['stopBoard', 'stop'],
  ['resetBoard', 'reset'],
  ['calibrateBoard', 'calibrate'],
] as const

export function boardsApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const {
    db,
    releaseBoard = () => Promise.resolve(),
    getSessionByBoard = () => undefined,
    isLobbyMember = noLobbies,
    stills = cameraStills,
    liveCameraTimeoutMs = 5000,
    bridgeReleases = { offered: () => null },
    bridgeUpdates = defaultBridgeUpdates,
    bigScreen,
    bigScreenState = defaultBigScreenState,
  } = opts

  /** The board if it exists and belongs to the user; otherwise sends 404/403 and returns null. */
  async function ownBoard(id: string, userId: string, reply: { code(n: number): { send(b: { error: string }): unknown } }) {
    const own = await findOwnBoard(db, id, userId)
    if ('board' in own) return own.board
    if (own.problem === 'not_found') reply.code(404).send({ error: 'not found' })
    else reply.code(403).send({ error: 'forbidden' })
    return null
  }

  /** Has the board's bridge make a Board Manager call; on failure sends 503/502 and returns null. */
  async function callBoard(
    id: string,
    req: BmRequest,
    timeoutMs: number,
    reply: { code(n: number): { send(b: { error: string }): unknown } },
  ) {
    const answer = await askBoard(id, req, timeoutMs)
    if (!answer.ok) {
      reply.code(answer.code).send({ error: answer.error })
      return null
    }
    return answer.res
  }

  app.get<Route<'listBoards'>>('/api/boards', { preValidation: requireAuth, schema: fromSpec('listBoards') }, async req => {
    const rows = await getBoardsByOwner(db, req.userId)
    const offered = bridgeReleases.offered()
    return {
      boards: rows.map(b => {
        const conn = bridgeConnections.get(b.id)
        const screen = bigScreenState.get(b.id)
        const bm = conn?.bmUrl
          ? (() => {
              try {
                return new URL(conn.bmUrl)
              } catch {
                return null
              }
            })()
          : null
        return {
          id: b.id,
          name: b.name,
          hardwareId: b.hardware_id,
          online: bridgeConnections.isOnline(b.id),
          bridgeVersion: conn?.bridgeVersion ?? null,
          bmVersion: conn?.bmVersion ?? null,
          createdAt: new Date(b.created_at).toISOString(),
          ip: bm?.hostname ?? null,
          // Full Board Manager origin (incl. port) for linking
          bmUrl: bm?.origin ?? null,
          autoStart: b.auto_start,
          resetOnNext: b.reset_on_next,
          bigScreen: { mode: b.big_screen_mode, running: screen.running, helper: screen.helper },
          bridgeUpdate: {
            available: bridgeUpdateFor(conn?.bridgeVersion, offered),
            updatable: conn?.bridgeUpdatable ?? false,
            status: bridgeUpdates.get(b.id) ?? undefined,
          },
        }
      }),
    }
  })

  // The latest camera still the bridge sent: for the owner and anyone who may watch the board's game
  app.get<Route<'getBoardCamera'>>(
    '/api/boards/:id/camera/:index',
    { preValidation: requireAuth, schema: fromSpec('getBoardCamera') },
    async (req, reply) => {
      const { id, index } = req.params
      const board = await getBoardById(db, id)
      if (!board) return reply.code(404).send({ error: 'not found' })
      const session = getSessionByBoard(id)
      const allowed =
        board.owner_user_id === req.userId || (session !== undefined && (await canWatchSession(req.userId, session, isLobbyMember)))
      if (!allowed) return reply.code(403).send({ error: 'forbidden' })
      const still = stills.get(id, index)
      if (!still) return reply.code(404).send({ error: 'no camera still yet' })
      reply.header('content-type', still.contentType)
      reply.header('cache-control', req.query.v === still.version ? CACHE_FOR_GOOD : 'no-store')
      return reply.send(still.bytes)
    },
  )

  // The camera's live raw frame, fetched by the bridge from the Board Manager: for the owner setting up the board
  app.get<Route<'getBoardCameraLive'>>(
    '/api/boards/:id/camera/:index/live',
    { preValidation: requireAuth, schema: fromSpec('getBoardCameraLive') },
    async (req, reply) => {
      const { id, index } = req.params
      if (!(await ownBoard(id, req.userId, reply))) return reply
      const res = await callBoard(id, { op: 'camera', cam: index }, liveCameraTimeoutMs, reply)
      if (!res) return reply
      // The bridge sends a frame only when the camera answered with an image
      if (!res.image) return reply.code(502).send({ error: 'camera unavailable' })
      const frame = Buffer.from(res.image, 'base64')
      reply.header('content-type', 'image/jpeg')
      reply.header('cache-control', 'no-store')
      return reply.send(frame)
    },
  )

  app.post<Route<'createBoard'>>('/api/boards', { preValidation: requireAuth, schema: fromSpec('createBoard') }, async (req, reply) => {
    const name = req.body.name.trim()
    const { token, tokenHash } = newBoardToken()
    const id = ulid()
    await insertBoard(db, { id, owner_user_id: req.userId, name, token_hash: tokenHash })
    return reply.code(201).send({ id, name, token })
  })

  app.patch<Route<'renameBoard'>>(
    '/api/boards/:id',
    { preValidation: requireAuth, schema: fromSpec('renameBoard') },
    async (req, reply) => {
      const { id } = req.params
      const name = req.body.name.trim()
      if (!(await ownBoard(id, req.userId, reply))) return reply
      await renameBoard(db, id, name)
      return reply.send({ id, name })
    },
  )

  app.patch<Route<'setBoardAutoStart'>>(
    '/api/boards/:id/auto-start',
    { preValidation: requireAuth, schema: fromSpec('setBoardAutoStart') },
    async (req, reply) => {
      const { id } = req.params
      const { autoStart } = req.body
      if (!(await ownBoard(id, req.userId, reply))) return reply
      await setAutoStart(db, id, autoStart)
      return reply.send({ autoStart })
    },
  )

  app.patch<Route<'setBoardResetOnNext'>>(
    '/api/boards/:id/reset-on-next',
    { preValidation: requireAuth, schema: fromSpec('setBoardResetOnNext') },
    async (req, reply) => {
      const { id } = req.params
      const { resetOnNext } = req.body
      if (!(await ownBoard(id, req.userId, reply))) return reply
      await setResetOnNext(db, id, resetOnNext)
      return reply.send({ resetOnNext })
    },
  )

  app.patch<Route<'setBigScreenMode'>>(
    '/api/boards/:id/big-screen',
    { preValidation: requireAuth, schema: fromSpec('setBigScreenMode') },
    async (req, reply) => {
      const { id } = req.params
      const { mode } = req.body
      if (!(await ownBoard(id, req.userId, reply))) return reply
      await setBigScreenMode(db, id, mode)
      if (mode === 'off') await stopBigScreen(db, id, bigScreen)
      return reply.send({ id, mode })
    },
  )

  // Start and Stop work on the helper through the bridge; neither does anything while the setting is off
  app.post<Route<'startBigScreen'>>(
    '/api/boards/:id/big-screen/start',
    { preValidation: requireAuth, schema: fromSpec('startBigScreen') },
    async (req, reply) => {
      const { id } = req.params
      const board = await ownBoard(id, req.userId, reply)
      if (!board) return reply
      const res = await openBigScreen(db, board, bigScreen, (message, details) => {
        req.log.warn({ details }, message)
      })
      if (res === 'off') return bigScreenOff(reply)
      if (res === 'disabled') return reply.code(403).send({ error: 'forbidden' })
      if (res === 'offline') return reply.code(409).send({ error: 'board offline' })
      if (res === 'no_url') return reply.code(409).send({ error: 'the server has no public URL (PUBLIC_URL) to open' })
      return reply.send({ running: true })
    },
  )

  // Stop always drops the token and cuts open sockets, even when the bridge is away to close the window
  app.post<Route<'stopBigScreen'>>(
    '/api/boards/:id/big-screen/stop',
    { preValidation: requireAuth, schema: fromSpec('stopBigScreen') },
    async (req, reply) => {
      const { id } = req.params
      const board = await ownBoard(id, req.userId, reply)
      if (!board) return reply
      if (board.big_screen_mode === 'off') return bigScreenOff(reply)
      await stopBigScreen(db, id, bigScreen)
      return reply.send({ running: false })
    },
  )

  // Recent bridge events for the live feed (in-memory, newest last)
  app.get<Route<'getBoardEvents'>>(
    '/api/boards/:id/events',
    { preValidation: requireAuth, schema: fromSpec('getBoardEvents') },
    async (req, reply) => {
      const { id } = req.params
      if (!(await ownBoard(id, req.userId, reply))) return reply
      return reply.send({ events: bridgeConnections.recentEvents(id) })
    },
  )

  // Per-board BM status
  app.get<Route<'getBoardStatus'>>(
    '/api/boards/:id/status',
    { preValidation: requireAuth, schema: fromSpec('getBoardStatus') },
    async (req, reply) => {
      const { id } = req.params
      if (!(await ownBoard(id, req.userId, reply))) return reply
      const res = await callBoard(id, { op: 'state' }, BM_TIMEOUT_MS, reply)
      if (!res) return reply
      const state = stateOf(res)
      if (!state) return reply.code(502).send({ error: `Board Manager answered ${res.status}` })
      return reply.send(state)
    },
  )

  // Per-board BM actions
  for (const [operationId, action] of ACTIONS) {
    app.post<Route<typeof operationId>>(
      `/api/boards/:id/${action}`,
      { preValidation: requireAuth, schema: fromSpec(operationId) },
      async (req, reply) => {
        const { id } = req.params
        if (!(await ownBoard(id, req.userId, reply))) return reply
        const res = await callBoard(id, { op: action }, BM_TIMEOUT_MS, reply)
        if (!res) return reply
        if (res.status < 200 || res.status >= 300) return reply.code(502).send({ error: `Board Manager answered ${res.status}` })
        return reply.send({ status: res.status })
      },
    )
  }

  // Update bridge: the bridge downloads and verifies the release itself; it only ever gets the
  // version this server offers, never one from the request
  app.post<Route<'updateBridge'>>(
    '/api/boards/:id/bridge-update',
    { preValidation: requireAuth, schema: fromSpec('updateBridge') },
    async (req, reply) => {
      const { id } = req.params
      if (!(await ownBoard(id, req.userId, reply))) return reply
      const conn = bridgeConnections.get(id)
      if (!conn?.helloReceived) return reply.code(503).send({ error: 'board offline' })
      const version = bridgeUpdateFor(conn.bridgeVersion, bridgeReleases.offered())
      if (!version) return reply.code(409).send({ error: 'the bridge is up to date' })
      if (!conn.bridgeUpdatable) return reply.code(409).send({ error: 'this bridge cannot update itself: run its install command again' })
      if (bridgeUpdates.inFlight(id)) return reply.code(409).send({ error: 'an update is already running' })
      if (!bridgeConnections.send(id, { kind: 'bridge.update', data: { version } })) return reply.code(503).send({ error: 'board offline' })
      return reply.code(202).send(bridgeUpdates.request(id, version))
    },
  )

  app.delete<Route<'deleteBoard'>>(
    '/api/boards/:id',
    { preValidation: requireAuth, schema: fromSpec('deleteBoard') },
    async (req, reply) => {
      const { id } = req.params
      if (!(await ownBoard(id, req.userId, reply))) return reply
      if (await hasActiveSessionOnBoard(db, id)) return reply.code(409).send({ error: 'board has a game running' })
      // Lobbies first: people on the board go to Manual, and their lobbies see it
      await releaseBoard(id)
      await deleteBoard(db, id)
      await stopBigScreen(db, id, bigScreen, WsCloseCode.NotFound)
      stills.clear(id)
      return reply.code(204).send()
    },
  )

  done()
}
