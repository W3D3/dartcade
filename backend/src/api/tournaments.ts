// Tournaments (schema/api-v1.yaml, tag tournaments). Every route needs a session and answers 404
// while tournaments.enabled is off for the caller (the plugin's hooks).
import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import type { components } from '../schema/api.js'
import { requireAuth } from '../auth/middleware.js'
import { isAdmin } from '../auth/admin.js'
import {
  addOrganizer,
  canOrganize,
  deleteDraft,
  friendsIn,
  getTournament,
  getTournamentByCode,
  hasPairedBoard,
  ownedBoardIds,
  insertTournamentCapped,
  listBrowseTournaments,
  listOrganizers,
  moveTournament,
  registerSolo,
  spotStatus,
  removeOrganizer,
  updateTournament,
  viewerRole,
  withdrawSolo,
  type BrowseRow,
  type OrganizerRole,
  type TournamentView,
} from '../db/tournaments.js'
import { listParticipants, setParticipants, unlinkSpot, type SetParticipantsResult } from '../db/tournamentParticipants.js'
import { pgErrorCode, UNIQUE_VIOLATION } from '../db/errors.js'
import { checkIn } from '../db/tournamentRun.js'
import { getUsersByIds } from '../db/queries.js'
import { x01Forms } from '../db/ranked.js'
import { PROFILE_AVERAGE_DAYS } from '../shared/avgClass.js'
import { NO_FORM, viewerEligibility, type Eligibility, type Form } from '../shared/tournaments/avgLimit.js'
import type { LobbyHub } from '../lobby/hub.js'
import type { TournamentService } from '../tournaments/service.js'
import { myTournaments } from '../tournaments/mine.js'
import { newLobbyCode } from '../lobby/code.js'
import { flagEnabled, loadFlagUser } from '../flags/index.js'
import { validateOptions } from '../games/configMeta.js'
import { games } from '../games/index.js'
import { normalizeName } from '../shared/names.js'
import {
  MAX_ORGANIZERS,
  MAX_UNFINISHED_TOURNAMENTS,
  lockedChanges,
  setupProblems,
  startProblems,
  type Problem,
} from '../shared/tournaments/setup.js'
import { cleanEntries, participantProblems, startBlocker, type EntryInput } from '../shared/tournaments/participants.js'
import {
  registrationClosesAt,
  registrationState,
  type RegistrationState,
  type RegistrationTournament,
} from '../shared/tournaments/registration.js'
import { ApiError, notFound } from './errors.js'
import { requireTournamentsFlag } from './flagGate.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & {
  db: Kysely<Database>
  hub: Pick<LobbyHub, 'sendTournamentRequest'>
  tournaments: Pick<TournamentService, 'organizerStart' | 'withdrawn'>
}

type Input = components['schemas']['TournamentInput']
/** A setup as stored: a tournament made elsewhere (official ones, later games) may hold any game and size. */
type Setup = Omit<Input, 'gameId' | 'maxEntries'> & { gameId: string; maxEntries: number }
type Tournament = components['schemas']['Tournament']

const forRegistration = (t: TournamentView): RegistrationTournament => ({
  status: t.status,
  access: t.access,
  teamSize: t.team_size,
  maxEntries: t.max_entries,
  entries: t.entries,
  startsAt: t.starts_at?.toISOString() ?? null,
  settings: t.settings,
})

const ownerOf = (t: TournamentView) =>
  t.owner_user_id !== null && t.owner_name !== null ? { id: t.owner_user_id, name: t.owner_name } : null

/** The caller against the tournament's average limit; null without one. */
const eligibilityOf = (t: TournamentView, form: Form): Eligibility | null =>
  t.settings.avgLimit === null ? null : viewerEligibility(t.settings.avgLimit, t.team_size, form)

const eligible = (e: Eligibility | null) => e?.eligible ?? true

const formOf = async (db: Kysely<Database>, userId: string): Promise<Form> =>
  (await x01Forms(db, [userId], PROFILE_AVERAGE_DAYS)).get(userId) ?? NO_FORM

const summary = (t: BrowseRow, hasBoard: boolean, form: Form, now: Date) => {
  const eligibility = eligibilityOf(t, form)
  return {
    id: t.id,
    name: t.name,
    kind: t.kind,
    access: t.access,
    status: t.status,
    gameId: t.game_id,
    gameConfig: t.game_config,
    format: t.format,
    teamSize: t.team_size,
    maxEntries: t.max_entries,
    entries: t.entries,
    startsAt: t.starts_at?.toISOString() ?? null,
    owner: ownerOf(t),
    avgLimit: t.settings.avgLimit,
    eligibility,
    registration: registrationState(forRegistration(t), { registered: t.registered, hasBoard, eligible: eligible(eligibility) }, now),
  }
}

/** What the caller sees of a tournament besides its setup: their spot, their friends in it. */
interface Viewer {
  registered: boolean
  checkedIn: boolean
  hasBoard: boolean
  form: Form
  friendsIn: Tournament['friendsIn']
}

/** Someone registered for an online tournament: its setup is locked. In person the organizers add the players and keep editing. */
const isLocked = (t: TournamentView) => t.access !== 'in_person' && t.has_entries

function toApi(t: TournamentView, role: OrganizerRole | null, viewer: Viewer, now: Date): Tournament {
  const input = storedInput(t)
  const eligibility = eligibilityOf(t, viewer.form)
  return {
    ...input,
    id: t.id,
    kind: t.kind,
    status: t.status,
    entries: t.entries,
    owner: ownerOf(t),
    role,
    locked: isLocked(t),
    createdAt: t.created_at.toISOString(),
    publishedAt: t.published_at?.toISOString() ?? null,
    registration: registrationState(forRegistration(t), { ...viewer, eligible: eligible(eligibility) }, now),
    eligibility,
    registrationClosesAt: registrationClosesAt(input),
    friendsIn: viewer.friendsIn,
    inviteCode: role ? t.invite_code : null,
    checkedIn: viewer.checkedIn,
  }
}

function storedInput(t: TournamentView): Setup {
  return {
    name: t.name,
    description: t.description,
    access: t.access,
    gameId: t.game_id,
    gameConfig: t.game_config,
    format: t.format,
    teamSize: t.team_size,
    maxEntries: t.max_entries,
    startsAt: t.starts_at?.toISOString() ?? null,
    settings: t.settings,
  }
}

const columns = (t: Setup) => ({
  name: t.name,
  description: t.description,
  access: t.access,
  game_id: t.gameId,
  game_config: JSON.stringify(t.gameConfig),
  format: t.format,
  team_size: t.teamSize,
  max_entries: t.maxEntries,
  starts_at: t.startsAt === null ? null : new Date(t.startsAt),
  settings: JSON.stringify(t.settings),
})

/** Texts shown to other players are stored trimmed and NFC, like names. */
const cleanText = (t: Setup): Setup => ({ ...t, name: normalizeName(t.name), description: normalizeName(t.description) })

/** Game options the tournament itself decides (teams, match length, who throws first, bots). */
const TOURNAMENT_OWNED = ['format', 'teams', 'teamStart', 'firstTo', 'bullOff', 'botSpeed', 'maxRounds']

/** The game's options: only those it leaves to the game, checked by validateOptions and its module's own validate. */
function gameConfigProblem(t: Setup): Problem | null {
  const mod = games[t.gameId]
  const meta = mod?.configMeta ?? {}
  const path = 'body/gameConfig'
  const foreign = Object.keys(t.gameConfig).find(k => !(k in meta) || TOURNAMENT_OWNED.includes(k))
  if (foreign !== undefined) return { path, message: `${foreign} is not a tournament option` }
  if (!mod) return { path: 'body/gameId', message: 'unknown game' }
  const cfg = { ...mod.defaultConfig, ...t.gameConfig }
  const seats = Array.from({ length: t.teamSize * 2 }, (_, i) => ({ name: `Player ${i + 1}` }))
  const message = validateOptions(cfg, meta, { skip: TOURNAMENT_OWNED }) ?? mod.validate?.(cfg, seats) ?? null
  return message === null ? null : { path, message }
}

/** 400 with every problem; `now` also checks the start time (on create, publish, or a moved start). */
function check(t: Setup, now: Date | null): void {
  const game = gameConfigProblem(t)
  const problems = [...setupProblems(t), ...(now ? startProblems(t, now) : []), ...(game ? [game] : [])]
  if (problems.length > 0) throw new ApiError(400, { error: 'invalid request', details: problems })
}

const at = (iso: string | null) => (iso === null ? null : Date.parse(iso))
const conflict = (error: string) => new ApiError(409, { error })

/** The 409 for each reason registration is refused. */
const REFUSED: Record<Exclude<RegistrationState, 'open' | 'registered'>, string> = {
  full: 'full',
  closed: 'registration closed',
  not_eligible: 'not eligible',
  board_needed: 'paired board needed',
  team: 'team tournament',
  in_person: 'in person',
}

/** The list cleaned, or 400 with its problems (at `path` in the body) for that team size and cap. */
function checkedEntries(entries: EntryInput[], t: Pick<Setup, 'teamSize' | 'maxEntries'>, path: string): EntryInput[] {
  const cleaned = cleanEntries(entries, t.teamSize)
  const problems = participantProblems(cleaned, t).map(p => ({ ...p, path: p.path.replace('body/entries', path) }))
  if (problems.length > 0) throw new ApiError(400, { error: 'invalid request', details: problems })
  return cleaned
}

/** The answer for a list that could not be stored. */
function replaced(res: SetParticipantsResult): void {
  if (res === 'missing') throw notFound()
  if (res === 'started' || res === 'claimed') throw conflict(res)
  if (res === 'unknown id')
    throw new ApiError(400, { error: 'invalid request', details: [{ path: 'body/entries', message: 'unknown id' }] })
}

/** Invite codes are unique; a clash is retried with a fresh one. */
const CODE_ATTEMPTS = 5

export function tournamentsApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db, hub, tournaments } = opts
  // Before the body is validated: with the flag off even a bad request answers 404
  app.addHook('preValidation', requireAuth)
  app.addHook('preValidation', async req => requireTournamentsFlag(db, req.userId))

  /**
   * The tournament with the caller's role; 404 for a draft, a friends-only one of someone not
   * their friend, or an invite link's they hold no spot in and came to without its `code`.
   */
  const visible = async (id: string, userId: string, code?: string) => seen(await getTournament(db, id), userId, code)

  /** As visible, for a tournament found another way (by its invite code). */
  async function seen(
    t: TournamentView | undefined,
    userId: string,
    code?: string,
  ): Promise<{ t: TournamentView; role: OrganizerRole | null }> {
    if (!t) throw notFound()
    const seen = await viewerRole(db, t, userId, code)
    if (!seen) throw notFound()
    return { t, role: seen.role }
  }

  /** As visible, and 403 unless the caller organizes it. */
  async function organized(id: string, userId: string): Promise<{ t: TournamentView; role: OrganizerRole }> {
    const { t, role } = await visible(id, userId)
    if (!canOrganize(role)) throw new ApiError(403, { error: 'only organizers can do this' })
    return { t, role }
  }

  async function viewerOf(t: TournamentView, userId: string): Promise<Viewer> {
    const [spot, hasBoard, form, friends] = await Promise.all([
      spotStatus(db, t.id, userId),
      hasPairedBoard(db, userId),
      formOf(db, userId),
      friendsIn(db, t.id, userId),
    ])
    return { registered: spot !== null, checkedIn: spot === 'checked_in', hasBoard, form, friendsIn: friends }
  }

  async function present(t: TournamentView, role: OrganizerRole | null, userId: string): Promise<Tournament> {
    return toApi(t, role, await viewerOf(t, userId), new Date())
  }

  async function respond(id: string, role: OrganizerRole | null, userId: string): Promise<Tournament> {
    const t = await getTournament(db, id)
    if (!t) throw notFound()
    return present(t, role, userId)
  }

  app.get<Route<'listTournaments'>>('/api/tournaments', { schema: fromSpec('listTournaments') }, async req => {
    const [rows, hasBoard, form] = await Promise.all([
      listBrowseTournaments(db, req.userId),
      hasPairedBoard(db, req.userId),
      formOf(db, req.userId),
    ])
    const now = new Date()
    return { tournaments: rows.map(t => summary(t, hasBoard, form, now)) }
  })

  app.get<Route<'getTournamentForm'>>('/api/tournaments/form', { schema: fromSpec('getTournamentForm') }, async req =>
    formOf(db, req.userId),
  )

  app.post<Route<'createTournament'>>('/api/tournaments', { schema: fromSpec('createTournament') }, async (req, reply) => {
    const user = await loadFlagUser(db, req.userId)
    if (!(user && isAdmin(user)) && !(await flagEnabled('tournaments.community.enabled', user)))
      throw new ApiError(403, { error: 'you cannot create tournaments yet' })
    const input = await pickedBoards(cleanText(req.body), req.userId, [])
    check(input, new Date())
    const id = randomUUID()
    const created = await withFreshCode(code =>
      insertTournamentCapped(db, { id, owner_user_id: req.userId, kind: 'community', invite_code: code, ...columns(input) }),
    )
    if (!created)
      throw new ApiError(409, {
        error: 'limit reached',
        details: [{ path: 'body', message: `at most ${MAX_UNFINISHED_TOURNAMENTS} tournaments that are not finished or cancelled` }],
      })
    return reply.code(201).send(await respond(id, 'owner', req.userId))
  })

  app.get<Route<'listMyTournaments'>>('/api/tournaments/mine', { schema: fromSpec('listMyTournaments') }, async req => {
    return myTournaments(db, req.userId, new Date())
  })

  app.get<Route<'getTournament'>>('/api/tournaments/:id', { schema: fromSpec('getTournament') }, async req => {
    const { t, role } = await visible(req.params.id, req.userId)
    return present(t, role, req.userId)
  })

  app.get<Route<'getTournamentByCode'>>('/api/tournaments/code/:code', { schema: fromSpec('getTournamentByCode') }, async req => {
    const { t, role } = await seen(await getTournamentByCode(db, req.params.code.toUpperCase()), req.userId, req.params.code)
    return present(t, role, req.userId)
  })

  app.post<Route<'registerForTournament'>>(
    '/api/tournaments/:id/registration',
    { schema: fromSpec('registerForTournament') },
    async req => {
      const { t, role } = await visible(req.params.id, req.userId, req.query.code)
      const [user, hasBoard, form] = await Promise.all([
        getUsersByIds(db, [req.userId]),
        hasPairedBoard(db, req.userId),
        formOf(db, req.userId),
      ])
      const name = user.at(0)?.name
      if (name === undefined) throw notFound()
      const state = await registerSolo(db, t.id, { id: req.userId, name, hasBoard, eligible: eligible(eligibilityOf(t, form)) }, new Date())
      if (state === null) throw notFound()
      if (state !== 'open' && state !== 'registered') throw conflict(REFUSED[state])
      return respond(t.id, role, req.userId)
    },
  )

  app.delete<Route<'withdrawFromTournament'>>(
    '/api/tournaments/:id/registration',
    { schema: fromSpec('withdrawFromTournament') },
    async req => {
      const { t, role } = await visible(req.params.id, req.userId)
      if (!(await withdrawSolo(db, t.id, req.userId))) throw conflict('not registered, or the tournament is over')
      if (t.status === 'running') await tournaments.withdrawn(t.id, req.userId)
      return respond(t.id, role, req.userId)
    },
  )

  app.patch<Route<'updateTournament'>>('/api/tournaments/:id', { schema: fromSpec('updateTournament') }, async req => {
    const { t, role } = await organized(req.params.id, req.userId)
    if (t.status !== 'draft' && t.status !== 'open') throw conflict(`a ${t.status} tournament cannot be changed`)
    const { participants: list, ...patch } = req.body
    const before = storedInput(t)
    const next = await pickedBoards(cleanText({ ...before, ...patch }), req.userId, before.settings.boardIds ?? [])
    const changed = lockedChanges(before, next)
    if (isLocked(t) && changed.length > 0)
      throw new ApiError(409, {
        error: 'locked',
        details: changed.map(f => ({ path: `body/${f.replace('.', '/')}`, message: 'cannot change once someone registered' })),
      })
    if (list && next.access !== 'in_person') throw conflict('not in person')
    // In person the spots are entries: who may join stays, and a new team size comes with its new list
    const shape = {
      access: next.access !== before.access,
      teamSize: next.teamSize !== before.teamSize && !list,
    }
    if (t.access === 'in_person' && t.has_entries && (shape.access || shape.teamSize))
      throw new ApiError(409, {
        error: 'locked',
        details: [
          ...(shape.access ? [{ path: 'body/access', message: 'remove the players before it can be joined online' }] : []),
          ...(shape.teamSize ? [{ path: 'body/teamSize', message: 'send the players with the new team size' }] : []),
        ],
      })
    const moved =
      at(next.startsAt) !== at(before.startsAt) || next.settings.registrationClosesMinutes !== before.settings.registrationClosesMinutes
    check(next, moved ? new Date() : null)
    if (list) {
      replaced(await setParticipants(db, t.id, checkedEntries(list.entries, next, 'body/participants/entries'), columns(next)))
      return respond(t.id, role, req.userId)
    }
    // A registration (or in person, a spot) landing meanwhile locks the fields this changes
    const unregistered = t.access === 'in_person' ? shape.access || shape.teamSize : changed.length > 0
    if (!(await updateTournament(db, t.id, columns(next), { status: t.status, unregistered })))
      throw conflict('the tournament changed meanwhile')
    return respond(t.id, role, req.userId)
  })

  app.delete<Route<'deleteTournament'>>('/api/tournaments/:id', { schema: fromSpec('deleteTournament') }, async (req, reply) => {
    const { t } = await organized(req.params.id, req.userId)
    if (!(await deleteDraft(db, t.id))) throw conflict('only a draft is deleted; cancel a published tournament')
    return reply.code(204).send()
  })

  app.post<Route<'publishTournament'>>('/api/tournaments/:id/publish', { schema: fromSpec('publishTournament') }, async req => {
    const { t, role } = await organized(req.params.id, req.userId)
    if (t.status !== 'draft') throw conflict(`a ${t.status} tournament is already published`)
    check(storedInput(t), new Date())
    if (!(await moveTournament(db, t.id, 'publish'))) throw conflict('the tournament changed meanwhile')
    return respond(t.id, role, req.userId)
  })

  app.post<Route<'startTournament'>>('/api/tournaments/:id/start', { schema: fromSpec('startTournament') }, async req => {
    const { t, role } = await organized(req.params.id, req.userId)
    if ((await tournaments.organizerStart(t.id)) !== 'started')
      throw conflict('only an open online tournament without a start time is started by hand')
    return respond(t.id, role, req.userId)
  })

  app.post<Route<'checkInToTournament'>>('/api/tournaments/:id/check-in', { schema: fromSpec('checkInToTournament') }, async req => {
    const { t, role } = await visible(req.params.id, req.userId)
    if (!(await checkIn(db, t.id, req.userId))) throw conflict('not registered, checked in already, or not check-in time')
    return respond(t.id, role, req.userId)
  })

  app.post<Route<'cancelTournament'>>('/api/tournaments/:id/cancel', { schema: fromSpec('cancelTournament') }, async req => {
    const { t, role } = await organized(req.params.id, req.userId)
    if (!(await moveTournament(db, t.id, 'cancel'))) throw conflict(`a ${t.status} tournament cannot be cancelled`)
    return respond(t.id, role, req.userId)
  })

  const organizersOf = async (t: TournamentView) => ({
    organizers: (await listOrganizers(db, t)).map(o => ({
      id: o.id,
      name: o.name,
      role: o.role,
      addedAt: o.added_at?.toISOString() ?? null,
    })),
  })

  app.get<Route<'listTournamentOrganizers'>>(
    '/api/tournaments/:id/organizers',
    { schema: fromSpec('listTournamentOrganizers') },
    async req => organizersOf((await visible(req.params.id, req.userId)).t),
  )

  app.post<Route<'addTournamentOrganizer'>>(
    '/api/tournaments/:id/organizers',
    { schema: fromSpec('addTournamentOrganizer') },
    async (req, reply) => {
      const { t, role } = await organized(req.params.id, req.userId)
      if (role !== 'owner') throw new ApiError(403, { error: 'only the owner can add or remove organizers' })
      if (t.status === 'finished' || t.status === 'cancelled') throw conflict(`a ${t.status} tournament has no use for more organizers`)
      const { userId } = req.body
      const users = await getUsersByIds(db, [userId, req.userId])
      if (!users.some(u => u.id === userId)) throw notFound()
      if (userId === t.owner_user_id) throw conflict('they own it already')
      const added = await addOrganizer(db, t.id, userId)
      if (added === 'full') throw conflict(`at most ${MAX_ORGANIZERS} organizers`)
      if (added === 'exists') throw conflict('they are an organizer already')
      hub.sendTournamentRequest(userId, {
        type: 'tournament.request',
        tournamentId: t.id,
        tournamentName: t.name,
        role: 'organizer',
        from: { id: req.userId, name: users.find(u => u.id === req.userId)?.name ?? '' },
      })
      return reply.code(201).send(await organizersOf(t))
    },
  )

  app.delete<Route<'removeTournamentOrganizer'>>(
    '/api/tournaments/:id/organizers/:userId',
    { schema: fromSpec('removeTournamentOrganizer') },
    async (req, reply) => {
      const { t, role } = await organized(req.params.id, req.userId)
      const { userId } = req.params
      if (userId === t.owner_user_id) throw conflict('the owner cannot step down; cancel or delete the tournament instead')
      // An organizer may leave, never remove someone else
      if (role !== 'owner' && userId !== req.userId) throw new ApiError(403, { error: 'only the owner can add or remove organizers' })
      if (!(await removeOrganizer(db, t.id, userId))) throw notFound()
      return reply.code(204).send()
    },
  )

  /**
   * The boards the venue may score on, each listed once: a board newly picked must be one the caller
   * paired (a co-organizer keeps the ones the owner picked, `kept`), or 400.
   */
  async function pickedBoards(t: Setup, userId: string, kept: readonly string[]): Promise<Setup> {
    if (!t.settings.boardIds) return t
    const boardIds = [...new Set(t.settings.boardIds)]
    const added = boardIds.filter(id => !kept.includes(id))
    if ((await ownedBoardIds(db, userId, added)).length !== added.length)
      throw new ApiError(400, {
        error: 'invalid request',
        details: [{ path: 'body/settings/boardIds', message: 'only boards you paired' }],
      })
    return { ...t, settings: { ...t.settings, boardIds } }
  }

  /** As organized, and 409 unless its organizers add the players themselves. */
  async function inPerson(id: string, userId: string): Promise<TournamentView> {
    const { t } = await organized(id, userId)
    if (t.access !== 'in_person') throw conflict('not in person')
    return t
  }

  const participantsOf = async (t: TournamentView) => {
    const entries = await listParticipants(db, t.id)
    return { entries, startBlocker: startBlocker(entries, t.team_size) }
  }

  app.get<Route<'listTournamentParticipants'>>(
    '/api/tournaments/:id/participants',
    { schema: fromSpec('listTournamentParticipants') },
    async req => participantsOf(await inPerson(req.params.id, req.userId)),
  )

  app.put<Route<'setTournamentParticipants'>>(
    '/api/tournaments/:id/participants',
    { schema: fromSpec('setTournamentParticipants') },
    async req => {
      const t = await inPerson(req.params.id, req.userId)
      replaced(await setParticipants(db, t.id, checkedEntries(req.body.entries, storedInput(t), 'body/entries')))
      return participantsOf(t)
    },
  )

  app.post<Route<'unlinkTournamentSpot'>>(
    '/api/tournaments/:id/participants/:playerId/unlink',
    { schema: fromSpec('unlinkTournamentSpot') },
    async req => {
      const t = await inPerson(req.params.id, req.userId)
      if (!(await unlinkSpot(db, t.id, req.params.playerId))) throw notFound()
      return participantsOf(t)
    },
  )

  done()
}

/** Runs `insert` with fresh invite codes until one is free. */
async function withFreshCode<T>(insert: (code: string) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await insert(newLobbyCode())
    } catch (err) {
      if (pgErrorCode(err) !== UNIQUE_VIOLATION || attempt >= CODE_ATTEMPTS) throw err
    }
  }
}
