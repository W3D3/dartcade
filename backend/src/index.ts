import { join, dirname } from 'path'
import { flagEnabled, loadFlagUser, modeAvailable, setOverrides } from './flags/index.js'
import { loadOverrides } from './db/flagOverrides.js'
import { fileURLToPath } from 'url'
import { db, takeInstanceLock, url as dbUrl } from './db/index.js'
import { deletePairingCodesExpiredBefore, runMigrations } from './db/queries.js'
import { pruneActivity } from './db/activity.js'
import { listOfficialCourses, publishedCourse, publishedOfficialHoles, seedOfficialCourses } from './db/minigolfCourses.js'
import { setCourseSource } from './games/minigolfCourseSource.js'
import { SessionEngine, createEngineStore, type GameEndedConsumer } from './session/engine.js'
import { browserConnections, forgetSession, pushNotice, pushSnapshot } from './browser-gw/handler.js'
import { seedDev } from './auth/seed.js'
import { bootstrapAdmin } from './auth/bootstrap.js'
import { mailConfig } from './auth/index.js'
import { setAccountCleanup, cleanUpAccount } from './auth/cleanup.js'
import { buildApp } from './app.js'
import { log, warn } from './log.js'
import { every } from './periodic.js'
import { LobbyHub } from './lobby/hub.js'
import { LobbyService } from './lobby/service.js'
import { bridgeConnections } from './bridge-gw/connections.js'
import { boardOwner, getBoardProfile, getLightsEnabled, listWledDevices } from './db/lights.js'
import { boardInOpenLobby } from './db/lobbies.js'
import { releaseTeamsOf } from './db/teams.js'
import { LightsService } from './lights/service.js'
import { BigScreenService } from './bigscreen/service.js'
import { boardStatus } from './boards/bmState.js'
import { autoStartBoards } from './boards/autoStart.js'
import { resetBoardOnNext } from './boards/resetOnNext.js'
import { getBoardWithOwnerPrefs } from './db/queries.js'
import { FriendsService } from './friends/service.js'
import { MatchmakingService } from './matchmaking/service.js'
import { TournamentService } from './tournaments/service.js'
import { seatedGame } from './friends/status.js'
import { initPhysics3d } from './shared/minigolf/3d/physics3d.js'
import { closePool, warmPool } from './games/minigolfPool.js'
import { ProgressionService } from './progression/service.js'
import { AchievementsService } from './achievements/service.js'
import { getFinishedGame } from './db/history.js'
import { gameDetailBody } from './api/games.js'
import { backfillCoachLegs, buildCoachLegs } from './coach/store.js'
import { SampleCollector, maxSampleBytes } from './detection/collector.js'
import { boardShares, insertSample, pruneSamples } from './db/dartSamples.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PORT = parseInt(process.env.PORT ?? '3000', 10)

// shortcut: lobby start serialization, one game per user/lobby/board and presence live in this
// process's memory, so one backend per database; move them to Postgres before running replicas
if (!(await takeInstanceLock(dbUrl))) {
  log.error('Another dartcade backend is already running on this database. Stop it first: only one may run at a time.')
  process.exit(1)
}
log.info(`mail: ${mailConfig.smtpUrl ? 'on' : 'off'}, email verification: ${mailConfig.verification ? 'required' : 'off'}`)

// Rapier's WASM: Minigolf's 3D shots are simulated synchronously, from the rebuild below on
await initPhysics3d()
warmPool()
await runMigrations(db)
await seedOfficialCourses(db)
setCourseSource({
  course: id => publishedCourse(db, id),
  officialHoles: () => publishedOfficialHoles(db),
  // Official only; the picker's group for user courses is part C
  officialCourses: async () => (await listOfficialCourses(db)).flatMap(c => (c.published ? [{ id: c.id, name: c.published.name }] : [])),
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
  warn,
})
const achievements = new AchievementsService({
  db,
  enabled: async userId => flagEnabled('achievements.enabled', await loadFlagUser(db, userId)),
  manualDarts: async userId => flagEnabled('progression.manualDarts', await loadFlagUser(db, userId)),
  push: (userId, msg) => {
    hub.sendAchievements(userId, msg)
  },
  warn,
})
// Lights (#135): reads engine lazily, the same way the push closure below does
const lights: LightsService = new LightsService({
  send: (b, m) => bridgeConnections.send(b, m),
  bridgeVersion: b => bridgeConnections.get(b)?.bridgeVersion,
  devices: b => listWledDevices(db, b),
  profile: b => getBoardProfile(db, b),
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
  warn,
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
    achievements.onGameEnded(ended).catch((err: unknown) => {
      warn('achievements for a finished game failed', { sessionId: ended.sessionId, error: String(err) })
    })
    // Nor is the details page, built now so no one's first load waits for the replay; the big screen shows it too
    const saved =
      ended.status === 'finished'
        ? getFinishedGame(db, ended.sessionId).then(async game => {
            const body = game ? await gameDetailBody(db, game, warn) : null
            // The coach's reviews read the stored detail, so they're built once it's there; not
            // awaited either (~0.3 s of CPU for a long game)
            if (game && body)
              buildCoachLegs(db, game, warn).catch((err: unknown) => {
                warn('building the coach reviews failed', { sessionId: ended.sessionId, error: String(err) })
              })
            return body
          })
        : null
    saved?.catch((err: unknown) => {
      warn('storing a finished game detail failed', { sessionId: ended.sessionId, error: String(err) })
    })
    bigScreen.onGameEnded(ended.sessionId, ended.boardIds, saved)
    // Independent: a lobby that fails to reset must not keep the ratings from moving
    const consumers: GameEndedConsumer[] = [lobbies, matchmaking, tournaments]
    return Promise.allSettled(consumers.map(c => c.onGameEnded(ended))).then(results => {
      for (const r of results)
        if (r.status === 'rejected') warn('game-end hook failed', { sessionId: ended.sessionId, error: String(r.reason) })
    })
  },
  started => lobbies.onGameStarted(started),
  {
    connectedUsers: id => browserConnections.connectedUsers(id),
    isBoardOnline: boardId => bridgeConnections.isOnline(boardId),
    forgotten: id => {
      forgetSession(id)
      lights.onForgotten(id)
    },
    nextPlayer: boardId => {
      resetBoardOnNext(db, boardId, () => engine.getSessionByBoard(boardId)?.openDarts.length === 0, warn)
    },
  },
)
const friends = new FriendsService({
  db,
  hub,
  gameOf: userId => seatedGame(engine.getSessionByUser(userId), userId),
  warn,
})
const lobbies: LobbyService = new LobbyService({
  db,
  engine,
  hub,
  isBoardOnline: boardId => bridgeConnections.isOnline(boardId),
  autoStartBoards: boardIds => autoStartBoards(db, boardIds, warn),
  gameAvailable: async (userId, gameId) => modeAvailable(gameId, await loadFlagUser(db, userId)),
  warn,
  onStatusChange: userIds => {
    friends.touch(userIds)
  },
  onBoardsChanged: boardIds => {
    lights.onLobbyBoards(boardIds).catch((err: unknown) => {
      warn('lights lobby boards failed', { boardIds, error: String(err) })
    })
  },
})
setAccountCleanup(async userId => {
  await cleanUpAccount({ engine, lobbies }, userId)
  await releaseTeamsOf(db, userId)
})
const matchmaking = new MatchmakingService({
  db,
  engine,
  send: (userId, msg) => {
    hub.sendMatchmaking(userId, msg)
  },
  ended: (userId, msg) => {
    hub.sendMatchmakingEnded(userId, msg)
  },
  warn,
})
// Online tournaments: check-in, the draw, each match's game, results (tournaments/service.ts)
const tournaments = new TournamentService({
  db,
  engine,
  isOnline: userId => friends.isOnline(userId),
  send: (userId, msg) => {
    hub.sendTournament(userId, msg)
  },
  warn,
})
await engine.rebuild()
// A game that ended while the server was down never told its lobby: settle the lobbies now
await lobbies.settleAll()
// …and a ranked one never moved its ratings
await matchmaking.settleAll()
matchmaking.start()
// A tournament game that ended while the server was down moves its bracket now, then every few seconds
await tournaments.tick().catch((err: unknown) => {
  warn('tournament tick failed', { error: String(err) })
})
tournaments.start()
// A rating write that failed is tried again every minute, not only at the next start
const timers = [every(60_000, 'ranked settle', () => matchmaking.settleAll())]
// Pairing codes go an hour after they expired, friend activity after a month.
const HOUR_MS = 60 * 60 * 1000
const sweeps: [what: string, run: () => Promise<unknown>][] = [
  ['pairing code', () => deletePairingCodesExpiredBefore(db, new Date(Date.now() - HOUR_MS))],
  // Home shows a week of friend activity; a month is kept
  ['friend activity', () => pruneActivity(db, new Date(Date.now() - 30 * 24 * HOUR_MS))],
]
// Camera darts kept as training data for the dart detection model, on boards that share, while the
// flag is on for the board's owner; DART_SAMPLES_MAX_GB caps them (0: none kept)
const sampleBytes = maxSampleBytes()
const samples =
  sampleBytes > 0
    ? new SampleCollector({
        shares: async boardId => {
          const owner = await boardOwner(db, boardId)
          return (
            owner !== null &&
            (await flagEnabled('detection.collect.enabled', await loadFlagUser(db, owner))) &&
            (await boardShares(db, boardId))
          )
        },
        save: sample => insertSample(db, sample),
        warn,
      })
    : undefined
if (samples) sweeps.push(['dart sample', () => pruneSamples(db, sampleBytes)])
// Lobbies close after minutes without activity (10 with one real user, 20 with several: the
// lobby.idleMinutes.* flags); one whose unranked game had no event for that long is closed too, its
// game aborted. So they are swept every minute, apart from the rest
timers.push(every(60 * 1000, 'idle lobby sweep', () => lobbies.closeIdleLobbies()))
// A bridge whose socket stays open but that stopped talking (a wedged process) goes offline
timers.push(
  every(20 * 1000, 'bridge silence sweep', () => {
    bridgeConnections.closeSilent()
    return Promise.resolve()
  }),
)
for (const [what, run] of sweeps) timers.push(every(5 * 60 * 1000, `${what} sweep`, run))

const app = await buildApp({
  engine,
  db,
  lobbies,
  hub,
  friends,
  lights,
  bigScreen,
  samples,
  matchmaking,
  tournaments,
  frontendDist: join(__dirname, '../frontend/dist'),
})
// buildApp's setupFlags only set the env defaults; apply what's stored before serving any request
await setOverrides(await loadOverrides(db))
// Reviews for the games finished before the coach stored them (or by an older COACH_VERSION); not
// awaited, it yields between games
backfillCoachLegs(db, warn).catch((err: unknown) => {
  warn('coach backfill failed', { error: String(err) })
})
// Stopping: no idle sweep, matchmaking ticks, friends pushes, grace or debounce timers or shot workers left running
app.addHook('onClose', async () => {
  for (const t of timers) clearInterval(t)
  matchmaking.close()
  tournaments.close()
  bigScreen.close()
  await friends.close()
  await closePool()
})
await app.listen({ port: PORT, host: '0.0.0.0' })
// Games from before achievements existed are counted once, in the background
achievements
  .backfill()
  .then(n => {
    if (n > 0) app.log.info({ games: n }, 'achievements backfill done')
  })
  .catch((err: unknown) => {
    warn('achievements backfill failed', { error: String(err) })
  })
// Games from before progression pay once, in the background
progression
  .backfill()
  .then(n => {
    if (n > 0) app.log.info({ games: n }, 'progression backfill done')
  })
  .catch((err: unknown) => {
    warn('progression backfill failed', { error: String(err) })
  })
