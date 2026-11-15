// The guest-claim requests. Each resolves with the server's reason when refused (null when done),
// never throws on a refusal; the dialog reloads the seats afterwards.
import { api } from '$lib/api'
import type { components } from '$lib/api/schema'

export type GuestClaims = components['schemas']['GuestClaims']
export type GuestClaimSeat = components['schemas']['GuestClaimSeat']

const reason = (res: { error?: { error: string } }): string | null => res.error?.error ?? null

/** The host's guest seats of a game; null when it failed. */
export async function loadGuestClaims(gameId: string): Promise<GuestClaims | null> {
  try {
    return (await api.GET('/api/games/{id}/guest-claims', { params: { path: { id: gameId } } })).data ?? null
  } catch {
    return null
  }
}

export async function inviteFriend(gameId: string, seat: number, userId: string): Promise<{ claims: GuestClaims } | { error: string }> {
  const res = await api.PUT('/api/games/{id}/guest-claims/{seat}', { params: { path: { id: gameId, seat } }, body: { userId } })
  return res.data ? { claims: res.data } : { error: reason(res) ?? 'Could not send the invite' }
}

export const cancelInvite = async (gameId: string, seat: number) =>
  reason(await api.DELETE('/api/games/{id}/guest-claims/{seat}', { params: { path: { id: gameId, seat } } }))

export const answerClaim = async (claimId: string, answer: 'accept' | 'decline') =>
  reason(
    answer === 'accept'
      ? await api.POST('/api/guest-claims/{claimId}/accept', { params: { path: { claimId } } })
      : await api.POST('/api/guest-claims/{claimId}/decline', { params: { path: { claimId } } }),
  )
