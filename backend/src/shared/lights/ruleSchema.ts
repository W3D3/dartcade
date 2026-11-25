// What a light rule may be when it comes from outside: a profile the player saves, a file they
// import, a rule they test before saving. Numbers are moved into range; a preset look's state is
// always the server's own copy, whatever was sent with it; a raw look passes `checkWledState`.
import { z } from 'zod'
import { isGameId } from '../gameNames.js'
import { TRIGGER_GAME } from './groups.js'
import { PRESETS } from './presets.js'
import type { Look, Rule, TriggerKind } from './types.js'
import { checkWledState } from './wledState.js'

/** The most rules a profile holds. */
export const MAX_RULES = 100
/** The longest a flash holds, and the shortest. */
export const HOLD_MS = { min: 100, max: 60_000 } as const
/** The ids WLED gives presets and playlists saved on a strip. */
export const STRIP_PRESET_IDS = { min: 1, max: 250 } as const

const int = (min: number, max: number) => z.number().transform(n => Math.min(max, Math.max(min, Math.round(n))))

export const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((s): `#${string}` => `#${s.slice(1).toLowerCase()}`)

export const isTrigger = (s: string): s is TriggerKind => Object.hasOwn(TRIGGER_GAME, s)

const LOOKS = {
  preset: z.object({ preset: z.string().refine(name => Object.hasOwn(PRESETS, name), 'unknown preset') }),
  ps: z.object({ ps: int(STRIP_PRESET_IDS.min, STRIP_PRESET_IDS.max) }),
  pl: z.object({ pl: int(STRIP_PRESET_IDS.min, STRIP_PRESET_IDS.max) }),
  raw: z.object({
    raw: z.unknown().transform((v, ctx) => {
      const checked = checkWledState(v)
      if (checked.ok) return checked.state
      for (const message of checked.problems) ctx.addIssue({ code: 'custom', message })
      return z.NEVER
    }),
  }),
  color: z.object({
    color: z.union([z.literal('seat'), z.literal('team'), hexColor]),
    fx: int(0, 255),
    bri: int(0, 255),
    speed: int(0, 255).optional(),
    ix: int(0, 255).optional(),
    pal: int(0, 255).optional(),
  }),
}
type LookInput = { [K in LookKind]: z.output<(typeof LOOKS)[K]> }[LookKind]

/** The kinds of look, each named by the key that sets it apart; a colour look is the one with none of the others. */
export type LookKind = keyof typeof LOOKS
const LOOK_KINDS = Object.keys(LOOKS).filter((k): k is LookKind => Object.hasOwn(LOOKS, k))

/** The kind of a look: the one place that tells the looks apart. */
export const lookKind = (look: object): LookKind => LOOK_KINDS.find(k => k in look) ?? 'color'

/** A look with its kind, narrowed together, to switch on: `switch (l.kind)` with `default: return unknownLook(l)`, so a new
 *  kind fails the typecheck wherever it isn't handled. Works for the shared `Look` and the API's `LightRule` look alike. */
export type KindedLook<L> = { [K in LookKind]: { kind: K; look: Extract<L, Record<K, unknown>> } }[LookKind]
export function kinded<L extends object>(look: L): KindedLook<L> {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- the kind is the key the look holds, which is what Extract picks
  return { kind: lookKind(look), look } as KindedLook<L>
}

/** The `default` of a switch over `KindedLook`: unreachable while every kind has its case. */
export function unknownLook(l: never): never {
  throw new Error(`unknown light look ${JSON.stringify(l)}`)
}

/** A look is told apart by its key, so a problem names that look's own field rather than every kind it is not. */
const lookSchema = z.unknown().transform((v, ctx): LookInput => {
  const parsed = LOOKS[typeof v === 'object' && v !== null ? lookKind(v) : 'color'].safeParse(v)
  if (parsed.success) return parsed.data
  for (const issue of parsed.error.issues) ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path })
  return z.NEVER
})

const totalSchema = z.union([
  z.object({ op: z.enum(['=', '>=', '<=']), n: int(0, 180) }),
  z
    .object({ op: z.literal('between'), n: int(0, 180), to: int(0, 180) })
    .transform(t => ({ op: t.op, n: Math.min(t.n, t.to), to: Math.max(t.n, t.to) })),
])

/** The look as the lights use it: a preset name gets its state from `PRESETS`. */
function lookOf(look: LookInput): Look {
  const l = kinded(look)
  return l.kind === 'preset' ? { preset: l.look.preset, state: PRESETS[l.look.preset] } : l.look
}

const triggerSchema = z.string().refine(isTrigger, 'unknown trigger')
const gameSchema = z.string().refine(isGameId, 'unknown game')

const whenSchema = z.object({
  trigger: triggerSchema,
  seats: z.enum(['any', 'mine', 'other']),
  total: totalSchema.optional(),
  game: gameSchema.optional(),
})
const ruleFields = z.object({
  when: whenSchema,
  type: z.enum(['scene', 'flash']),
  enabled: z.boolean(),
  look: lookSchema,
  holdMs: int(HOLD_MS.min, HOLD_MS.max).optional(),
})

/** The field names a rule, its `when` and its look (of any kind) may have, from the schemas themselves: what an import
 *  knows, so it can name what it doesn't. */
export const RULE_FIELDS = {
  rule: Object.keys(ruleFields.shape),
  when: Object.keys(whenSchema.shape),
  look: [...new Set(Object.values(LOOKS).flatMap(look => Object.keys(look.shape)))],
}

export const ruleSchema = ruleFields.transform((r): Rule => ({
  when: {
    trigger: r.when.trigger,
    seats: r.when.seats,
    // Only a visit has a total to filter on
    ...(r.when.trigger === 'visit' && r.when.total && { total: r.when.total }),
    ...(r.when.game && { game: r.when.game }),
  },
  type: r.type,
  enabled: r.enabled,
  look: lookOf(r.look),
  ...(r.type === 'flash' && r.holdMs !== undefined && { holdMs: r.holdMs }),
}))

export const rulesSchema = z.array(ruleSchema).max(MAX_RULES)
