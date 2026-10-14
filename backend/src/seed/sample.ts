import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { friendshipBetween } from '../db/friends.js'
import { getOpenLobbyIdOfUser } from '../db/lobbies.js'
import { SessionEngine, createEngineStore } from '../session/engine.js'
import type { Seat, UserAction } from '../session/types.js'
import { x01Module, type X01Config } from '../games/x01.js'
import { throwAt } from '../bots/accuracy.js'
import { sigmaForLevel } from '../bots/levels.js'
import { FriendsService } from '../friends/service.js'
import { LobbyService } from '../lobby/service.js'
import { LobbyHub } from '../lobby/hub.js'

/** Sample data for PR previews: the accounts seedDev() creates (auth/seed.ts), playing and befriending each other. */
type Who = 'admin' | 'luke' | 'phil' | 'michael' | 'gerwyn'

/** How well each account throws: like a bot of that level (1-10, bots/levels.ts). */
const LEVEL: Record<Who, number> = { admin: 4, luke: 9, phil: 8, michael: 7, gerwyn: 6 }

/** A finished X01 game, players in throw order. */
type SampleGame = { config: Partial<X01Config>; players: Who[] }

const GAMES: SampleGame[] = [
  { config: { startScore: 501, firstTo: 1 }, players: ['luke', 'phil'] },
  { config: { startScore: 501, firstTo: 1 }, players: ['admin', 'luke'] },
  { config: { startScore: 301, firstTo: 1 }, players: ['admin', 'michael'] },
  { config: { startScore: 501, firstTo: 2 }, players: ['michael', 'gerwyn'] },
  { config: { startScore: 501, firstTo: 1 }, players: ['luke', 'phil', 'michael'] },
  { config: { startScore: 301, firstTo: 1 }, players: ['admin', 'gerwyn', 'phil'] },
  { config: { startScore: 501, firstTo: 1, format: 'teams', teams: [0, 1, 0, 1] }, players: ['admin', 'luke', 'gerwyn', 'phil'] },
  { config: { startScore: 301, firstTo: 1, outMode: 'straight' }, players: ['luke', 'admin'] },
  { config: { startScore: 501, firstTo: 1 }, players: ['phil', 'admin'] },
]

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

// Each seat throws where a bot would aim, with that seat's level of accuracy, through the same
// user actions a player's manual entry sends
async function play(engine: SessionEngine, users: Record<Who, User>, game: SampleGame): Promise<void> {
  const seats = game.players.map((who): Seat => {
    const u = users[who]
    return { name: u.name, userId: u.id, controllerUserId: u.id, boardId: null, boardName: null, bot: null }
  })
  const { sessionId } = await engine.createWithSeats({
    ownerUserId: seats[0].controllerUserId,
    gameId: x01Module.id,
    config: { ...x01Module.defaultConfig, ...game.config },
    seats,
  })
  const session = engine.getSession(sessionId)
  if (!session?.module.botTarget) throw new Error(`session ${sessionId} can't be played by the seed`)
  while (session.status === 'active') {
    const up = session.module.getCurrentPlayer(session.currentState)
    const thrown = session.openVisitEvents.filter(e => e.kind === 'dart.detected').length
    const target = session.module.botTarget(session.currentState, up, thrown)
    const action: UserAction =
      target === 'takeout' || target === null
        ? { type: 'takeout' }
        : { type: 'add_dart', ...throwAt(target, sigmaForLevel(LEVEL[game.players[up]]), session.rng) }
    const result = await engine.onUserAction(sessionId, seats[up].controllerUserId, action)
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
  for (const game of todo) await play(engine, users, game)
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
