import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { friendshipBetween } from '../db/friends.js'
import { getOpenLobbyIdOfUser } from '../db/lobbies.js'
import { SessionEngine, createEngineStore } from '../session/engine.js'
import type { Point, Seat, Session, UserAction } from '../session/types.js'
import type { MinigolfView } from '../session/views.js'
import { games } from '../games/index.js'
import { closePool } from '../games/minigolfPool.js'
import { pickTarget, pointFor, throwAt } from '../bots/accuracy.js'
import type { GameId } from '../shared/gameNames.js'
import { DEFAULT_PHYSICS } from '../shared/minigolf/physics.js'
import { sigmaForLevel } from '../bots/levels.js'
import { FriendsService } from '../friends/service.js'
import { LobbyService } from '../lobby/service.js'
import { LobbyHub } from '../lobby/hub.js'

/** Sample data for PR previews: the accounts seedDev() creates (auth/seed.ts), playing and befriending each other. */
type Who = 'admin' | 'luke' | 'phil' | 'michael' | 'gerwyn'

/** How well each account throws: like a bot of that level (1-10, bots/levels.ts). */
const LEVEL: Record<Who, number> = { admin: 4, luke: 9, phil: 8, michael: 7, gerwyn: 6 }

/** A finished game: its mode, the options it changes from the mode's defaults, players in throw order. */
type SampleGame = { game: GameId; config?: object; players: Who[] }

// New ones go at the end: a preview that's already seeded only plays the games after the ones it has
const GAMES: SampleGame[] = [
  { game: 'x01', config: { startScore: 501, firstTo: 1 }, players: ['luke', 'phil'] },
  { game: 'x01', config: { startScore: 501, firstTo: 1 }, players: ['admin', 'luke'] },
  { game: 'x01', config: { startScore: 301, firstTo: 1 }, players: ['admin', 'michael'] },
  { game: 'x01', config: { startScore: 501, firstTo: 2 }, players: ['michael', 'gerwyn'] },
  { game: 'x01', config: { startScore: 501, firstTo: 1 }, players: ['luke', 'phil', 'michael'] },
  { game: 'x01', config: { startScore: 301, firstTo: 1 }, players: ['admin', 'gerwyn', 'phil'] },
  {
    game: 'x01',
    config: { startScore: 501, firstTo: 1, format: 'teams', teams: [0, 1, 0, 1] },
    players: ['admin', 'luke', 'gerwyn', 'phil'],
  },
  { game: 'x01', config: { startScore: 301, firstTo: 1, outMode: 'straight' }, players: ['luke', 'admin'] },
  { game: 'x01', config: { startScore: 501, firstTo: 1 }, players: ['phil', 'admin'] },
  { game: 'atc', players: ['admin', 'luke'] },
  { game: 'atc', config: { finishOn: 'bull', multiplierAdvances: true }, players: ['phil', 'michael', 'gerwyn'] },
  { game: 'p121', config: { tries: 5 }, players: ['luke', 'admin'] },
  { game: 'hilo', players: ['admin', 'phil', 'gerwyn'] },
  { game: 'minigolf', players: ['michael', 'admin'] },
  { game: 'cricket', players: ['luke', 'gerwyn'] },
  { game: 'cricket', config: { mode: 'cutthroat' }, players: ['admin', 'phil', 'michael'] },
]

const TAKEOUT: UserAction = { type: 'takeout' }

/** A putt towards the cup, hard enough to roll about that far (it leaves doglegs to maxStrokes). */
function puttAt(v: MinigolfView): Point {
  const P = DEFAULT_PHYSICS // what every game is prepared with
  const ball = v.balls[v.currentPlayer].at
  const [dx, dy] = [v.hole.cup.at[0] - ball[0], v.hole.cup.at[1] - ball[1]]
  const len = Math.hypot(dx, dy) || 1
  const power = Math.min(1, Math.max(P.minPutt, (1.2 * len) / P.maxRoll))
  // The inverse of powerAt, so the dart's distance from the bull gives that power
  const r = Math.min(0.95, Math.max(0.2, ((power - P.minPutt) / (1 - P.minPutt)) ** (1 / P.powerExponent)))
  // Board y points up, course y down
  return { x: (r * dx) / len, y: (-r * dy) / len }
}

/**
 * What the seat that's up does next, having thrown `thrown` darts this visit: a dart aimed at a
 * point, or an action. The modes a bot can play aim like one, the others at what a player would.
 * One case per mode, so the compiler asks for a new one.
 */
function aim(session: Session, up: number, thrown: number): Point | UserAction {
  const m = session.module
  switch (m.id) {
    case 'x01':
    case 'cricket': {
      const target = m.botTarget?.(session.currentState, up, thrown) ?? 'takeout'
      return target === 'takeout' ? TAKEOUT : target
    }
    case 'atc': {
      const v = m.view(session.currentState, session.players)
      if (v.winner !== null || thrown >= 3) return TAKEOUT
      const n = v.targets[up]
      return pointFor(n === 22 ? 'Bull' : n === 21 ? '25' : `S${n}`)
    }
    case 'p121': {
      const v = m.view(session.currentState, session.players)
      return v.visitLocked || thrown >= 3 ? TAKEOUT : pickTarget(v.seats[up].left, 3 - thrown, v.cfg.outMode)
    }
    // Over the high bar while it's low, else under the low one
    case 'hilo': {
      const v = m.view(session.currentState, session.players)
      return v.visitLocked || thrown >= 3 ? TAKEOUT : pointFor(v.high < 100 ? 'T20' : 'S1')
    }
    // One putt a visit
    case 'minigolf': {
      const v = m.view(session.currentState, session.players)
      if (v.paused) return { type: 'minigolf_next_hole' }
      return thrown >= 1 ? TAKEOUT : puttAt(v)
    }
  }
}

/** `from` asked `to`; a pending request waits for `to` to answer. */
const FRIENDS: { from: Who; to: Who; accepted: boolean }[] = [
  { from: 'admin', to: 'luke', accepted: true },
  { from: 'phil', to: 'admin', accepted: true },
  { from: 'luke', to: 'phil', accepted: true },
  { from: 'michael', to: 'luke', accepted: true },
  { from: 'gerwyn', to: 'admin', accepted: false },
  { from: 'luke', to: 'gerwyn', accepted: false },
]

/** An open lobby: its host, who joined, and who's invited but hasn't answered. */
const LOBBY: { host: Who; members: Who[]; invited: Who[] } = { host: 'luke', members: ['phil'], invited: ['admin'] }

type User = { id: string; name: string }

async function devUsers(db: Kysely<Database>): Promise<Record<Who, User>> {
  const rows = await db.selectFrom('user').select(['id', 'name', 'email']).where('email', 'like', '%@dartcade.local').execute()
  const user = (who: Who): User => {
    const email = `${who}@dartcade.local`
    const row = rows.find(r => r.email === email)
    if (!row) throw new Error(`dev account ${email} missing: the app seeds it on start-up with NODE_ENV=development`)
    return row
  }
  return { admin: user('admin'), luke: user('luke'), phil: user('phil'), michael: user('michael'), gerwyn: user('gerwyn') }
}

// Each seat throws where aim() says, with that seat's level of accuracy, through the same
// user actions a player's manual entry sends
async function play(engine: SessionEngine, users: Record<Who, User>, game: SampleGame): Promise<void> {
  const mod = games[game.game]
  if (!mod) throw new Error(`unknown game ${game.game}`)
  const seats = game.players.map((who): Seat => {
    const u = users[who]
    return { name: u.name, userId: u.id, controllerUserId: u.id, boardId: null, boardName: null, bot: null }
  })
  const { sessionId } = await engine.createWithSeats({
    ownerUserId: seats[0].controllerUserId,
    gameId: mod.id,
    config: { ...mod.defaultConfig, ...game.config },
    seats,
  })
  const session = engine.getSession(sessionId)
  if (!session) throw new Error(`session ${sessionId} missing`)
  while (session.status === 'active') {
    const up = session.module.getCurrentPlayer(session.currentState)
    const thrown = session.openVisitEvents.filter(e => e.kind === 'dart.detected').length
    const next = aim(session, up, thrown)
    const action: UserAction =
      'type' in next ? next : { type: 'add_dart', ...throwAt(next, sigmaForLevel(LEVEL[game.players[up]]), session.rng) }
    // A dart or takeout comes from the seat that's up, a game action (next hole) from the host
    const by = action.type === 'add_dart' || action.type === 'takeout' ? seats[up].controllerUserId : session.ownerUserId
    const result = await engine.onUserAction(sessionId, by, action)
    if (!result.ok) throw new Error(`seed action refused in session ${sessionId}: ${result.code}`)
  }
}

/**
 * Loads the sample data. Runs again on every preview deploy, so each part is only added when
 * missing: games resume after the ones already finished, friendships and the lobby are skipped
 * when they exist.
 */
export async function seedSample(db: Kysely<Database>, log: (line: string) => void = () => undefined): Promise<void> {
  const users = await devUsers(db)
  const ids = Object.values(users).map(u => u.id)

  const engine = new SessionEngine(createEngineStore(db), () => undefined)
  const finished = await db
    .selectFrom('game_sessions')
    .select(eb => eb.fn.countAll<string>().as('n'))
    .where('status', '=', 'finished')
    .where('owner_user_id', 'in', ids)
    .executeTakeFirstOrThrow()
  const todo = GAMES.slice(Number(finished.n))
  try {
    for (const game of todo) await play(engine, users, game)
  } finally {
    // Minigolf's putts run in worker threads
    await closePool()
  }
  log(`games: ${todo.length} played, ${GAMES.length - todo.length} already there`)

  const hub = new LobbyHub()
  const friends = new FriendsService({ db, hub, gameOf: () => null })
  try {
    for (const { from, to, accepted } of FRIENDS) {
      if (await friendshipBetween(db, users[from].id, users[to].id)) continue
      const { id } = await friends.request(users[from].id, users[to].name)
      if (accepted) await friends.accept(users[to].id, id)
      log(`friends: ${from} -> ${to}${accepted ? '' : ' (pending)'}`)
    }
  } finally {
    friends.close()
  }

  const host = users[LOBBY.host].id
  if ((await getOpenLobbyIdOfUser(db, host)) === undefined) {
    const lobbies = new LobbyService({ db, engine, hub, isBoardOnline: () => false })
    const lobby = await lobbies.create(host)
    for (const who of LOBBY.members) await lobbies.join(users[who].id, lobby.id, lobby.code)
    for (const who of LOBBY.invited) await lobbies.invite(host, lobby.id, users[who].id)
    log(`lobby: ${lobby.name} (${lobby.code})`)
  }
}
