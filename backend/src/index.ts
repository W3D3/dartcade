import { join, dirname } from 'path'
import { loadFlagUser, modeAvailable } from './flags/index.js'
import { fileURLToPath } from 'url'
import { db, takeInstanceLock, url as dbUrl } from './db/index.js'
import { deletePairingCodesExpiredBefore, runMigrations } from './db/queries.js'
import { listCourses, publishedCourse, publishedOfficialHoles, seedOfficialCourses } from './db/minigolfCourses.js'
import { setCourseSource } from './games/minigolfCourseSource.js'
import { SessionEngine, createEngineStore } from './session/engine.js'
import { forgetSession, pushNotice, pushSnapshot } from './browser-gw/handler.js'
import { seedDev } from './auth/seed.js'
import { buildApp } from './app.js'
import { LobbyHub } from './lobby/hub.js'
import { LobbyService } from './lobby/service.js'
import { bridgeConnections } from './bridge-gw/connections.js'
import { FriendsService } from './friends/service.js'
import { seatedGame } from './friends/status.js'
import { initPhysics3d } from './shared/minigolf/3d/physics3d.js'
import { closePool, warmPool } from './games/minigolfPool.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PORT = parseInt(process.env.PORT ?? '3000', 10)

// shortcut: lobby start serialization, one game per user/lobby/board and presence live in this
// process's memory, so one backend per database; move them to Postgres before running replicas
if (!(await takeInstanceLock(dbUrl))) {
  console.error('Another dartcade backend is already running on this database. Stop it first: only one may run at a time.')
  process.exit(1)
}

// Rapier's WASM: Minigolf's 3D shots are simulated synchronously, from the rebuild below on
await initPhysics3d()
warmPool()
await runMigrations(db)
await seedOfficialCourses(db)
setCourseSource({
  course: id => publishedCourse(db, id),
  officialHoles: () => publishedOfficialHoles(db),
  officialCourses: async () =>
    (await listCourses(db, { drafts: false })).flatMap(c => (c.published ? [{ id: c.id, name: c.published.name }] : [])),
})
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
  gameAvailable: async (userId, gameId) => modeAvailable(gameId, await loadFlagUser(db, userId)),
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
// 24 h with several (lobby/service.ts, SOLO_IDLE_MS and SHARED_IDLE_MS). Pairing codes go
// an hour after they expired.
const idleSweep = setInterval(
  () => {
    lobbies.closeIdleLobbies().catch((err: unknown) => {
      warn('idle lobby sweep failed', { error: String(err) })
    })
    deletePairingCodesExpiredBefore(db, new Date(Date.now() - 60 * 60 * 1000)).catch((err: unknown) => {
      warn('pairing code sweep failed', { error: String(err) })
    })
  },
  5 * 60 * 1000,
)
idleSweep.unref()

const app = await buildApp({ engine, db, lobbies, hub, friends, frontendDist: join(__dirname, '../frontend/dist') })
warn = (message, details) => {
  app.log.warn({ details }, message)
}
// Stopping: no idle sweep, friends pushes, grace or debounce timers or shot workers left running
app.addHook('onClose', async () => {
  clearInterval(idleSweep)
  friends.close()
  await closePool()
})
await app.listen({ port: PORT, host: '0.0.0.0' })
