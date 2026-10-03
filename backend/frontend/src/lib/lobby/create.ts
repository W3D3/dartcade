// Creating a lobby (the Lobby page, the side nav card, the Play page's "Play with friends").
import { api } from '$lib/api'
import { describeConflict, type Refusal } from './input'

export type CreateOutcome = { ok: true; lobbyId: string } | { ok: false; message: string }

export function createOutcome(data: { id: string } | undefined, error: Refusal | undefined): CreateOutcome {
  if (data) return { ok: true, lobbyId: data.id }
  return { ok: false, message: error ? describeConflict(error) : 'Could not create the lobby' }
}

export async function createLobby(): Promise<CreateOutcome> {
  const res = await api.POST('/api/lobbies')
  return createOutcome(res.data, res.error)
}
