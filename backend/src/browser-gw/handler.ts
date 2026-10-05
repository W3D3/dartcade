import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import type { RawData } from 'ws'
import { z } from 'zod'
import { BrowserConnections } from './connections.js'
import type { Notice, SessionEngine, SnapshotView } from '../session/engine.js'
import { withAuthedSocket, socketQuery } from './authedSocket.js'
import { isOpen, onceGone } from '../util/socket.js'
import { canWatchSession, noLobbies, type IsLobbyMember } from '../session/access.js'
import { bridgeConnections } from '../bridge-gw/connections.js'
import { WsCloseCode, type CameraMessage, type ErrorMessage, type NoticeMessage } from '../schema/game-ws.js'
import { cameraStills, type CameraStills } from '../camera/store.js'
import { ClientMessageSchema } from '../schema/zod.js'
import { checkSnapshot } from '../session/snapshotValidation.js'

export const browserConnections = new BrowserConnections()

// Tolerant reader: the zod schema (generated from schema/game-ws-v1.json) strips fields a
// newer or buggy client adds, at every level, before the action reaches the engine and
// gets persisted or pushed in snapshots.
const SessionQuerySchema = z.object({ sessionId: z.string().min(1) })

// ws hands over a Buffer (its default binaryType); the other forms are handled for completeness
function rawText(raw: RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString()
  return Buffer.isBuffer(raw) ? raw.toString() : Buffer.from(raw).toString()
}

type Opts = FastifyPluginOptions & {
  engine: SessionEngine
  isLobbyMember?: IsLobbyMember
  /** Camera stills of the boards (tests pass their own). */
  stills?: CameraStills
}

export function browserGwPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { engine, isLobbyMember = noLobbies, stills = cameraStills } = opts

  app.get('/ws', { websocket: true }, (connection: SocketStream, req) => {
    withAuthedSocket(connection, req, async (socket, userId) => {
      const query = socketQuery(socket, req.query, SessionQuerySchema, 'missing sessionId')
      if (!query) return
      const { sessionId } = query

      const session = engine.getSession(sessionId)
      if (!session) {
        socket.close(WsCloseCode.NotFound, 'session not found')
        return
      }
      if (!(await canWatchSession(userId, session, isLobbyMember))) {
        socket.close(WsCloseCode.Forbidden, 'forbidden')
        return
      }
      // Closed while access was checked: no close event will come to remove it again
      if (!isOpen(socket)) return

      browserConnections.add(sessionId, socket, userId)
      const snap = engine.getSnapshot(sessionId, viewFor(sessionId, userId))
      if (!snap) {
        browserConnections.remove(sessionId, socket)
        socket.close(WsCloseCode.NotFound, 'session not found')
        return
      }
      checkSnapshot(snap, msg => app.log.error(msg))
      socket.send(JSON.stringify(snap))
      // The game's boards' camera stills so far; new ones follow as they come (pushCamera)
      for (const boardId of new Set(session.seats.flatMap(s => s.boardId ?? []))) {
        for (const { cam, version } of stills.versions(boardId)) {
          socket.send(JSON.stringify({ type: 'camera', boardId, cam, version } satisfies CameraMessage))
        }
      }
      // The others see this player connect
      pushSnapshot(sessionId, engine)

      const onMessage = async (raw: RawData) => {
        let msg: unknown
        try {
          msg = JSON.parse(rawText(raw))
        } catch {
          app.log.warn({ sessionId }, 'ignoring non-JSON client message')
          return
        }
        // Invalid messages are dropped, not fatal: a buggy client shouldn't kick a player out
        const parsed = ClientMessageSchema.safeParse(msg)
        if (!parsed.success) {
          app.log.warn({ sessionId, issues: parsed.error.issues }, 'ignoring invalid client message')
          return
        }
        // A failed store write (e.g. the input log) must not crash the server or close the
        // socket: the action is not applied and the player can try again
        try {
          const res = await engine.onUserAction(sessionId, userId, parsed.data.action)
          if (!res.ok)
            socket.send(JSON.stringify({ type: 'error', code: res.code, action: parsed.data.action.type } satisfies ErrorMessage))
        } catch (err: unknown) {
          app.log.error({ sessionId, action: parsed.data.action.type, err }, 'user action not applied')
        }
      }
      socket.on('message', (raw: RawData) => {
        void onMessage(raw)
      })

      // The others see this player drop
      onceGone(socket, () => {
        browserConnections.remove(sessionId, socket)
        // A game that's gone has nobody to wait for (forgetSession ran before this socket closed)
        if (!engine.getSession(sessionId)) browserConnections.forget(sessionId)
        pushSnapshot(sessionId, engine)
      })
    })
  })
  done()
}

function viewFor(sessionId: string, userId: string): SnapshotView {
  return {
    viewerUserId: userId,
    connectedUserIds: browserConnections.connectedUsers(sessionId),
    disconnectedAt: u => browserConnections.disconnectedAt(sessionId, u),
    isBoardOnline: b => bridgeConnections.isOnline(b),
  }
}

/** The engine forgot the game: nobody's leaving time for it is needed any more. */
export function forgetSession(sessionId: string): void {
  browserConnections.forget(sessionId)
}

/** Sends every viewer of the game their own snapshot. */
export function pushSnapshot(sessionId: string, engine: SessionEngine): void {
  // The viewers' snapshots differ only in viewer fields: check the first one, log it once
  let checked = false
  browserConnections.pushEach(sessionId, userId => {
    const snap = engine.getSnapshot(sessionId, viewFor(sessionId, userId))
    if (snap && !checked) {
      checked = true
      checkSnapshot(snap, msg => console.error(msg))
    }
    return snap ?? null
  })
}

/** Tells every viewer of the board's game that it has a new camera still. */
export function pushCamera(engine: SessionEngine, boardId: string, cam: number, version: number): void {
  const session = engine.getSessionByBoard(boardId)
  if (!session) return
  const msg: CameraMessage = { type: 'camera', boardId, cam, version }
  browserConnections.pushEach(session.id, () => msg)
}

export function pushNotice(sessionId: string, userIds: string[], notice: Notice): void {
  browserConnections.sendTo(sessionId, userIds, notice satisfies NoticeMessage)
}
