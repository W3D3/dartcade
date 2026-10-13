// A Piscina worker: plays 3D shots off the main thread (see minigolfPool.ts)
import { initPhysics3d, simulateShot3d } from '../shared/minigolf/3d/physics3d.js'
import type { ShotInputs } from './minigolfShots.js'
import type { ShotResult } from '../shared/minigolf/types.js'

await initPhysics3d()

export default ({ hole, physics, ball, shot, others }: ShotInputs): ShotResult => simulateShot3d(hole, physics, ball, shot, others)
