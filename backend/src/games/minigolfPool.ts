// Live 3D shots run in worker threads: a shot takes tens of ms, and on the main thread it would
// hold up every other game and request meanwhile.
import { availableParallelism } from 'node:os'
import { Piscina } from 'piscina'
import type { ShotInputs } from './minigolfShots.js'
import type { ShotResult } from '../shared/minigolf/types.js'

// Built (dist/) the worker is .js; under tsx (dev) and vitest it's the .ts source, loaded through tsx
const ts = import.meta.url.endsWith('.ts')
let pool: Piscina | undefined

const getPool = (): Piscina =>
  (pool ??= new Piscina({
    filename: new URL(ts ? './minigolfWorker.ts' : './minigolfWorker.js', import.meta.url).href,
    execArgv: ts ? ['--import', 'tsx'] : [],
    minThreads: 1,
    maxThreads: Math.max(1, Math.min(4, availableParallelism() - 1)),
  }))

/** Starts the pool's worker now (it loads Rapier as it starts), so the first live shot doesn't wait. */
export const warmPool = (): Piscina => getPool()

export const simulateInPool = (inputs: ShotInputs): Promise<ShotResult> => getPool().run(inputs)

export async function closePool(): Promise<void> {
  await pool?.destroy()
  pool = undefined
}
