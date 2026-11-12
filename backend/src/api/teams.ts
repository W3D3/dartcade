// Named teams (schema/api-v1.yaml, tag teams), behind tournaments.enabled. The captain edits the
// team, invites, removes and hands over; a member leaves; an invitee joins or declines. The limits
// are shared/teams.ts's TEAM_LIMITS.
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import { ulid } from 'ulid'
import type { Database } from '../db/schema.js'
import type { LobbyHub } from '../lobby/hub.js'
import type { LobbyService } from '../lobby/service.js'
import { requireAuth } from '../auth/middleware.js'
import { pgErrorCode, UNIQUE_VIOLATION } from '../db/errors.js'
import { getUsersByIds } from '../db/queries.js'
import * as q from '../db/teams.js'
import { flagEnabled, loadFlagUser } from '../flags/index.js'
import { cleanTeamName, cleanTeamTag, TEAM_LIMITS, teamNameProblem } from '../shared/teams.js'
import type { components } from '../schema/api.js'
import { ApiError, notFound } from './errors.js'
import { requireTournamentsFlag } from './flagGate.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & {
  db: Kysely<Database>
  /** Refreshes /ws/me (its team invites) for these players. */
  lobbies: Pick<LobbyService, 'pushMe'>
  hub: Pick<LobbyHub, 'sendTeamInvite'>
}

type ConflictCode = components['schemas']['TeamConflict']['code']
const conflict = (code: ConflictCode, error: string) => new ApiError(409, { error, code })
const forbidden = (error: string) => new ApiError(403, { error })
const invalid = (field: string, message: string) =>
  new ApiError(400, { error: 'invalid request', details: [{ path: `body/${field}`, message }] })

function teamName(raw: string): string {
  const name = cleanTeamName(raw)
  const problem = teamNameProblem(name)
  if (problem) throw invalid('name', problem)
  return name
}

/** Runs `write`; a second team with the same name (ignoring case) is a 409. */
async function namedWrite<T>(name: string | undefined, write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (err) {
    if (name !== undefined && pgErrorCode(err) === UNIQUE_VIOLATION) throw conflict('name_taken', `There is a team called ${name} already`)
    throw err
  }
}

/** The team, locked for the caller's transaction, if the user is in it; 404 otherwise (a team you're not in looks absent). */
async function teamOf(db: Kysely<Database>, teamId: string, userId: string): Promise<q.TeamRow> {
  const team = await q.lockTeam(db, teamId)
  if (!team || !(await q.isMember(db, teamId, userId))) throw notFound()
  return team
}

async function captainOf(db: Kysely<Database>, teamId: string, userId: string): Promise<q.TeamRow> {
  const team = await teamOf(db, teamId, userId)
  if (team.captain_user_id !== userId) throw forbidden('Only the captain can do that')
  return team
}

/** Invites the account to the team (in the caller's transaction, with the team locked); the invite's id. */
async function invite(trx: Kysely<Database>, teamId: string, inviteeId: string, inviterId: string): Promise<string> {
  const invitee = (await getUsersByIds(trx, [inviteeId])).at(0)
  if (!invitee) throw new ApiError(404, { error: 'account not found' })
  if (!(await flagEnabled('tournaments.enabled', await loadFlagUser(trx, inviteeId))))
    throw conflict('unavailable', `${invitee.name} can't join teams yet`)
  if (await q.isMember(trx, teamId, inviteeId)) throw conflict('already_member', `${invitee.name} is in the team already`)
  if ((await q.teamCount(trx, inviteeId)) >= TEAM_LIMITS.teamsPerPlayer)
    throw conflict('too_many_teams', `${invitee.name} is in ${TEAM_LIMITS.teamsPerPlayer} teams already`)
  if ((await q.placesTaken(trx, teamId)) >= TEAM_LIMITS.maxPlayers)
    throw conflict('team_full', `A team has at most ${TEAM_LIMITS.maxPlayers} players, invites included`)
  const id = ulid()
  const expiresAt = new Date(Date.now() + TEAM_LIMITS.inviteDays * 24 * 60 * 60 * 1000)
  if (!(await q.insertInvite(trx, { id, teamId, inviteeUserId: inviteeId, inviterUserId: inviterId, expiresAt })))
    throw conflict('already_invited', `${invitee.name} is invited already`)
  return id
}

export function teamsApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db, lobbies, hub } = opts

  // Every route here: 404 while tournaments are off for the caller (after requireAuth, a preValidation)
  app.addHook('preHandler', async req => requireTournamentsFlag(db, req.userId))

  const refreshMe = (userIds: string[]) => Promise.allSettled(userIds.map(u => lobbies.pushMe(u)))

  /** Tells each invitee (a toast, and their pending invites). */
  async function announce(invites: { id: string; userId: string }[]): Promise<void> {
    await Promise.allSettled(
      invites.map(async ({ id, userId }) => {
        const pending = (await q.pendingInvitesFor(db, userId)).find(i => i.id === id)
        if (pending) hub.sendTeamInvite(userId, { type: 'team.invite', invite: pending })
        await lobbies.pushMe(userId)
      }),
    )
  }

  app.get<Route<'listTeams'>>('/api/teams', { preValidation: requireAuth, schema: fromSpec('listTeams') }, async req => {
    const me = req.userId
    const [teams, invites] = await Promise.all([q.teamsOf(db, me), q.pendingInvitesFor(db, me)])
    return { teams, invites }
  })

  app.post<Route<'createTeam'>>('/api/teams', { preValidation: requireAuth, schema: fromSpec('createTeam') }, async (req, reply) => {
    const me = req.userId
    const name = teamName(req.body.name)
    const id = ulid()
    const invited = await namedWrite(name, () =>
      db.transaction().execute(async trx => {
        await q.lockPlayerTeams(trx, me)
        if ((await q.teamCount(trx, me)) >= TEAM_LIMITS.teamsPerPlayer)
          throw conflict('too_many_teams', `You can be in up to ${TEAM_LIMITS.teamsPerPlayer} teams`)
        await q.insertTeam(trx, { id, name, tag: cleanTeamTag(req.body.tag), color: req.body.color, captainUserId: me })
        const out: { id: string; userId: string }[] = []
        for (const userId of (req.body.invite ?? []).filter(u => u !== me)) out.push({ id: await invite(trx, id, userId, me), userId })
        return out
      }),
    )
    await announce(invited)
    return reply.code(201).send({ id })
  })

  app.patch<Route<'updateTeam'>>('/api/teams/:id', { preValidation: requireAuth, schema: fromSpec('updateTeam') }, async (req, reply) => {
    const name = req.body.name === undefined ? undefined : teamName(req.body.name)
    const tag = req.body.tag === undefined ? undefined : cleanTeamTag(req.body.tag)
    await namedWrite(name, () =>
      db.transaction().execute(async trx => {
        const team = await captainOf(trx, req.params.id, req.userId)
        await q.updateTeam(trx, team.id, { name, tag, color: req.body.color })
      }),
    )
    return reply.code(204).send()
  })

  app.post<Route<'inviteToTeam'>>(
    '/api/teams/:id/invites',
    { preValidation: requireAuth, schema: fromSpec('inviteToTeam') },
    async (req, reply) => {
      const me = req.userId
      const inviteeId = req.body.userId
      if (inviteeId === me) throw invalid('userId', "that's you")
      const id = await db.transaction().execute(async trx => invite(trx, (await captainOf(trx, req.params.id, me)).id, inviteeId, me))
      await announce([{ id, userId: inviteeId }])
      return reply.code(201).send({ id })
    },
  )

  app.delete<Route<'cancelTeamInvite'>>(
    '/api/teams/:id/invites/:inviteId',
    { preValidation: requireAuth, schema: fromSpec('cancelTeamInvite') },
    async (req, reply) => {
      const invitee = await db.transaction().execute(async trx => {
        const team = await captainOf(trx, req.params.id, req.userId)
        const pending = await q.getInvite(trx, req.params.inviteId)
        if (!pending || pending.team_id !== team.id) throw notFound()
        await q.deleteInvite(trx, pending.id)
        return pending.invitee_user_id
      })
      await refreshMe([invitee])
      return reply.code(204).send()
    },
  )

  app.put<Route<'setTeamCaptain'>>(
    '/api/teams/:id/captain',
    { preValidation: requireAuth, schema: fromSpec('setTeamCaptain') },
    async (req, reply) => {
      await db.transaction().execute(async trx => {
        const team = await captainOf(trx, req.params.id, req.userId)
        if (!(await q.isMember(trx, team.id, req.body.userId))) throw notFound()
        await q.setCaptain(trx, team.id, req.body.userId)
      })
      return reply.code(204).send()
    },
  )

  app.delete<Route<'removeTeamMember'>>(
    '/api/teams/:id/members/:userId',
    { preValidation: requireAuth, schema: fromSpec('removeTeamMember') },
    async (req, reply) => {
      const me = req.userId
      const target = req.params.userId
      const withdrawn = await db.transaction().execute(async trx => {
        const team = await teamOf(trx, req.params.id, me)
        if (target !== me && team.captain_user_id !== me) throw forbidden('Only the captain can remove players')
        if (!(await q.isMember(trx, team.id, target))) throw notFound()
        if (target !== team.captain_user_id) {
          await q.removeMember(trx, team.id, target)
          return []
        }
        // The captain leaving: only when alone, and then the team goes (with its invites)
        if ((await q.memberCount(trx, team.id)) > 1) throw conflict('captain_must_hand_over', 'Make someone else captain before you leave')
        const invitees = await q.inviteeIds(trx, team.id)
        await q.deleteTeam(trx, team.id)
        return invitees
      })
      await refreshMe(withdrawn)
      return reply.code(204).send()
    },
  )

  app.post<Route<'acceptTeamInvite'>>(
    '/api/team-invites/:inviteId/accept',
    { preValidation: requireAuth, schema: fromSpec('acceptTeamInvite') },
    async (req, reply) => {
      const me = req.userId
      await db.transaction().execute(async trx => {
        await q.lockPlayerTeams(trx, me)
        const pending = await q.getInvite(trx, req.params.inviteId)
        if (!pending || pending.invitee_user_id !== me) throw new ApiError(404, { error: 'invite not found' })
        await q.lockTeam(trx, pending.team_id)
        if ((await q.teamCount(trx, me)) >= TEAM_LIMITS.teamsPerPlayer)
          throw conflict('too_many_teams', `You can be in up to ${TEAM_LIMITS.teamsPerPlayer} teams; leave one first`)
        await q.joinTeam(trx, pending.id, pending.team_id, me)
      })
      await refreshMe([me])
      return reply.code(204).send()
    },
  )

  app.post<Route<'declineTeamInvite'>>(
    '/api/team-invites/:inviteId/decline',
    { preValidation: requireAuth, schema: fromSpec('declineTeamInvite') },
    async (req, reply) => {
      const me = req.userId
      const pending = await q.getInvite(db, req.params.inviteId)
      if (!pending || pending.invitee_user_id !== me) throw new ApiError(404, { error: 'invite not found' })
      await q.deleteInvite(db, pending.id)
      await refreshMe([me])
      return reply.code(204).send()
    },
  )

  done()
}
