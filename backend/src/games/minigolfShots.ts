// Putts for the minigolf module. The engine refolds the whole open visit on every input, so the
// same tries are played again and again: the simulations are pure, so their results are cached by
// their inputs.
import { simulateShot } from '../shared/minigolf/simulate.js'
import { simulateShot3d } from '../shared/minigolf/3d/physics3d.js'
import type { Physics } from '../shared/minigolf/physics.js'
import type { Hole, OtherBall, Pt, Shot, ShotResult } from '../shared/minigolf/types.js'

export type ShotInputs = { hole: Hole; physics: Physics; ball: Pt; shot: Shot; others: readonly OtherBall[] }

/** A live 3D shot that isn't cached yet: the engine plays it in the worker pool, then applies the input again. */
export class ShotNeeded extends Error {
  constructor(readonly inputs: ShotInputs) {
    super('minigolf shot needed')
  }
}

const CACHE_SIZE = 256
const cache = new Map<string, ShotResult>()
let live = false
// The caller's own shots (see liveShots), looked up before the shared cache
let pinned: ReadonlyMap<string, ShotResult> | undefined

const keyOf = (i: ShotInputs, engine: '3d' | '2d') => JSON.stringify([engine, i.hole, i.physics, i.ball, i.shot, i.others])

const remember = (key: string, result: ShotResult): void => {
  cache.set(key, result)
  // The least recently used goes first
  const oldest = cache.keys().next()
  if (cache.size > CACHE_SIZE && !oldest.done) cache.delete(oldest.value)
}

/**
 * Runs `fn` as live play: a 3D shot missing from the cache (and from `shots`, if given) throws
 * ShotNeeded instead of blocking the thread.
 */
export function liveShots<T>(fn: () => T, shots?: ReadonlyMap<string, ShotResult>): T {
  live = true
  pinned = shots
  try {
    return fn()
  } finally {
    live = false
    pinned = undefined
  }
}

/** Stores a shot the pool played: in `shots` if given (kept past the cache's eviction), else in the cache. */
export function storeShot(inputs: ShotInputs, result: ShotResult, shots?: Map<string, ShotResult>): void {
  const key = keyOf(inputs, '3d')
  if (shots) shots.set(key, result)
  else remember(key, result)
}

export function cachedShot(
  hole: Hole,
  physics: Physics,
  ball: Pt,
  shot: Shot,
  others: readonly OtherBall[],
  engine: '3d' | '2d',
): ShotResult {
  const inputs = { hole, physics, ball, shot, others }
  const key = keyOf(inputs, engine)
  const own = pinned?.get(key)
  if (own) return own
  const hit = cache.get(key)
  if (hit) {
    // Most recently used goes last
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  if (live && engine === '3d') throw new ShotNeeded(inputs)
  const result = (engine === '3d' ? simulateShot3d : simulateShot)(hole, physics, ball, shot, others)
  remember(key, result)
  return result
}
