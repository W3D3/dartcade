import { liveShots, ShotNeeded, storeShot } from './minigolfShots.js'
import { simulateInPool } from './minigolfPool.js'
import type { InputWork } from '../session/types.js'
import type { ShotResult } from '../shared/minigolf/types.js'

/** Minigolf's 3D shots: played in the worker pool, found by the reducer in the shot cache. */
export const shotWork: InputWork<ShotResult> = {
  async resolve(play, into) {
    for (;;) {
      try {
        liveShots(play, into)
        return
      } catch (err) {
        if (!(err instanceof ShotNeeded)) return
        storeShot(err.inputs, await simulateInPool(err.inputs), into)
      }
    }
  },
  within: (fn, from) => liveShots(fn, from),
}
