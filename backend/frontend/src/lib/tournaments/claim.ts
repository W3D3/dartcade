// The claim page (Tournament-Claim-Phone, #/tournaments/claim/:code): what a spot's link names, and
// the request behind Claim.
import { api, type TournamentClaim } from '$lib/api'

type Played = TournamentClaim['played'][number]

export type ClaimLoad = { claim: TournamentClaim } | { error: 'gone' | 'failed' }
export type ClaimResult = { claim: TournamentClaim } | { error: string }

export async function loadClaim(code: string): Promise<ClaimLoad> {
  try {
    const res = await api.GET('/api/tournaments/claim/{code}', { params: { path: { code } } })
    if (res.data) return { claim: res.data }
    return { error: res.response.status === 404 ? 'gone' : 'failed' }
  } catch {
    return { error: 'failed' }
  }
}

const REFUSALS: Partial<Record<string, string>> = {
  'already claimed': 'Someone else has claimed this spot already. Ask the organizer for a new link.',
  'already has a spot': 'You already have a spot in this tournament. One person can claim one spot.',
}

export async function claimSpot(code: string): Promise<ClaimResult> {
  try {
    const res = await api.POST('/api/tournaments/claim/{code}', { params: { path: { code } } })
    if (res.data) return { claim: res.data }
    if (res.response.status === 404) return { error: 'This link doesn’t work any more. Ask the organizer for a new one.' }
    return { error: REFUSALS[res.error.error] ?? 'Couldn’t claim the spot. Try again.' }
  } catch {
    return { error: 'Couldn’t claim the spot. Try again.' }
  }
}

/** One "Played so far" row: "Round 1 vs Ben" with "won 3–1", "lost 1–3" or "up next". */
export function playedRow(p: Played): { title: string; result: string; tone: 'won' | 'lost' | 'next' } {
  const title = `Round ${p.round}${p.opponent ? ` vs ${p.opponent}` : ''}`
  if (p.state === 'next') return { title, result: 'up next', tone: 'next' }
  return { title, result: `${p.state} ${p.legs ? p.legs.replace('-', '–') : ''}`.trim(), tone: p.state }
}

/** Why a link can't be claimed by the viewer, or null when it can. */
export function unclaimable(c: TournamentClaim): string | null {
  if (c.claimable) return null
  if (c.claimedByMe) return 'This spot is yours.'
  return 'This spot can’t be claimed: someone else has it, or you already hold another spot in this tournament.'
}
