// The coach's models for a level, loaded lazily (one chunk per level, cached by loadModel): the live
// panel and the admin sandbox share this loader and its error state.
import { loadCoachModels, type CoachModels } from '$shared/coach/model'

export type ModelsState = { readonly models: CoachModels | null; readonly failed: boolean }

/** The models of `level()` (null: none yet, or still those of another level), the latest level
 *  winning; `failed` once its chunks didn't load (a deploy replaced them, the network dropped). */
export function coachModels(level: () => number | null): ModelsState {
  let loaded = $state.raw<CoachModels | null>(null)
  let failed = $state(false)
  $effect(() => {
    const want = level()
    if (want === null) return
    failed = false
    loadCoachModels(want).then(
      m => {
        if (want === level()) loaded = m
      },
      () => {
        if (want === level()) failed = true
      },
    )
  })
  return {
    get models() {
      return loaded?.model.level === level() ? loaded : null
    },
    get failed() {
      return failed
    },
  }
}
