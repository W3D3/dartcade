// Minigolf plays 3D: Rapier's WASM loads once before any test simulates a shot (as index.ts does at startup)
import { initPhysics3d } from './src/shared/minigolf/3d/physics3d.js'

await initPhysics3d()
