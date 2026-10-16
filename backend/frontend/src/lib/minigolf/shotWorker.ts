// A putt's 3D physics, off the main thread: a long roll takes long enough to freeze the page's
// animation. Answers each ShotRequest with its ShotReply.
import { initPhysics3d, simulateShot3d } from '$shared/minigolf/3d/physics3d'
import type { Physics } from '$shared/minigolf/physics'
import type { Hole, Pt, Shot, ShotResult } from '$shared/minigolf/types'

export interface ShotRequest {
  id: number
  hole: Hole
  physics: Physics
  from: Pt
  shot: Shot
}
export type ShotReply = { id: number; result: ShotResult } | { id: number; error: string }

// Loads Rapier as soon as the worker starts, so the first putt doesn't wait for it
const ready = initPhysics3d()

/** Simulates one putt; a throw is posted as an error, since an async handler's rejection never
 *  reaches the page's Worker `error` event. */
export async function runShot({ id, hole, physics, from, shot }: ShotRequest, post: (r: ShotReply) => void): Promise<void> {
  try {
    await ready
    post({ id, result: simulateShot3d(hole, physics, from, shot) })
  } catch (e) {
    post({ id, error: e instanceof Error ? e.message : String(e) })
  }
}

globalThis.onmessage = (e: MessageEvent<ShotRequest>) => runShot(e.data, r => postMessage(r))
