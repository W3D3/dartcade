// A hole as JSON: parsed by the bench's paste-in editor and by the course editor's DB layer.
import { z } from 'zod'
import type { Hole } from './types.js'

const pt = z.tuple([z.number(), z.number()]).readonly()
// Caps far above any real hole (the official ones have a few dozen points), so a pasted or sent
// one can't make every shot slow. A baked curve or circle adds an outline point per 2°.
const points = z.array(pt).max(2000)
const many = <T extends z.ZodType>(item: T) => z.array(item).max(100)

export const holeSchema = z.object({
  id: z.string(),
  name: z.string(),
  par: z.number(),
  outline: points,
  shape: z
    .object({
      corners: points,
      curves: z.array(z.object({ c1: pt, c2: pt }).nullable()).max(2000),
      circles: many(z.object({ center: pt, r: z.number() })),
    })
    .optional(),
  walls: many(
    z.object({
      points: points,
      closed: z.boolean().optional(),
      restitution: z.number().optional(),
      thickness: z.number().optional(),
    }),
  ).default([]),
  bumpers: many(z.object({ at: pt, r: z.number(), restitution: z.number().optional(), kick: z.number().optional() })).default([]),
  slopes: many(
    z.union([
      z.object({ radial: z.object({ center: pt, radius: z.number(), strength: z.number() }) }),
      z.object({ bump: z.object({ from: pt, to: pt, width: z.number(), strength: z.number() }) }),
    ]),
  ).default([]),
  // Terrain shaped by height ($shared/minigolf/3d/ground.ts)
  terrain: many(
    z.object({
      mesa: z.object({ from: pt, to: pt, height: z.number(), edges: z.tuple([z.number(), z.number(), z.number(), z.number()]) }),
    }),
  ).optional(),
  tee: pt,
  cup: z.object({ at: pt, r: z.number() }),
}) satisfies z.ZodType<Hole>
