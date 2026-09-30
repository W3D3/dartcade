import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import type { RawData } from 'ws'
import { Ajv } from 'ajv'
import { BrowserConnections } from './connections.js'
import type { SessionEngine } from '../session/engine.js'
import { getAuthUser } from '../auth/session.js'
import { canAccessSession } from '../api/sessions.js'
import wsSchema from '../schema/game-ws-v1.deref.json' with { type: 'json' }
import { WsCloseCode, type ClientMessage, type Segment, type UserAction } from '../schema/game-ws.js'
import { checkSnapshot } from '../session/snapshotValidation.js'
import { isRecord, isString } from '../guards.js'

export const browserConnections = new BrowserConnections()

// Tolerant reader: newer clients may add fields; only the shape (which action types
// exist, which fields are required) is validated here. isClientMessage's relaxed
// additionalProperties still lets those extra fields *through* Ajv — sanitizeAction
// below is what actually drops them before the engine/snapshot ever see them.
// (Ajv's removeAdditional can't be used: it strips fields while trying each oneOf branch.)
function allowExtraFields(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(allowExtraFields)
  if (schema && typeof schema === 'object') {
    return Object.fromEntries(Object.entries(schema).map(([k, v]) =>
      [k, k === 'additionalProperties' && v === false ? true : allowExtraFields(v)]))
  }
  return schema
}
const clientMessageSchema = allowExtraFields(wsSchema.$defs.ClientMessage)
if (!isRecord(clientMessageSchema)) throw new Error('ClientMessage schema is not an object')
const isClientMessage = new Ajv({ strict: false }).compile<ClientMessage>(clientMessageSchema)

// ws hands over a Buffer (its default binaryType); the other forms are handled for completeness
function rawText(raw: RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString()
  return Buffer.isBuffer(raw) ? raw.toString() : Buffer.from(raw).toString()
}

// Rebuilds the action from only its spec'd fields, dropping anything a newer/buggy
// client added (including inside `segment`, whose own `additionalProperties: false`
// was loosened by allowExtraFields above) before it reaches the engine and gets
// persisted/pushed in snapshots.
function sanitizeSegment(segment: Segment): Segment {
  const { name, number, bed, multiplier } = segment
  return { name, number, bed, multiplier }
}
function sanitizeCoords(coords: { x: number; y: number }): { x: number; y: number } {
  const { x, y } = coords
  return { x, y }
}
function sanitizeAction(action: UserAction): UserAction {
  switch (action.type) {
    case 'add_dart':
      return {
        type: 'add_dart', segment: sanitizeSegment(action.segment),
        ...(action.coords ? { coords: sanitizeCoords(action.coords) } : {}),
      }
    case 'correct_dart':
      return {
        type: 'correct_dart', visitIndex: action.visitIndex, segment: sanitizeSegment(action.segment),
        ...(action.coords ? { coords: sanitizeCoords(action.coords) } : {}),
      }
    case 'undo_dart':
    case 'takeout':
    case 'bulloff_skip':
    case 'bulloff_rethrow':
    case 'bulloff_start':
      return { type: action.type }
  }
}

type Opts = FastifyPluginOptions & { engine: SessionEngine }

export function browserGwPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { engine } = opts

  app.get('/ws', { websocket: true }, (connection: SocketStream, req) => {
    const socket = connection.socket

    getAuthUser(req).then(user => {
      if (!user) {
        socket.close(WsCloseCode.Unauthorized, 'unauthorized')
        return
      }

      const sessionId = isRecord(req.query) && isString(req.query.sessionId) ? req.query.sessionId : undefined
      if (!sessionId) { socket.close(WsCloseCode.MissingSession, 'missing sessionId'); return }

      const session = engine.getSession(sessionId)
      const snap = engine.getSnapshot(sessionId)
      if (!session || !snap) { socket.close(WsCloseCode.NotFound, 'session not found'); return }
      if (!canAccessSession(user.userId, session)) { socket.close(WsCloseCode.Forbidden, 'forbidden'); return }

      browserConnections.add(sessionId, socket)
      checkSnapshot(snap, msg => app.log.error(msg))
      socket.send(JSON.stringify(snap))

      const onMessage = async (raw: RawData) => {
        let msg: unknown
        try { msg = JSON.parse(rawText(raw)) } catch {
          app.log.warn({ sessionId }, 'ignoring non-JSON client message')
          return
        }
        // Invalid messages are dropped, not fatal: a buggy client shouldn't kick a player out
        if (!isClientMessage(msg)) {
          app.log.warn({ sessionId, errors: isClientMessage.errors }, 'ignoring invalid client message')
          return
        }
        await engine.onUserAction(sessionId, sanitizeAction(msg.action))
      }
      socket.on('message', (raw: RawData) => { void onMessage(raw) })

      socket.on('close', () => browserConnections.remove(sessionId, socket))
      socket.on('error', () => browserConnections.remove(sessionId, socket))
    }).catch(() => { socket.close(WsCloseCode.InternalError, 'internal error') })
  })
  done()
}

export function pushSnapshot(sessionId: string, engine: SessionEngine): void {
  const snap = engine.getSnapshot(sessionId)
  if (!snap) return
  checkSnapshot(snap, msg => console.error(msg))
  browserConnections.push(sessionId, snap)
}
