// The details page's Review tab: whether the viewer sees it, and each leg's review from the coach.
import { api, type CoachLegDetail } from '$lib/api'
import { coachable } from '$shared/coach/coachable'
import type { GameDetail } from '$lib/api'

/** The coach reviews your own legs of a finished X01 game it can grade, and no invalidated game; with
 *  no legs there is nothing to review. The same rule the Coach link had. */
export function canReview(detail: GameDetail, coachEnabled: boolean): boolean {
  return (
    coachEnabled &&
    coachable(detail.game.mode, detail.game.config) &&
    detail.game.mySeat !== null &&
    !detail.game.invalidated &&
    detail.detail.mode === 'x01' &&
    detail.detail.legs.length > 0
  )
}

export type LegReviews = { leg: number; review: CoachLegDetail | null }[]

/** Every leg's review, in leg order. A leg without one (404) is `null`; any other failure throws. */
export async function loadLegReviews(gameId: string, legs: number[]): Promise<LegReviews> {
  return Promise.all(
    legs.map(async leg => {
      const res = await api.GET('/api/coach/legs/{gameId}/{leg}', { params: { path: { gameId, leg } } })
      if (res.data) return { leg, review: res.data }
      if (res.response.status === 404) return { leg, review: null }
      throw new Error(`Couldn't load the review of leg ${leg + 1}`)
    }),
  )
}
