// The changes the lobby screens make to a lobby (the lobby page, the Play page's next game).
// Each resolves with the server's refusal, if any; the change itself comes back on the socket.
import { api } from '$lib/api'
import type { TeamId } from '../api/lobby-ws'
import type { Refusal } from './input'
import type { LobbyPatch, PersonPatch } from './rules'

export type ActionResult = { error?: Refusal }

export function lobbyActions(id: string) {
  return {
    updateLobby: (patch: LobbyPatch): Promise<ActionResult> =>
      api.PATCH('/api/lobbies/{id}', { params: { path: { id } }, body: patch }),
    updatePerson: (personId: string, patch: PersonPatch): Promise<ActionResult> =>
      api.PATCH('/api/lobbies/{id}/people/{personId}', { params: { path: { id, personId } }, body: patch }),
    removePerson: (personId: string): Promise<ActionResult> =>
      api.DELETE('/api/lobbies/{id}/people/{personId}', { params: { path: { id, personId } } }),
    addGuest: (name: string): Promise<ActionResult> =>
      api.POST('/api/lobbies/{id}/people', { params: { path: { id } }, body: { name } }),
    invite: (userId: string): Promise<ActionResult> =>
      api.POST('/api/lobbies/{id}/invites', { params: { path: { id } }, body: { userId } }),
    /** Host: move someone to this team. */
    setTeam: (personId: string, team: TeamId): Promise<ActionResult> =>
      api.PATCH('/api/lobbies/{id}/people/{personId}', { params: { path: { id, personId } }, body: { team } }),
    /** Host: a random 50/50 split of who plays into Team A and Team B; 400 outside a team game. */
    shuffleTeams: (): Promise<ActionResult> =>
      api.POST('/api/lobbies/{id}/teams/shuffle', { params: { path: { id } } }),
  }
}

export type LobbyActions = ReturnType<typeof lobbyActions>
