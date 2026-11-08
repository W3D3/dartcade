// The setup tip's model (shared/coach/setup.ts): the setup tier's table is a chunk of its own, fetched
// the first time a tip is asked for. Until it is here there is no tip; it is $state, so a tip
// appears where it was read.
import { loadModel, type CoachModel } from '$shared/coach/model'
import { SETUP_TIER, setupAim, type Setup } from '$shared/coach/setup'

let model = $state.raw<CoachModel | null>(null)
let requested = false

/** The best setup dart for `darts` left from `left`, null when it has none or the model is still loading */
export function setupTip(left: number, darts: number): Setup | null {
  if (!requested) {
    requested = true
    // A failed fetch (a deploy replaced the chunk) is tried again on the next read
    loadModel(SETUP_TIER).then(
      m => (model = m),
      () => (requested = false),
    )
  }
  return model ? setupAim(model, left, darts) : null
}
