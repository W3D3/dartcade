import { ulid } from 'ulid'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import * as q from '../db/lobbies.js'
import { getUsersByIds } from '../db/queries.js'
import { pgErrorCode } from '../db/errors.js'
import type { SessionEngine } from '../session/engine.js'
import { WsCloseCode } from '../schema/game-ws.js'
import type { Lobby, LobbyServerMessage, MeMessage } from '../schema/lobby-ws.js'
import { games } from '../games/index.js'
import { LobbyError, inLobby } from './errors.js'
import type { LobbyHub } from './hub.js'
import * as rules from './rules.js'
import { newLobbyCode, normalizeCode } from './code.js'
import { inviteView, lobbySummary, lobbyView } from './view.js'
import { checkLobbyMessage } from './validation.js'
import type { LobbyState, NextGame, ThrowOrder } from './types.js'

const UNIQUE_VIOLATION = '23505'
const CODE_ATTEMPTS = 5

export type LobbyRef = { id: string; name: string; code: string }
export type LobbyPreview = { id: string; name: string; hostName: string | null; peopleCount: number; boardNames: string[] }
export type LobbyPatch = { name?: string; throwOrder?: ThrowOrder; nextGame?: NextGame | null; regenerateCode?: boolean }

export type LobbyDeps = {
  db: Kysely<Database>
  engine: SessionEngine
  hub: LobbyHub
  isBoardOnline: (boardId: string) => boolean
  warn?: (message: string, details: unknown) => void
}

const refOf = (l: LobbyState): LobbyRef => ({ id: l.id, name: l.name, code: l.code })
const memberIds = (l: LobbyState): string[] => l.people.flatMap(p => p.userId === null ? [] : [p.userId])

/**
 * Lobbies: every rule, and every push. Changes to one lobby run one after another (like
 * the engine's per-session queue), so each change checks the state it changes. After a
 * change the lobby is reloaded and pushed to its sockets, and /ws/me to everyone it concerns.
 */
/** Longest lobby name a rename accepts (UpdateLobbyRequest.name in api-v1.yaml). */
const LOBBY_NAME_MAX = 48

/** "Christoph's lobby", the name cut short so it fits LOBBY_NAME_MAX. */
function defaultLobbyName(hostName: string): string {
  const suffix = "'s lobby"
  return `${hostName.slice(0, LOBBY_NAME_MAX - suffix.length).trimEnd()}${suffix}`
}

export class LobbyService {
  private readonly queues = new Map<string, Promise<unknown>>()
  // Open lobbies as last loaded; every change reloads its lobby
  private readonly cache = new Map<string, LobbyState>()

  constructor(private readonly deps: LobbyDeps) {}

  private get db(): Kysely<Database> { return this.deps.db }

  private warn(message: string, details: unknown = {}): void {
    if (this.deps.warn) this.deps.warn(message, details)
    else console.warn(message, details)
  }

  private enqueue<T>(lobbyId: string, task: () => Promise<T>): Promise<T> {
    const run = (this.queues.get(lobbyId) ?? Promise.resolve()).then(task)
    this.queues.set(lobbyId, run.catch(() => undefined))
    return run
  }

  /** Resolves once the lobby's queued changes are done. */
  async whenIdle(lobbyId: string): Promise<void> {
    await this.queues.get(lobbyId)
  }

  private async reload(lobbyId: string): Promise<LobbyState | undefined> {
    const lobby = await q.loadLobby(this.db, lobbyId)
    if (lobby && lobby.closedAt === null) this.cache.set(lobbyId, lobby)
    else this.cache.delete(lobbyId)
    return lobby
  }

  private async state(lobbyId: string): Promise<LobbyState | undefined> {
    return this.cache.get(lobbyId) ?? this.reload(lobbyId)
  }

  // Runs in the lobby's queue. The open lobby, with the user in it; a lobby you're not in reads as 404
  private async openFor(lobbyId: string, userId: string): Promise<LobbyState> {
    let lobby = await this.reload(lobbyId)
    // A host whose account is gone hands over on the next change
    if (lobby && lobby.closedAt === null && lobby.hostUserId === null) {
      await this.settleHost(lobbyId)
      lobby = this.cache.get(lobbyId)
    }
    if (!lobby || lobby.closedAt !== null || !rules.isMember(lobby, userId)) throw LobbyError.notFound('lobby not found')
    return lobby
  }

  private async openAsHost(lobbyId: string, userId: string): Promise<LobbyState> {
    const lobby = await this.openFor(lobbyId, userId)
    if (!rules.isHost(lobby, userId)) throw LobbyError.forbidden('only the host can do this')
    return lobby
  }

  // ---- views and pushes -------------------------------------------------------------

  private viewOf(lobby: LobbyState): Lobby {
    return lobbyView(lobby, {
      online: this.deps.hub.online(lobby.id),
      isBoardOnline: this.deps.isBoardOnline,
      sessionId: this.deps.engine.getLobbySession(lobby.id)?.id ?? null,
    })
  }

  /** The lobby as its socket shows it; null when it's closed or unknown. */
  async view(lobbyId: string): Promise<Lobby | null> {
    const lobby = await this.state(lobbyId)
    return lobby && lobby.closedAt === null ? this.viewOf(lobby) : null
  }

  private send(lobby: LobbyState): void {
    const msg: LobbyServerMessage = { type: 'lobby', lobby: this.viewOf(lobby) }
    checkLobbyMessage(msg, m => { this.warn(m) })
    this.deps.hub.sendLobby(lobby.id, msg)
  }

  /** Pushes the lobby to its sockets, and /ws/me to its members, invitees and `alsoUsers`. */
  private async publish(lobbyId: string, alsoUsers: string[] = []): Promise<void> {
    const lobby = this.cache.get(lobbyId)
    if (lobby) this.send(lobby)
    const users = new Set([...(lobby ? [...memberIds(lobby), ...lobby.invites.map(i => i.userId)] : []), ...alsoUsers])
    await Promise.all([...users].map(u => this.pushMe(u)))
  }

  /** A lobby socket opened or closed: everyone sees who's online. */
  async refreshPresence(lobbyId: string): Promise<void> {
    const lobby = await this.state(lobbyId)
    if (lobby && lobby.closedAt === null) this.send(lobby)
  }

  async meMessage(userId: string): Promise<MeMessage> {
    const invites = (await q.pendingInvitesFor(this.db, userId)).map(inviteView)
    const lobbyId = await q.getOpenLobbyIdOfUser(this.db, userId)
    const lobby = lobbyId === undefined ? undefined : await this.state(lobbyId)
    const msg: MeMessage = {
      type: 'me', invites,
      lobby: lobby ? lobbySummary(lobby, userId, this.deps.engine.getLobbySession(lobby.id)) : null,
    }
    checkLobbyMessage(msg, m => { this.warn(m) })
    return msg
  }

  /** Sends the user's /ws/me their state if they have it open (and it changed). */
  async pushMe(userId: string): Promise<void> {
    if (!this.deps.hub.hasMe(userId)) return
    this.deps.hub.sendMe(userId, await this.meMessage(userId))
  }

  // ---- who may look -----------------------------------------------------------------

  async isMember(lobbyId: string, userId: string): Promise<boolean> {
    const lobby = await this.state(lobbyId)
    return lobby !== undefined && lobby.closedAt === null && rules.isMember(lobby, userId)
  }

  /** Whether the user may open the lobby's socket. */
  async lobbyAccess(lobbyId: string, userId: string): Promise<'ok' | 'not_found' | 'forbidden'> {
    const lobby = await this.state(lobbyId)
    if (!lobby || lobby.closedAt !== null) return 'not_found'
    return rules.isMember(lobby, userId) ? 'ok' : 'forbidden'
  }

  async current(userId: string): Promise<LobbyRef | null> {
    const id = await q.getOpenLobbyIdOfUser(this.db, userId)
    const lobby = id === undefined ? undefined : await this.state(id)
    return lobby ? refOf(lobby) : null
  }

  /** What the Join page shows before joining. */
  async preview(code: string): Promise<LobbyPreview | null> {
    const id = await q.getOpenLobbyIdByCode(this.db, normalizeCode(code))
    const lobby = id === undefined ? undefined : await this.state(id)
    if (!lobby) return null
    const host = lobby.hostUserId === null ? undefined : rules.memberOf(lobby, lobby.hostUserId)
    return {
      id: lobby.id, name: lobby.name, hostName: host?.name ?? null, peopleCount: lobby.people.length,
      boardNames: [...new Set(lobby.people.flatMap(p => p.boardName === null ? [] : [p.boardName]))],
    }
  }

  // ---- lifecycle --------------------------------------------------------------------

  async create(userId: string): Promise<LobbyRef> {
    const open = await q.getOpenLobbyIdOfUser(this.db, userId)
    if (open !== undefined) throw inLobby(open)
    const user = (await getUsersByIds(this.db, [userId])).at(0)
    if (!user) throw LobbyError.notFound('account not found')
    const board = (await q.usualBoards(this.db, [userId])).get(userId) ?? null
    const id = ulid()
    await this.withFreshCode(userId, code => q.insertLobby(this.db,
      { id, name: defaultLobbyName(user.name), hostUserId: userId, code },
      { id: ulid(), userId, addedByUserId: userId, name: user.name, boardId: board?.id ?? null, ready: false }))
    const lobby = await this.reload(id)
    if (!lobby) throw new Error(`lobby ${id} missing after insert`)
    await this.publish(id)
    return refOf(lobby)
  }

  // Writes with fresh codes until one is free (codes are unique among open lobbies). With
  // a user, a clash can also mean they got into a lobby meanwhile (two creates racing).
  private async withFreshCode(userId: string | null, write: (code: string) => Promise<void>): Promise<void> {
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      try {
        await write(newLobbyCode())
        return
      } catch (err) {
        if (pgErrorCode(err) !== UNIQUE_VIOLATION) throw err
        if (userId !== null) {
          const open = await q.getOpenLobbyIdOfUser(this.db, userId)
          if (open !== undefined) throw inLobby(open)
        }
      }
    }
    throw new Error('no free lobby code')
  }

  async join(userId: string, lobbyId: string, code: string): Promise<LobbyRef> {
    return this.enqueue(lobbyId, async () => {
      const lobby = await this.reload(lobbyId)
      if (!lobby || lobby.closedAt !== null || lobby.code !== normalizeCode(code)) throw LobbyError.notFound('no open lobby with this code')
      return this.addMember(lobby, userId)
    })
  }

  // Runs in the lobby's queue
  private async addMember(lobby: LobbyState, userId: string): Promise<LobbyRef> {
    if (rules.isMember(lobby, userId)) return refOf(lobby)
    const open = await q.getOpenLobbyIdOfUser(this.db, userId)
    if (open !== undefined) throw inLobby(open)
    const user = (await getUsersByIds(this.db, [userId])).at(0)
    if (!user) throw LobbyError.notFound('account not found')
    const board = (await q.usualBoards(this.db, [userId])).get(userId) ?? null
    try {
      await this.db.transaction().execute(async (trx) => {
        await q.insertPerson(trx, { id: ulid(), lobbyId: lobby.id, userId, addedByUserId: userId, name: user.name, boardId: board?.id ?? null, ready: false })
        await q.acceptInvites(trx, lobby.id, userId)
        await q.addActivity(trx, lobby.id, 'joined', userId, { name: user.name })
      })
    } catch (err) {
      // They got into another lobby meanwhile
      const other = pgErrorCode(err) === UNIQUE_VIOLATION ? await q.getOpenLobbyIdOfUser(this.db, userId) : undefined
      if (other !== undefined) throw inLobby(other)
      throw err
    }
    const fresh = await this.reload(lobby.id)
    await this.publish(lobby.id, [userId])
    return refOf(fresh ?? lobby)
  }

  async leave(userId: string, lobbyId: string): Promise<void> {
    await this.enqueue(lobbyId, async () => {
      const lobby = await this.openFor(lobbyId, userId)
      await this.dropMember(lobby, userId, 'left', userId)
    })
  }

  // Runs in the lobby's queue. The member goes with their guests; whoever sat at their
  // boards goes to Manual (the boards leave with their owner).
  private async dropMember(lobby: LobbyState, memberUserId: string, kind: 'left' | 'removed', actorUserId: string): Promise<void> {
    const going = rules.leavingWith(lobby, memberUserId)
    const name = rules.memberOf(lobby, memberUserId)?.name ?? ''
    await this.db.transaction().execute(async (trx) => {
      await q.deletePeople(trx, going.map(p => p.id))
      await q.clearBoardsOf(trx, lobby.id, memberUserId)
      await q.addActivity(trx, lobby.id, kind, actorUserId, { name })
    })
    this.deps.hub.closeLobbyFor(lobby.id, memberUserId, WsCloseCode.Forbidden, kind === 'left' ? 'left the lobby' : 'removed from the lobby')
    if (await this.settleHost(lobby.id) === 'open') await this.publish(lobby.id, [memberUserId])
    else await this.pushMe(memberUserId)
  }

  // Runs in the lobby's queue, after people left. Between games the lobby needs a host
  // who's in it: the member who has been there longest takes over; with no members left
  // it closes. During a game nothing changes: the host stays (and can abort) until it ends.
  private async settleHost(lobbyId: string): Promise<'open' | 'closed'> {
    const lobby = await this.reload(lobbyId)
    if (!lobby || lobby.closedAt !== null) return 'closed'
    if (this.deps.engine.getLobbySession(lobbyId)) return 'open'
    if (memberIds(lobby).length === 0) {
      await this.closeNow(lobby)
      return 'closed'
    }
    if (lobby.hostUserId !== null && rules.isMember(lobby, lobby.hostUserId)) return 'open'
    const next = rules.nextHost(lobby)
    if (next === null) return 'open'
    await this.db.transaction().execute(async (trx) => {
      await q.updateLobby(trx, lobbyId, { host_user_id: next.userId })
      await q.addActivity(trx, lobbyId, 'host_changed', next.userId, { name: next.name })
    })
    await this.reload(lobbyId)
    return 'open'
  }

  // Runs in the lobby's queue. `lobby` is the state just before closing: its members get /ws/me.
  private async closeNow(lobby: LobbyState): Promise<void> {
    const invitees = await q.closeLobbyRows(this.db, lobby.id, new Date())
    this.cache.delete(lobby.id)
    this.deps.hub.sendLobby(lobby.id, { type: 'lobby_closed', lobbyId: lobby.id })
    this.deps.hub.closeLobby(lobby.id, WsCloseCode.NotFound, 'lobby closed')
    await Promise.all([...new Set([...memberIds(lobby), ...invitees])].map(u => this.pushMe(u)))
  }

  async close(userId: string, lobbyId: string): Promise<void> {
    await this.enqueue(lobbyId, async () => {
      const lobby = await this.openAsHost(lobbyId, userId)
      const running = this.deps.engine.getLobbySession(lobbyId)
      if (running) throw LobbyError.conflict({ error: 'a game is running: abort it first', code: 'game_running', sessionId: running.id })
      await this.closeNow(lobby)
    })
  }

  async update(userId: string, lobbyId: string, patch: LobbyPatch): Promise<void> {
    await this.enqueue(lobbyId, async () => {
      await this.openAsHost(lobbyId, userId)
      const set: q.LobbyUpdate = {}
      if (patch.name !== undefined) {
        const name = patch.name.trim()
        if (name === '') throw LobbyError.badRequest('the name is empty')
        set.name = name
      }
      if (patch.throwOrder !== undefined) set.throw_order = patch.throwOrder
      if (patch.nextGame !== undefined) {
        if (patch.nextGame !== null && !games[patch.nextGame.gameId]) throw LobbyError.badRequest(`unknown game: ${patch.nextGame.gameId}`)
        set.next_game = patch.nextGame
      }
      if (Object.keys(set).length > 0) await q.updateLobby(this.db, lobbyId, set)
      if (patch.regenerateCode === true) await this.withFreshCode(null, code => q.updateLobby(this.db, lobbyId, { code }))
      await this.reload(lobbyId)
      await this.publish(lobbyId)
    })
  }
}
