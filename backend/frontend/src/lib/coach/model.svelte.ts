// The coach's model of a level, loaded lazily (one chunk per level, cached by loadModel): the live
// panel and the admin sandbox share this loader and its error state.
import { loadModel, type CoachModel } from '$shared/coach/model'

export type ModelState = { readonly model: CoachModel | null; readonly failed: boolean }

/** The model of `level()` (null: none yet), the latest level winning; `failed` once its chunk
 *  didn't load (a deploy replaced it, the network dropped). The last model stays until the next one. */
export function coachModel(level: () => number | null): ModelState {
  let model = $state.raw<CoachModel | null>(null)
  let failed = $state(false)
  $effect(() => {
    const want = level()
    if (want === null) return
    failed = false
    loadModel(want).then(
      m => {
        if (want === level()) model = m
      },
      () => {
        if (want === level()) failed = true
      },
    )
  })
  return {
    get model() {
      return model
    },
    get failed() {
      return failed
    },
  }
}
