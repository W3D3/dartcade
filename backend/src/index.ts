import { join, dirname } from 'path'
import { flagEnabled, loadFlagUser, modeAvailable, setOverrides } from './flags/index.js'
import { loadOverrides } from './db/flagOverrides.js'
import { fileURLToPath } from 'url'
import { db, takeInstanceLock, url as dbUrl } from './db/index.js'
import { deletePairingCodesExpiredBefore, runMigrations } from './db/queries.js'
import { listCourses, publishedCourse, publishedOfficialHoles, seedOfficialCourses } from './db/minigolfCourses.js'
import { setCourseSource } from './games/minigolfCourseSource.js'
import { SessionEngine, createEngineStore } from './session/engine.js'
import { forgetSession, pushNotice, pushSnapshot } from './browser-gw/handler.js'
import { seedDev } from './auth/seed.js'
import { bootstrapAdmin } from './auth/bootstrap.js'
import { mailConfig } from './auth/index.js'
import { setAccountCleanup, cleanUpAccount } from './auth/cleanup.js'
import { buildApp } from './app.js'
import { LobbyHub } from './lobby/hub.js'
import { LobbyService } from './lobby/service.js'
import { bridgeConnections } from './bridge-gw/connections.js'
import { boardOwner, getLightsEnabled, listWledDevices } from './db/lights.js'
import { boardInOpenLobby } from './db/lobbies.js'
import { LightsService } from './lights/service.js'
import { BigScreenService } from './bigscreen/service.js'
import { boardStatus } from './boards/bmState.js'
import { autoStartBoards } from './boards/autoStart.js'
import { getBoardWithOwnerPrefs } from './db/queries.js'
import { FriendsService } from './friends/service.js'
import { MatchmakingService } from './matchmaking/service.js'
import { seatedGame } from './friends/status.js'
import { initPhysics3d } from './shared/minigolf/3d/physics3d.js'
import { closePool, warmPool } from './games/minigolfPool.js'
import { ProgressionService } from './progression/service.js'
import { getFinishedGame } from './db/history.js'
import { gameDetailBody } from './api/games.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PORT = parseInt(process.env.PORT ?? '3000', 10)

// shortcut: lobby start serialization, one game per user/lobby/board and presence live in this
// process's memory, so one backend per database; move them to Postgres before running replicas
if (!(await takeInstanceLock(dbUrl))) {
  console.error('Another dartcade backend is already running on this database. Stop it first: only one may run at a time.')
  process.exit(1)
}
console.info(`mail: ${mailConfig.smtpUrl ? 'on' : 'off'}, email verification: ${mailConfig.verification ? 'required' : 'off'}`)

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
await bootstrapAdmin(db)

const hub = new LobbyHub()
const progression = new ProgressionService({
  db,
  enabled: async userId => flagEnabled('progression.enabled', await loadFlagUser(db, userId)),
  manualDarts: async userId => flagEnabled('progression.manualDarts', await loadFlagUser(db, userId)),
  push: (userId, msg) => {
    hub.sendXp(userId, msg)
  },
  warn: (message, details) => {
    warn(message, details)
  },
})
// The rebuild below can already warn (a log entry that won't parse), before the app and its
// logger exist: until then warnings go to the console
let warn = (message: string, details: unknown) => {
  console.warn(message, details)
}
// Lights (#135): reads engine lazily, the same way the push closure below does
const lights: LightsService = new LightsService({
  send: (b, m) => bridgeConnections.send(b, m),
  bridgeVersion: b => bridgeConnections.get(b)?.bridgeVersion,
  devices: b => listWledDevices(db, b),
  // The lights.enabled flag is checked for the board's owner (like the API), so turning the flag
  // off stops sends and darkens the strips, not only hides the UI
  enabled: async b => {
    const owner = await boardOwner(db, b)
    if (!owner || !(await flagEnabled('lights.enabled', await loadFlagUser(db, owner)))) return false
    return getLightsEnabled(db, b)
  },
  getSession: id => engine.getSession(id),
  getSnapshot: id => engine.getSnapshot(id),
  sessionOnBoard: b => engine.getSessionByBoard(b)?.id ?? null,
  inLobby: b => boardInOpenLobby(db, b),
  warn: (message, details) => {
    warn(message, details)
  },
})
// Big screen: follows boards for /ws/board; reads the engine lazily like lights
const bigScreen = new BigScreenService({
  activeOn: id => engine.getSessionByBoard(id)?.id,
  getSnapshot: id => engine.getSnapshot(id),
  loadBoard: async id => {
    const b = await getBoardWithOwnerPrefs(db, id)
    return b && { name: b.name, prefs: b.preferences ?? {} }
  },
  isOnline: id => bridgeConnections.isOnline(id),
  boardStatus: id => boardStatus(id, 5_000),
  now: Date.now,
  setTimer: setTimeout,
  warn: err => {
    warn('big screen push failed', { error: String(err) })
  },
})
// The other callbacks only run after the engine and the lobbies exist
const engine: SessionEngine = new SessionEngine(
  createEngineStore(db),
  sessionId => {
    pushSnapshot(sessionId, engine)
    bigScreen.onSessionChanged(sessionId)
    lobbies.onSessionPush(sessionId).catch((err: unknown) => {
      warn('lobby indicator push failed', { sessionId, error: String(err) })
    })
    lights.onPush(sessionId).catch((err: unknown) => {
      warn('lights push failed', { sessionId, error: String(err) })
    })
  },
  (message, details) => {
    warn(message, details)
  },
  (sessionId, userIds, notice) => {
    pushNotice(sessionId, userIds, notice)
  },
  ended => {
    // Not awaited (like the push callback's lights.onPush): a board going idle is not on the game path
    lights.onGameEnded(ended.sessionId).catch((err: unknown) => {
      warn('lights game-end failed', { sessionId: ended.sessionId, error: String(err) })
    })
    // Nor is XP: it reads the saved game, which finish() stored before this runs
    progression.onGameEnded(ended).catch((err: unknown) => {
      warn('xp for a finished game failed', { sessionId: ended.sessionId, error: String(err) })
    })
    // Nor is the details page, built now so no one's first load waits for the replay; the big screen shows it too
    const saved =
      ended.status === 'finished' ? getFinishedGame(db, ended.sessionId).then(game => (game ? gameDetailBody(db, game, warn) : null)) : null
    saved?.catch((err: unknown) => {
      warn('storing a finished game detail failed', { sessionId: ended.sessionId, error: String(err) })
    })
    bigScreen.onGameEnded(ended.sessionId, ended.boardIds, saved)
    return lobbies.onGameEnded(ended).then(() => matchmaking.onGameEnded(ended))
  },
  started => lobbies.onGameStarted(started),
  {
    forgotten: id => {
      forgetSession(id)
      lights.onForgotten(id)
    },
  },
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
  autoStartBoards: boardIds => autoStartBoards(db, boardIds, warn),
  gameAvailable: async (userId, gameId) => modeAvailable(gameId, await loadFlagUser(db, userId)),
  warn: (message, details) => {
    warn(message, details)
  },
  onStatusChange: userIds => {
    friends.touch(userIds)
  },
  onBoardsChanged: boardIds => {
    lights.onLobbyBoards(boardIds).catch((err: unknown) => {
      warn('lights lobby boards failed', { boardIds, error: String(err) })
    })
  },
})
setAccountCleanup(userId => cleanUpAccount({ engine, lobbies }, userId))
const matchmaking = new MatchmakingService({
  db,
  engine,
  send: (userId, msg) => {
    hub.sendMatchmaking(userId, msg)
  },
  warn: (message, details) => {
    warn(message, details)
  },
})
await engine.rebuild()
// A game that ended while the server was down never told its lobby: settle the lobbies now
await lobbies.settleAll()
// …and a ranked one never moved its ratings
await matchmaking.settleAll()
matchmaking.start()
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

const app = await buildApp({
  engine,
  db,
  lobbies,
  hub,
  friends,
  lights,
  bigScreen,
  matchmaking,
  frontendDist: join(__dirname, '../frontend/dist'),
})
// buildApp's setupFlags only set the env defaults; apply what's stored before serving any request
await setOverrides(await loadOverrides(db))
warn = (message, details) => {
  app.log.warn({ details }, message)
}
// Stopping: no idle sweep, matchmaking ticks, friends pushes, grace or debounce timers or shot workers left running
app.addHook('onClose', async () => {
  clearInterval(idleSweep)
  matchmaking.close()
  bigScreen.close()
  friends.close()
  await closePool()
})
await app.listen({ port: PORT, host: '0.0.0.0' })
// Games from before progression pay once, in the background
progression
  .backfill()
  .then(n => {
    if (n > 0) app.log.info({ games: n }, 'progression backfill done')
  })
  .catch((err: unknown) => {
    warn('progression backfill failed', { error: String(err) })
  })
