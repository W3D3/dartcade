// The coach's models for a tier, loaded lazily (one chunk per tier, cached by loadModel): the live
// panel and the admin sandbox share this loader and its error state.
import { loadCoachModels, type CoachModels } from '$shared/coach/model'
import type { CoachTierId } from '$shared/coach/tiers'

export type ModelsState = { readonly models: CoachModels | null; readonly failed: boolean }

/** The models of `tier()` (null: none yet, or still those of another tier), the latest tier
 *  winning; `failed` once its chunks didn't load (a deploy replaced them, the network dropped). */
export function coachModels(tier: () => CoachTierId | null): ModelsState {
  let loaded = $state.raw<CoachModels | null>(null)
  let failed = $state(false)
  $effect(() => {
    const want = tier()
    if (want === null) return
    failed = false
    loadCoachModels(want).then(
      m => {
        if (want === tier()) loaded = m
      },
      () => {
        if (want === tier()) failed = true
      },
    )
  })
  return {
    get models() {
      return loaded?.model.tier === tier() ? loaded : null
    },
    get failed() {
      return failed
    },
  }
}
