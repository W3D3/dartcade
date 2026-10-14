// Test the hole, off the main thread: the putting bot runs 2000-odd 3D putts, which would freeze
// the editor. Started by the hole editor with a BotRequest; answers with progress per round, then
// the result, or an error.
import { initPhysics3d } from '$shared/minigolf/3d/physics3d'
import { testHole, type BotResult } from '$shared/minigolf/bot'
import type { Physics } from '$shared/minigolf/physics'
import type { Hole } from '$shared/minigolf/types'

/** The game's default maximum strokes per hole. */
const MAX_STROKES = 6

export interface BotRequest {
  hole: Hole
  physics: Physics
  seed: number
  rounds: number
}
export type BotMessage = { type: 'progress'; done: number } | { type: 'result'; result: BotResult } | { type: 'error' }

/** Runs one test. A throw (a hole caught mid-edit) is posted as an error: an async handler's
 *  rejection never reaches the page's Worker `error` event. */
export async function runBot({ hole, physics, seed, rounds }: BotRequest, post: (m: BotMessage) => void): Promise<void> {
  try {
    await initPhysics3d()
    const result = testHole(hole, physics, { rounds, seed, maxStrokes: MAX_STROKES, onRound: done => post({ type: 'progress', done }) })
    post({ type: 'result', result })
  } catch {
    post({ type: 'error' })
  }
}

globalThis.onmessage = (e: MessageEvent<BotRequest>) => runBot(e.data, m => postMessage(m))
