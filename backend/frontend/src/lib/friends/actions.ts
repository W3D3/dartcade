// The Friends page's requests to the server. Each resolves with what to show, never throws on a
// refusal; the updated list comes back on /ws/me.
import { api } from '$lib/api'
import { describeConflict, type Refusal } from '$lib/lobby/input'
import { joinRefusal, parseFriendName, sendOutcome } from './view'

export async function sendRequest(raw: string): Promise<{ ok: boolean; text: string }> {
  const name = parseFriendName(raw)
  if (name === '') return { ok: false, text: 'Type their name' }
  const res = await api.POST('/api/friends/requests', { body: { name } })
  return sendOutcome(res.response.status, res.error, name)
}

export async function answerRequest(id: string, answer: 'accept' | 'decline'): Promise<string | null> {
  const res = answer === 'accept'
    ? await api.POST('/api/friends/requests/{id}/accept', { params: { path: { id } } })
    : await api.POST('/api/friends/requests/{id}/decline', { params: { path: { id } } })
  return res.error ? res.error.error : null
}

export async function cancelRequest(id: string): Promise<string | null> {
  const res = await api.DELETE('/api/friends/requests/{id}', { params: { path: { id } } })
  return res.error ? res.error.error : null
}

export async function removeFriend(userId: string): Promise<string | null> {
  const res = await api.DELETE('/api/friends/{userId}', { params: { path: { userId } } })
  return res.error ? res.error.error : null
}

export async function inviteFriend(lobbyId: string, userId: string): Promise<string | null> {
  const res = await api.POST('/api/lobbies/{id}/invites', { params: { path: { id: lobbyId } }, body: { userId } })
  return res.error ? describeConflict(res.error) : null
}

export type JoinResult = { kind: 'joined' } | { kind: 'switch'; from: string } | { kind: 'refused'; text: string }

/** Join a friend's lobby without the code. In another (shared) lobby: ask before leaving it. */
export async function joinFriend(lobbyId: string): Promise<JoinResult> {
  const res = await api.POST('/api/lobbies/{id}/join', { params: { path: { id: lobbyId } }, body: {} })
  if (res.data) return { kind: 'joined' }
  const r: Refusal = res.error
  if (r.code === 'in_lobby' && r.lobbyId) return { kind: 'switch', from: r.lobbyId }
  return { kind: 'refused', text: joinRefusal(res.response.status, r) }
}
