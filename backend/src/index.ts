import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { db } from './db/index.js'
import { runMigrations } from './db/queries.js'
import { SessionEngine, createEngineStore } from './session/engine.js'
import { forgetSession, pushNotice, pushSnapshot } from './browser-gw/handler.js'
import { seedDev } from './auth/seed.js'
import { buildApp } from './app.js'
import { LobbyHub } from './lobby/hub.js'
import { LobbyService } from './lobby/service.js'
import { bridgeConnections } from './bridge-gw/connections.js'
import { FriendsService } from './friends/service.js'
import { seatedGame } from './friends/status.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DATABASE_URL =
  process.env.DATABASE_URL ??
  (process.env.PGHOST
    ? `postgres://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT ?? 5432}/${process.env.PGDATABASE}`
    : undefined)
const PORT = parseInt(process.env.PORT ?? '3000', 10)

if (!DATABASE_URL) throw new Error('DATABASE_URL or PG* env vars are required')

await runMigrations(db)
await seedDev()

const hub = new LobbyHub()
// The rebuild below can already warn (a log entry that won't parse), before the app and its
// logger exist: until then warnings go to the console
let warn = (message: string, details: unknown) => {
  console.warn(message, details)
}
// The other callbacks only run after the engine and the lobbies exist
const engine: SessionEngine = new SessionEngine(
  createEngineStore(db),
  sessionId => {
    pushSnapshot(sessionId, engine)
    lobbies.onSessionPush(sessionId).catch((err: unknown) => {
      warn('lobby indicator push failed', { sessionId, error: String(err) })
    })
  },
  (message, details) => {
    warn(message, details)
  },
  (sessionId, userIds, notice) => {
    pushNotice(sessionId, userIds, notice)
  },
  ended => lobbies.onGameEnded(ended),
  started => lobbies.onGameStarted(started),
  { forgotten: forgetSession },
)
const friends = new FriendsService({
  db,
  hub,
  gameOf: userId => seatedGame(engine.getSessionByUser(userId), userId),
  warn: (message, details) => {
    warn(message, details)
  },
})
const lobbies: LobbyService = new LobbyService({
  db,
  engine,
  hub,
  isBoardOnline: boardId => bridgeConnections.isOnline(boardId),
  warn: (message, details) => {
    warn(message, details)
  },
  onStatusChange: userIds => {
    friends.touch(userIds)
  },
})
await engine.rebuild()
// A game that ended while the server was down never told its lobby: settle the lobbies now
await lobbies.settleAll()
// Lobbies with no game running close after hours without activity: 6 h with one account,
// 24 h with several (lobby/service.ts, SOLO_IDLE_MS and SHARED_IDLE_MS)
const idleSweep = setInterval(
  () => {
    lobbies.closeIdleLobbies().catch((err: unknown) => {
      warn('idle lobby sweep failed', { error: String(err) })
    })
  },
  5 * 60 * 1000,
)
idleSweep.unref()

const app = await buildApp({ engine, db, lobbies, hub, friends, frontendDist: join(__dirname, '../../frontend/dist') })
warn = (message, details) => {
  app.log.warn({ details }, message)
}
// Stopping: no idle sweep, friends pushes, grace or debounce timers left running
app.addHook('onClose', (_instance, done) => {
  clearInterval(idleSweep)
  friends.close()
  done()
})
await app.listen({ port: PORT, host: '0.0.0.0' })
