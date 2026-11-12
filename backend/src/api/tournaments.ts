// Tournaments (schema/api-v1.yaml, tag tournaments). Every route needs a session and answers 404
// while tournaments.enabled is off for the caller (the plugin's hooks).
import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import type { components } from '../schema/api.js'
import { requireAuth } from '../auth/middleware.js'
import { isAdmin } from '../auth/admin.js'
import { areFriends } from '../db/friends.js'
import {
  deleteDraft,
  getTournament,
  insertTournamentCapped,
  listOrganizedTournaments,
  listPublicTournaments,
  moveTournament,
  organizerRole,
  updateTournament,
  type BrowseRow,
  type OrganizerRole,
  type TournamentView,
} from '../db/tournaments.js'
import { flagEnabled, loadFlagUser } from '../flags/index.js'
import { validateOptions } from '../games/configMeta.js'
import { games } from '../games/index.js'
import { normalizeName } from '../shared/names.js'
import { MAX_UNFINISHED_TOURNAMENTS, lockedChanges, setupProblems, startProblems, type Problem } from '../shared/tournaments/setup.js'
import { ApiError, notFound } from './errors.js'
import { requireTournamentsFlag } from './flagGate.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }
type Input = components['schemas']['TournamentInput']
/** A setup as stored: a tournament made elsewhere (official ones, later games) may hold any game and size. */
type Setup = Omit<Input, 'gameId' | 'maxEntries'> & { gameId: string; maxEntries: number }
type Tournament = components['schemas']['Tournament']

const summary = (t: BrowseRow) => ({
  id: t.id,
  name: t.name,
  kind: t.kind,
  access: t.access,
  status: t.status,
  gameId: t.game_id,
  format: t.format,
  teamSize: t.team_size,
  maxEntries: t.max_entries,
  entries: t.entries,
  startsAt: t.starts_at?.toISOString() ?? null,
})

/** Someone registered for an online tournament: its setup is locked. In person the organizers add the players and keep editing. */
const isLocked = (t: TournamentView) => t.access !== 'in_person' && t.has_entries

function toApi(t: TournamentView, role: OrganizerRole | null): Tournament {
  return {
    ...storedInput(t),
    id: t.id,
    kind: t.kind,
    status: t.status,
    entries: t.entries,
    owner: t.owner_user_id !== null && t.owner_name !== null ? { id: t.owner_user_id, name: t.owner_name } : null,
    role,
    locked: isLocked(t),
    createdAt: t.created_at.toISOString(),
    publishedAt: t.published_at?.toISOString() ?? null,
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

export function tournamentsApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts
  // Before the body is validated: with the flag off even a bad request answers 404
  app.addHook('preValidation', requireAuth)
  app.addHook('preValidation', async req => requireTournamentsFlag(db, req.userId))

  /** The tournament with the caller's role; 404 for a draft or a friends-only one they may not see. */
  async function visible(id: string, userId: string): Promise<{ t: TournamentView; role: OrganizerRole | null }> {
    const t = await getTournament(db, id)
    if (!t) throw notFound()
    const role = await organizerRole(db, t, userId)
    if (role) return { t, role }
    if (t.status === 'draft') throw notFound()
    if (t.access === 'friends' && !(t.owner_user_id !== null && (await areFriends(db, t.owner_user_id, userId)))) throw notFound()
    return { t, role }
  }

  /** As visible, and 403 unless the caller organizes it. */
  async function organized(id: string, userId: string): Promise<{ t: TournamentView; role: OrganizerRole }> {
    const { t, role } = await visible(id, userId)
    if (!role) throw new ApiError(403, { error: 'only organizers can do this' })
    return { t, role }
  }

  async function respond(id: string, role: OrganizerRole | null): Promise<Tournament> {
    const t = await getTournament(db, id)
    if (!t) throw notFound()
    return toApi(t, role)
  }

  app.get<Route<'listTournaments'>>('/api/tournaments', { schema: fromSpec('listTournaments') }, async () => ({
    tournaments: (await listPublicTournaments(db)).map(summary),
  }))

  app.post<Route<'createTournament'>>('/api/tournaments', { schema: fromSpec('createTournament') }, async (req, reply) => {
    const user = await loadFlagUser(db, req.userId)
    if (!(user && isAdmin(user)) && !(await flagEnabled('tournaments.community.enabled', user)))
      throw new ApiError(403, { error: 'you cannot create tournaments yet' })
    const input = cleanText(req.body)
    check(input, new Date())
    const id = randomUUID()
    const created = await insertTournamentCapped(db, { id, owner_user_id: req.userId, kind: 'community', ...columns(input) })
    if (!created)
      throw new ApiError(409, {
        error: 'limit reached',
        details: [{ path: 'body', message: `at most ${MAX_UNFINISHED_TOURNAMENTS} tournaments that are not finished or cancelled` }],
      })
    return reply.code(201).send(await respond(id, 'owner'))
  })

  app.get<Route<'listMyTournaments'>>('/api/tournaments/mine', { schema: fromSpec('listMyTournaments') }, async req => {
    const rows = await listOrganizedTournaments(db, req.userId)
    return { tournaments: rows.map(t => toApi(t, t.owner_user_id === req.userId ? 'owner' : 'organizer')) }
  })

  app.get<Route<'getTournament'>>('/api/tournaments/:id', { schema: fromSpec('getTournament') }, async req => {
    const { t, role } = await visible(req.params.id, req.userId)
    return toApi(t, role)
  })

  app.patch<Route<'updateTournament'>>('/api/tournaments/:id', { schema: fromSpec('updateTournament') }, async req => {
    const { t, role } = await organized(req.params.id, req.userId)
    if (t.status !== 'draft' && t.status !== 'open') throw conflict(`a ${t.status} tournament cannot be changed`)
    const before = storedInput(t)
    const next = cleanText({ ...before, ...req.body })
    const changed = lockedChanges(before, next)
    if (isLocked(t) && changed.length > 0)
      throw new ApiError(409, {
        error: 'locked',
        details: changed.map(f => ({ path: `body/${f.replace('.', '/')}`, message: 'cannot change once someone registered' })),
      })
    const moved =
      at(next.startsAt) !== at(before.startsAt) || next.settings.registrationClosesMinutes !== before.settings.registrationClosesMinutes
    check(next, moved ? new Date() : null)
    // A registration landing meanwhile locks the fields this changes
    const unregistered = changed.length > 0 && t.access !== 'in_person'
    if (!(await updateTournament(db, t.id, columns(next), { status: t.status, unregistered })))
      throw conflict('the tournament changed meanwhile')
    return respond(t.id, role)
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
    return respond(t.id, role)
  })

  app.post<Route<'cancelTournament'>>('/api/tournaments/:id/cancel', { schema: fromSpec('cancelTournament') }, async req => {
    const { t, role } = await organized(req.params.id, req.userId)
    if (!(await moveTournament(db, t.id, 'cancel'))) throw conflict(`a ${t.status} tournament cannot be cancelled`)
    return respond(t.id, role)
  })

  done()
}
