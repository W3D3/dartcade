// The coach's model for the setup tier (shared/coach/setup.ts), built when a bot first needs it.
// The server loads the table directly; the browser fetches it as a chunk (lib/setupTip.svelte.ts).
import { LANDING } from '../shared/coach/landing/worldclass.gen.js'
import { coachModel, type CoachModel } from '../shared/coach/model.js'
import { SETUP_TIER } from '../shared/coach/setup.js'

let model: CoachModel | undefined
export const setupModel = (): CoachModel => (model ??= coachModel(SETUP_TIER, LANDING))
