// A hole as JSON: parsed by the bench's paste-in editor and by the course editor's DB layer.
import { z } from 'zod'
import type { Hole } from './types.js'

const pt = z.tuple([z.number(), z.number()]).readonly()

export const holeSchema = z.object({
  id: z.string(),
  name: z.string(),
  par: z.number(),
  outline: z.array(pt),
  walls: z
    .array(
      z.object({
        points: z.array(pt),
        closed: z.boolean().optional(),
        restitution: z.number().optional(),
        thickness: z.number().optional(),
      }),
    )
    .default([]),
  bumpers: z.array(z.object({ at: pt, r: z.number(), restitution: z.number().optional(), kick: z.number().optional() })).default([]),
  slopes: z
    .array(
      z.union([
        z.object({ radial: z.object({ center: pt, radius: z.number(), strength: z.number() }) }),
        z.object({ bump: z.object({ from: pt, to: pt, width: z.number(), strength: z.number() }) }),
      ]),
    )
    .default([]),
  // Terrain shaped by height ($shared/minigolf/3d/ground.ts)
  terrain: z
    .array(
      z.object({
        mesa: z.object({ from: pt, to: pt, height: z.number(), edges: z.tuple([z.number(), z.number(), z.number(), z.number()]) }),
      }),
    )
    .optional(),
  tee: pt,
  cup: z.object({ at: pt, r: z.number() }),
}) satisfies z.ZodType<Hole>
