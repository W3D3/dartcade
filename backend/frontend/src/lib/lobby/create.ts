// Creating a lobby (the Lobby page, the side nav card, and the Play page's Create lobby).
import { api } from '$lib/api'
import { describeConflict, type Refusal } from './input'

/** inLobby: refused because you already have a lobby (another tab may have just opened it). */
export type CreateOutcome = { ok: true; lobbyId: string } | { ok: false; message: string; inLobby: boolean }

export function createOutcome(data: { id: string } | undefined, error: Refusal | undefined): CreateOutcome {
  if (data) return { ok: true, lobbyId: data.id }
  return { ok: false, message: error ? describeConflict(error) : 'Could not create the lobby', inLobby: error?.code === 'in_lobby' }
}

export async function createLobby(): Promise<CreateOutcome> {
  const res = await api.POST('/api/lobbies')
  return createOutcome(res.data, res.error)
}
