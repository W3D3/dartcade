import { ulid } from 'ulid'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import * as q from '../db/lobbies.js'
import { getBoardById, getUsersByIds } from '../db/queries.js'
import { pgErrorCode } from '../db/errors.js'
import { ActiveSessionError, BoardBusyError, type GameEnded, type SessionEngine } from '../session/engine.js'
import { WsCloseCode } from '../schema/game-ws.js'
import type { Lobby, LobbyServerMessage, MeMessage, PendingInvite } from '../schema/lobby-ws.js'
import { games } from '../games/index.js'
import { LobbyError, inLobby } from './errors.js'
import type { LobbyHub } from './hub.js'
import * as rules from './rules.js'
import { newLobbyCode, normalizeCode } from './code.js'
import { inviteView, lobbySummary, lobbyView } from './view.js'
import { checkLobbyMessage } from './validation.js'
import { planGame, type PlanProblem } from './startPlan.js'
import type { LastGame, LobbyPerson, LobbyState, NextGame, ThrowOrder } from './types.js'

const UNIQUE_VIOLATION = '23505'
const CODE_ATTEMPTS = 5

export type LobbyRef = { id: string; name: string; code: string }
export type LobbyPreview = { id: string; name: string; hostName: string | null; peopleCount: number; boardNames: string[] }
export type LobbyPatch = { name?: string; throwOrder?: ThrowOrder; nextGame?: NextGame | null; regenerateCode?: boolean }
export type PersonPatch = { boardId?: string | null; plays?: boolean; ready?: boolean; position?: number }

export type LobbyDeps = {
  db: Kysely<Database>
  engine: SessionEngine
  hub: LobbyHub
  isBoardOnline: (boardId: string) => boolean
  warn?: (message: string, details: unknown) => void
}

const refOf = (l: LobbyState): LobbyRef => ({ id: l.id, name: l.name, code: l.code })
const memberIds = (l: LobbyState): string[] => l.people.flatMap(p => p.userId === null ? [] : [p.userId])

function planError(p: PlanProblem): LobbyError {
  if (p.status === 400) return LobbyError.badRequest(p.error)
  const { status: _status, ...body } = p
  return LobbyError.conflict(body)
}

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

  /**
   * At start-up, after the games are rebuilt: every open lobby without a running game gets
   * its host settled, and an empty one closes. Catches a game end the lobby never heard of.
   */
  async settleAll(): Promise<void> {
    for (const lobbyId of await q.getOpenLobbyIds(this.db)) {
      await this.enqueue(lobbyId, () => this.settleHost(lobbyId))
    }
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
    // A host who is gone (account deleted, or left during a game whose end was never heard,
    // as when the server died then) hands over on the next change
    if (lobby && lobby.closedAt === null && (lobby.hostUserId === null || !rules.isMember(lobby, lobby.hostUserId))) {
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
    // Checked here, read-only and unqueued, so a wrong code or an already-closed lobby
    // never closes the joiner's own lobby before failing (see closeOwnSoloLobbyFirst)
    const target = await q.loadLobby(this.db, lobbyId)
    if (!target || target.closedAt !== null || target.code !== normalizeCode(code)) throw LobbyError.notFound('no open lobby with this code')
    await this.closeOwnSoloLobbyFirst(userId, lobbyId)
    return this.enqueue(lobbyId, async () => {
      const lobby = await this.reload(lobbyId)
      if (!lobby || lobby.closedAt !== null || lobby.code !== normalizeCode(code)) throw LobbyError.notFound('no open lobby with this code')
      return this.addMember(lobby, userId)
    })
  }

  /**
   * Before joining `targetLobbyId`: if the joiner has a different open lobby of their
   * own, give it a chance to close quietly (see closeIfSoloAndIdle) before they're added
   * to the target. This task runs entirely inside the OWN lobby's queue — never the
   * target's — and `join`/`acceptInvite` only enqueue on the target afterwards, once this
   * has settled. So no task ever awaits a second lobby's queue from inside a first: two
   * people each alone in their own lobby, joining each other's at the same instant, each
   * just close their own lobby (on its own queue) and then join the other (on its queue)
   * in sequence, never blocked on each other. `addMember` still throws `inLobby` if the
   * joiner turns out to still have an open lobby (not solo, or its game is running).
   *
   * `own` is read here, OUTSIDE `own`'s queue, before the close is even enqueued on it —
   * so by the time `closeIfSoloAndIdle` actually runs, `userId` might no longer be a
   * member of `own` at all (someone removed them, or they left some other way in the
   * meantime). Passing `userId` through lets that re-check catch it: see there.
   */
  private async closeOwnSoloLobbyFirst(userId: string, targetLobbyId: string): Promise<void> {
    const own = await q.getOpenLobbyIdOfUser(this.db, userId)
    if (own === undefined || own === targetLobbyId) return
    await this.enqueue(own, () => this.closeIfSoloAndIdle(own, userId))
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
      // The lock (not just this app-level check) is the backstop against inserting into a
      // lobby that a concurrent close just slipped past us — see lobbyIsOpenForShare.
      const inserted = await this.db.transaction().execute(async (trx) => {
        if (!(await q.lobbyIsOpenForShare(trx, lobby.id))) return false
        await q.insertPerson(trx, { id: ulid(), lobbyId: lobby.id, userId, addedByUserId: userId, name: user.name, boardId: board?.id ?? null, ready: false })
        await q.acceptInvites(trx, lobby.id, userId)
        await q.addActivity(trx, lobby.id, 'joined', userId, { name: user.name })
        return true
      })
      if (!inserted) throw LobbyError.notFound('lobby not found')
    } catch (err) {
      if (err instanceof LobbyError) throw err
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

  // Runs in the lobby's queue. `lobby` is the state just before closing: its members get
  // /ws/me. A null from closeLobbyRows means it was closed already (the DB backstop in
  // lobbyIsOpenForShare/closeLobbyRows raced it — shouldn't happen for a call that's
  // properly inside this lobby's own queue): nothing left to do.
  private async closeNow(lobby: LobbyState): Promise<void> {
    const invitees = await q.closeLobbyRows(this.db, lobby.id, new Date())
    if (invitees === null) return
    this.cache.delete(lobby.id)
    this.deps.hub.sendLobby(lobby.id, { type: 'lobby_closed', lobbyId: lobby.id })
    this.deps.hub.closeLobby(lobby.id, WsCloseCode.NotFound, 'lobby closed')
    await Promise.all([...new Set([...memberIds(lobby), ...invitees])].map(u => this.pushMe(u)))
  }

  /**
   * Joining another lobby quietly drops a solo one left behind: when `lobbyId` is still
   * solo AND `userId` is still its one member — not just solo in general — and no game is
   * running there, closes it and returns true; otherwise leaves it alone and returns
   * false. Called only from closeOwnSoloLobbyFirst, which enqueues it on `lobbyId`'s own
   * queue, so everything from here on is safe: nothing else can add a member to, or start
   * a game in, this lobby once this task starts, since every such change runs through
   * that same queue. But `closeOwnSoloLobbyFirst` reads `own` (== `lobbyId` here) BEFORE
   * enqueueing this task, so `userId` may already be stale by the time it runs — they
   * might have been removed from `lobbyId`, or left it some other way, leaving someone
   * else alone there instead. Checking `isSolo` alone isn't enough: it's true for any
   * lobby down to one member, including a different person's. Only closing when `userId`
   * is STILL that one member is what keeps this from closing a lobby out from under
   * whoever is actually alone in it now.
   */
  private async closeIfSoloAndIdle(lobbyId: string, userId: string): Promise<boolean> {
    const lobby = await q.loadLobby(this.db, lobbyId)
    if (!lobby || lobby.closedAt !== null) return false
    if (!rules.isSolo(lobby) || !rules.isMember(lobby, userId)) return false
    if (this.deps.engine.getLobbySession(lobbyId)) return false
    await this.closeNow(lobby)
    return true
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
      const lobby = await this.openAsHost(lobbyId, userId)
      const set: q.LobbyUpdate = {}
      if (patch.name !== undefined) {
        const name = patch.name.trim()
        if (name === '') throw LobbyError.badRequest('the name is empty')
        set.name = name
      }
      if (patch.nextGame !== undefined && patch.nextGame !== null && !games[patch.nextGame.gameId]) {
        throw LobbyError.badRequest(`unknown game: ${patch.nextGame.gameId}`)
      }
      if (patch.throwOrder !== undefined || patch.nextGame !== undefined) {
        const coupled = rules.coupleBullOff(lobby, patch, gameId => 'bullOff' in (games[gameId]?.defaultConfig ?? {}))
        if ('error' in coupled) throw LobbyError.badRequest(coupled.error)
        if (coupled.throwOrderChanged) set.throw_order = coupled.throwOrder
        if (coupled.nextGameChanged) set.next_game = coupled.nextGame
      }
      if (Object.keys(set).length > 0) await q.updateLobby(this.db, lobbyId, set)
      if (patch.regenerateCode === true) await this.withFreshCode(null, code => q.updateLobby(this.db, lobbyId, { code }))
      await this.reload(lobbyId)
      await this.publish(lobbyId)
    })
  }

  // ---- people -----------------------------------------------------------------------

  async addGuest(userId: string, lobbyId: string, guest: { name: string; boardId?: string | null }): Promise<{ id: string }> {
    return this.enqueue(lobbyId, async () => {
      const lobby = await this.openFor(lobbyId, userId)
      const name = guest.name.trim()
      if (name === '') throw LobbyError.badRequest('the name is empty')
      // A guest sits at their adder's board, unless the adder picks one of their own or Manual
      let boardId: string | null
      if (guest.boardId === undefined) boardId = rules.memberOf(lobby, userId)?.boardId ?? null
      else if (guest.boardId === null) boardId = null
      else boardId = (await this.ownFreeBoard(lobbyId, userId, guest.boardId)).id
      const id = ulid()
      await this.db.transaction().execute(async (trx) => {
        await q.insertPerson(trx, { id, lobbyId, userId: null, addedByUserId: userId, name, boardId, ready: true })
        await q.addActivity(trx, lobbyId, 'guest_added', userId, { name })
      })
      await this.reload(lobbyId)
      await this.publish(lobbyId)
      return { id }
    })
  }

  // A board the user owns that isn't in another game
  private async ownFreeBoard(lobbyId: string, userId: string, boardId: string): Promise<{ id: string; name: string }> {
    const board = await getBoardById(this.db, boardId)
    if (!board) throw LobbyError.badRequest('board not found')
    if (board.owner_user_id !== userId) throw LobbyError.forbidden('you can only pick your own boards')
    this.assertBoardFree(lobbyId, board.id)
    return { id: board.id, name: board.name }
  }

  // Busy: in an active game that isn't this lobby's own (that one ends before the next starts)
  private assertBoardFree(lobbyId: string, boardId: string): void {
    const session = this.deps.engine.getSessionByBoard(boardId)
    if (session && session.lobbyId !== lobbyId) throw LobbyError.conflict({ error: 'that board is in another game', code: 'board_busy' })
  }

  async updatePerson(userId: string, lobbyId: string, personId: string, patch: PersonPatch): Promise<void> {
    await this.enqueue(lobbyId, async () => {
      const lobby = await this.openFor(lobbyId, userId)
      const person = lobby.people.find(p => p.id === personId)
      if (!person) throw LobbyError.notFound('person not found')
      // Every field is checked before anything is written
      if (patch.ready !== undefined && !rules.canSetReady(userId, person)) throw LobbyError.forbidden('only they set their own ready')
      if (patch.plays !== undefined && !rules.canSetPlays(lobby, userId, person)) throw LobbyError.forbidden('only they or the host decide whether they play')
      if (patch.position !== undefined && !rules.canMove(lobby, userId)) throw LobbyError.forbidden('only the host reorders people')
      const board = patch.boardId === undefined ? undefined : await this.boardChange(lobby, userId, person, patch.boardId)

      const set: q.PersonUpdate = {}
      if (patch.ready !== undefined) set.ready = patch.ready
      if (patch.plays !== undefined) set.plays = patch.plays
      if (board) {
        set.board_id = board.boardId
        set.board_moved_by = board.movedBy
      }
      await this.db.transaction().execute(async (trx) => {
        if (Object.keys(set).length > 0) await q.updatePerson(trx, personId, set)
        if (patch.position !== undefined) await q.setPositions(trx, lobbyId, rules.reorder(lobby.people, personId, patch.position))
        if (board) {
          await q.addActivity(trx, lobbyId, 'board_moved', userId, { name: person.name, userId: person.userId, fromBoardName: person.boardName, toBoardName: board.boardName })
        }
      })
      await this.reload(lobbyId)
      await this.publish(lobbyId)
    })
  }

  // The board rule (spec, Decisions → Boards); undefined when the board stays the same
  private async boardChange(lobby: LobbyState, userId: string, person: LobbyPerson, boardId: string | null):
    Promise<{ boardId: string | null; boardName: string | null; movedBy: string | null } | undefined> {
    const target = boardId === null ? null : await getBoardById(this.db, boardId)
    if (target === undefined) throw LobbyError.badRequest('board not found')
    const allowed = rules.canSetBoard(userId, person, target === null ? null : { boardId: target.id, ownerUserId: target.owner_user_id })
    if (!allowed) throw LobbyError.forbidden('you can give out your own boards to people on Manual, change your own rows, or take your board back')
    if ((target?.id ?? null) === person.boardId) return undefined
    if (target !== null) this.assertBoardFree(lobby.id, target.id)
    // "Moved by you": someone put them on a board they (or their adder) didn't pick
    const movedBy = target !== null && rules.controllerOf(person) !== userId ? userId : null
    return { boardId: target?.id ?? null, boardName: target?.name ?? null, movedBy }
  }

  async removePerson(userId: string, lobbyId: string, personId: string): Promise<void> {
    await this.enqueue(lobbyId, async () => {
      const lobby = await this.openFor(lobbyId, userId)
      const person = lobby.people.find(p => p.id === personId)
      if (!person) throw LobbyError.notFound('person not found')
      if (!rules.canRemove(lobby, userId, person)) throw LobbyError.forbidden('the host removes people; members remove their own guests')
      if (person.userId !== null) {
        await this.dropMember(lobby, person.userId, 'removed', userId)
        return
      }
      await this.db.transaction().execute(async (trx) => {
        await q.deletePeople(trx, [person.id])
        await q.addActivity(trx, lobbyId, 'removed', userId, { name: person.name })
      })
      await this.reload(lobbyId)
      await this.publish(lobbyId)
    })
  }

  // ---- invites ----------------------------------------------------------------------

  /** Any member invites an account; it shows in the invitee's pending invites. */
  async invite(userId: string, lobbyId: string, inviteeUserId: string): Promise<{ id: string }> {
    return this.enqueue(lobbyId, async () => {
      const lobby = await this.openFor(lobbyId, userId)
      if (inviteeUserId === userId) throw LobbyError.badRequest('you are in the lobby already')
      const invitee = (await getUsersByIds(this.db, [inviteeUserId])).at(0)
      if (!invitee) throw LobbyError.notFound('account not found')
      if (rules.isMember(lobby, inviteeUserId)) throw LobbyError.conflict({ error: `${invitee.name} is in the lobby already`, code: 'already_member' })
      const invitedAlready = LobbyError.conflict({ error: `${invitee.name} is invited already`, code: 'already_invited' })
      if (lobby.invites.some(i => i.userId === inviteeUserId)) throw invitedAlready
      const id = ulid()
      try {
        await q.insertInvite(this.db, { id, lobbyId, inviteeUserId, inviterUserId: userId })
      } catch (err) {
        if (pgErrorCode(err) === UNIQUE_VIOLATION) throw invitedAlready
        throw err
      }
      await this.reload(lobbyId)
      await this.publish(lobbyId)
      return { id }
    })
  }

  async listInvites(userId: string): Promise<PendingInvite[]> {
    return (await q.pendingInvitesFor(this.db, userId)).map(inviteView)
  }

  // The user's own pending invite to an open lobby, or 404
  private async pendingInvite(userId: string, inviteId: string): Promise<{ lobbyId: string }> {
    const invite = await q.getInvite(this.db, inviteId)
    if (!invite || invite.invitee_user_id !== userId || invite.status !== 'pending') throw LobbyError.notFound('invite not found')
    return { lobbyId: invite.lobby_id }
  }

  /** Joins the lobby (which marks the invite accepted). */
  async acceptInvite(userId: string, inviteId: string): Promise<LobbyRef> {
    // pendingInvite already checked the invite is theirs and still pending, before this
    // closes their own solo lobby (see closeOwnSoloLobbyFirst); a dead invite never does.
    const { lobbyId } = await this.pendingInvite(userId, inviteId)
    await this.closeOwnSoloLobbyFirst(userId, lobbyId)
    return this.enqueue(lobbyId, async () => {
      const lobby = await this.reload(lobbyId)
      if (!lobby || lobby.closedAt !== null) throw LobbyError.notFound('invite not found')
      return this.addMember(lobby, userId)
    })
  }

  async declineInvite(userId: string, inviteId: string): Promise<void> {
    const { lobbyId } = await this.pendingInvite(userId, inviteId)
    await this.enqueue(lobbyId, async () => {
      await q.setInviteStatus(this.db, inviteId, 'declined')
      await this.reload(lobbyId)
      await this.publish(lobbyId, [userId])
    })
  }

  // ---- games ------------------------------------------------------------------------

  /** The host starts the next game with everyone who plays. */
  async start(userId: string, lobbyId: string, force: boolean): Promise<{ sessionId: string }> {
    return this.enqueue(lobbyId, async () => {
      const lobby = await this.openAsHost(lobbyId, userId)
      if (!lobby.nextGame) throw LobbyError.badRequest('pick a game first')
      const personIds = lobby.people.filter(p => p.plays).map(p => p.id)
      return this.launch(lobby, userId, { ...lobby.nextGame, personIds }, force)
    })
  }

  /** The host repeats the last game: the same people (minus who left), mode and settings. */
  async rematch(userId: string, lobbyId: string, force: boolean): Promise<{ sessionId: string }> {
    return this.enqueue(lobbyId, async () => {
      const lobby = await this.openAsHost(lobbyId, userId)
      if (!lobby.lastGame) throw LobbyError.badRequest('no game to repeat yet')
      const here = new Set(lobby.people.map(p => p.id))
      return this.launch(lobby, userId, { ...lobby.lastGame, personIds: lobby.lastGame.personIds.filter(id => here.has(id)) }, force)
    })
  }

  // Runs in the lobby's queue
  private async launch(lobby: LobbyState, hostUserId: string, game: LastGame, force: boolean): Promise<{ sessionId: string }> {
    const running = this.deps.engine.getLobbySession(lobby.id)
    if (running) throw LobbyError.conflict({ error: 'a game is running already', code: 'game_running', sessionId: running.id })
    lobby = await this.markHostReady(lobby, hostUserId)
    const planned = planGame(lobby, game, { force, isBoardOnline: this.deps.isBoardOnline, starterUserId: hostUserId })
    if (!planned.ok) throw planError(planned.problem)
    const { plan } = planned
    let sessionId: string
    try {
      ({ sessionId } = await this.deps.engine.createWithSeats({
        ownerUserId: hostUserId, gameId: plan.gameId, config: plan.config, seats: plan.seats,
        shuffleSeats: plan.shuffleSeats, lobbyId: lobby.id, lobbyName: rules.isSolo(lobby) ? null : lobby.name,
      }))
    } catch (err) {
      throw this.startError(lobby, hostUserId, err)
    }
    // The lobby shows who plays this game; a rematch repeats it
    await q.updateLobby(this.db, lobby.id, { last_game: { gameId: plan.gameId, config: game.config, personIds: plan.personIds } })
    await q.setPlaying(this.db, lobby.id, plan.personIds)
    await this.reload(lobby.id)
    await this.publish(lobby.id)
    return { sessionId }
  }

  /**
   * Pressing Start (or Rematch) is the host's own ready: set it, persisted and published,
   * before planning the game runs, so everyone (the host included, while they're answering
   * "Start anyway?") sees the host ready. Returns the lobby reloaded if it changed.
   */
  private async markHostReady(lobby: LobbyState, hostUserId: string): Promise<LobbyState> {
    const host = rules.memberOf(lobby, hostUserId)
    if (!host || host.ready) return lobby
    await q.updatePerson(this.db, host.id, { ready: true })
    await this.reload(lobby.id)
    await this.publish(lobby.id)
    return this.cache.get(lobby.id) ?? lobby
  }

  private startError(lobby: LobbyState, hostUserId: string, err: unknown): unknown {
    if (err instanceof ActiveSessionError) {
      const name = rules.memberOf(lobby, err.userId)?.name ?? 'A player'
      return LobbyError.conflict({
        error: `${name} already has a game running`, code: 'active_session',
        ...(err.userId === hostUserId ? { sessionId: err.sessionId } : {}),
      })
    }
    if (err instanceof BoardBusyError) return LobbyError.conflict({ error: 'a board is in another game', code: 'board_busy' })
    return err
  }

  /**
   * The engine's `ended` hook: the lobby's game finished (or was aborted). Everyone plays
   * again, members aren't ready, guests are; the feed gets a line; a host who left
   * during the game hands over now, and a lobby everyone left closes.
   */
  onGameEnded(e: GameEnded): void {
    const lobbyId = e.lobbyId
    if (lobbyId === null) return
    this.enqueue(lobbyId, async () => {
      const lobby = await this.reload(lobbyId)
      if (!lobby || lobby.closedAt !== null) return
      await this.db.transaction().execute(async (trx) => {
        await q.resetAfterGame(trx, lobbyId)
        if (e.status === 'finished') {
          const winner = e.results.find(r => r.placement === 1 && !r.forfeited)
          await q.addActivity(trx, lobbyId, 'game_played', null, { sessionId: e.sessionId, gameId: e.gameId, winnerName: winner?.name ?? null, players: e.results })
        } else {
          await q.addActivity(trx, lobbyId, 'game_aborted', e.abortedByUserId, { sessionId: e.sessionId, gameId: e.gameId })
        }
      })
      if (await this.settleHost(lobbyId) === 'open') await this.publish(lobbyId)
    }).catch((err: unknown) => { this.warn('lobby reset after a game failed', { lobbyId, sessionId: e.sessionId, error: String(err) }) })
  }

  /**
   * A lobby game changed (every snapshot push): members' indicators follow whose turn it
   * is. Only lobbies loaded in this process are pushed; /ws/me loads its user's lobby when
   * it opens.
   */
  async onSessionPush(sessionId: string): Promise<void> {
    const lobbyId = this.deps.engine.getSession(sessionId)?.lobbyId ?? null
    if (lobbyId === null) return
    const lobby = this.cache.get(lobbyId)
    if (!lobby) return
    await Promise.all(memberIds(lobby).map(u => this.pushMe(u)))
  }

  // ---- boards -----------------------------------------------------------------------

  /** A board is being deleted: everyone on it, in any lobby, goes to Manual. */
  async releaseBoard(boardId: string): Promise<void> {
    const lobbyIds = await q.releaseBoard(this.db, boardId)
    for (const id of lobbyIds) {
      await this.enqueue(id, async () => {
        await this.reload(id)
        await this.publish(id)
      })
    }
  }

  /** A board's bridge connected or dropped: lobbies using it show it. */
  onBoardPresence(boardId: string): void {
    for (const lobby of this.cache.values()) {
      if (lobby.people.some(p => p.boardId === boardId)) this.send(lobby)
    }
  }
}
