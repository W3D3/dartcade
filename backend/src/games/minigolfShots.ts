// Putts for the minigolf module. The engine refolds the whole open visit on every input, so the
// same tries are played again and again: the simulations are pure, so their results are cached by
// their inputs.
import { simulateShot } from '../shared/minigolf/simulate.js'
import { simulateShot3d } from '../shared/minigolf/3d/physics3d.js'
import type { Physics } from '../shared/minigolf/physics.js'
import type { Hole, OtherBall, Pt, Shot, ShotResult } from '../shared/minigolf/types.js'

const CACHE_SIZE = 256
const cache = new Map<string, ShotResult>()

export function cachedShot(
  hole: Hole,
  physics: Physics,
  ball: Pt,
  shot: Shot,
  others: readonly OtherBall[],
  engine: '3d' | '2d',
): ShotResult {
  const key = JSON.stringify([engine, hole, physics, ball, shot, others])
  const hit = cache.get(key)
  if (hit) {
    // Most recently used goes last
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const result = (engine === '3d' ? simulateShot3d : simulateShot)(hole, physics, ball, shot, others)
  cache.set(key, result)
  // The least recently used goes first
  const oldest = cache.keys().next()
  if (cache.size > CACHE_SIZE && !oldest.done) cache.delete(oldest.value)
  return result
}
