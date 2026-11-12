// The Teams tab's requests. Each resolves with the server's reason when refused (null when done),
// never throws on a refusal; the tab reloads the teams afterwards.
import { api } from '$lib/api'
import type { components } from '$lib/api/schema'
import type { TeamInvite } from '$lib/api/lobby-ws'

export type Team = components['schemas']['Team']
export type TeamColor = components['schemas']['TeamColor']
export type TeamFields = { name: string; tag: string; color: TeamColor }

const reason = (res: { error?: { error: string } }): string | null => res.error?.error ?? null

/** Your teams and invites; null when it failed. */
export async function loadTeams(): Promise<{ teams: Team[]; invites: TeamInvite[] } | null> {
  try {
    return (await api.GET('/api/teams')).data ?? null
  } catch {
    return null
  }
}

export async function createTeam(fields: TeamFields, invite: string[]): Promise<{ id: string } | { error: string }> {
  const res = await api.POST('/api/teams', { body: { ...fields, invite } })
  return res.data ?? { error: reason(res) ?? 'Could not make the team' }
}

export const updateTeam = async (id: string, fields: Partial<TeamFields>) =>
  reason(await api.PATCH('/api/teams/{id}', { params: { path: { id } }, body: fields }))

export const invitePlayer = async (id: string, userId: string) =>
  reason(await api.POST('/api/teams/{id}/invites', { params: { path: { id } }, body: { userId } }))

export const cancelInvite = async (id: string, inviteId: string) =>
  reason(await api.DELETE('/api/teams/{id}/invites/{inviteId}', { params: { path: { id, inviteId } } }))

export const makeCaptain = async (id: string, userId: string) =>
  reason(await api.PUT('/api/teams/{id}/captain', { params: { path: { id } }, body: { userId } }))

/** Removes a member, or leaves when it is you. */
export const removeMember = async (id: string, userId: string) =>
  reason(await api.DELETE('/api/teams/{id}/members/{userId}', { params: { path: { id, userId } } }))

export const answerInvite = async (inviteId: string, answer: 'accept' | 'decline') =>
  reason(
    answer === 'accept'
      ? await api.POST('/api/team-invites/{inviteId}/accept', { params: { path: { inviteId } } })
      : await api.POST('/api/team-invites/{inviteId}/decline', { params: { path: { inviteId } } }),
  )
