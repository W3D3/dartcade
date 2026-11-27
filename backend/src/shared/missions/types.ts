// A mission: practice goals made of steps (docs/superpowers/specs/2026-11-24-missions-design.md).
// The schema here is the authority for what a mission may be; schema/common-v1.json mirrors its
// shape for the API and the snapshot, and a test keeps the two in step.
import { z } from 'zod'
import { CONTROL_CHARS, normalizeName } from '../names.js'

export const MISSION_LIMITS = {
  steps: 8,
  targets: 21,
  /** Darts, visits, hits or marks a step may ask for. */
  count: 99,
  name: 40,
  description: 280,
  /** The longest time limit, in seconds (one hour). */
  timeLimit: 3600,
  /** Missions one player may have made. */
  perPlayer: 50,
} as const

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

/**
 * A board target: `20` is any segment of 20, `S20`/`D20`/`T20` its single (inner or outer), double or
 * treble, `B` either bull, `DB` the inner bull.
 */
export const TargetSchema = z.string().regex(/^(?:[SDT]?(?:[1-9]|1\d|20)|B|DB)$/, 'must be 1–20 (S, D or T in front), B or DB')
export type Target = z.infer<typeof TargetSchema>

const count = z.number().int().min(1).max(MISSION_LIMITS.count)
const darts = count

const CheckoutStep = z
  .object({
    type: z.literal('checkout'),
    start: z.number().int().min(2).max(501),
    maxDarts: darts,
    finish: z.enum(['double', 'single', 'master']),
  })
  .strict()
  .refine(s => s.start <= s.maxDarts * 60, { message: 'cannot be checked out in that many darts', path: ['start'] })

const HitStep = z
  .object({
    type: z.literal('hit'),
    targets: z.array(TargetSchema).min(1).max(MISSION_LIMITS.targets),
    /** Hits each target needs. */
    hits: count,
    /** A dart that adds nothing ends the attempt. */
    inARow: z.boolean(),
    order: z.enum(['any', 'in_order']),
    /** Left out: no limit; a number: within that many darts; 'visit': in one visit. */
    within: z.union([darts, z.literal('visit')]).optional(),
  })
  .strict()
  .refine(s => s.within === undefined || s.hits * s.targets.length <= (s.within === 'visit' ? 3 : s.within), {
    message: 'needs more hits than darts',
    path: ['within'],
  })

/** A number whose marks count: 1–20, 25 the bull. */
const MarkTarget = z.union([z.number().int().min(1).max(20), z.literal(25)])

const MarksStep = z
  .object({
    type: z.literal('marks'),
    targets: z.array(MarkTarget).min(1).max(MISSION_LIMITS.targets),
    marks: count,
    /** The marks on every target, or added up over all of them. */
    per: z.enum(['each', 'total']),
    within: darts.optional(),
  })
  .strict()
  .refine(s => new Set(s.targets).size === s.targets.length, { message: 'a target is listed twice', path: ['targets'] })
  .refine(s => s.within === undefined || s.marks * (s.per === 'each' ? s.targets.length : 1) <= s.within * 3, {
    message: 'needs more marks than the darts can make',
    path: ['within'],
  })

const VisitsStep = z
  .object({
    type: z.literal('visits'),
    compare: z.enum(['at_least', 'at_most', 'exactly', 'not']),
    points: z.number().int().min(0).max(180),
    visits: count,
    inARow: z.boolean(),
  })
  .strict()

const ScoreStep = z
  .object({ type: z.literal('score'), points: z.number().int().min(1).max(5940), within: darts })
  .strict()
  .refine(s => s.points <= s.within * 60, { message: 'cannot be scored in that many darts', path: ['points'] })

const AverageStep = z.object({ type: z.literal('average'), average: z.number().min(1).max(180), visits: count }).strict()

const LegStep = z
  .object({
    type: z.literal('leg'),
    start: z.union([z.literal(301), z.literal(501), z.literal(701)]),
    within: darts,
    finish: z.enum(['double', 'single']),
  })
  .strict()
  .refine(s => s.start <= s.within * 60, { message: 'cannot be won in that many darts', path: ['within'] })

export const StepSchema = z.discriminatedUnion('type', [CheckoutStep, HitStep, MarksStep, VisitsStep, ScoreStep, AverageStep, LegStep])
export type Step = z.infer<typeof StepSchema>
export type StepType = Step['type']
export type StepOf<K extends StepType> = Extract<Step, { type: K }>

// Shown to other players: trimmed, Unicode NFC, no control characters, short (like course texts)
const text = (max: number) =>
  z
    .string()
    .transform(normalizeName)
    .refine(s => Array.from(s).length <= max, `must be at most ${max} characters`)
    .refine(s => !CONTROL_CHARS.test(s), 'must not contain control characters')

export const MissionSchema = z
  .object({
    name: text(MISSION_LIMITS.name).refine(s => s.length > 0, 'must not be blank'),
    description: text(MISSION_LIMITS.description),
    difficulty: z.enum(DIFFICULTIES),
    /** Any order: the player picks the step; in order: each unlocks when the one before is done. */
    order: z.enum(['any', 'in_order']),
    /** Seconds; left out: no limit. */
    timeLimit: z.number().int().min(30).max(MISSION_LIMITS.timeLimit).optional(),
    /** A failed step is retried on its own, or every step starts over. */
    onFail: z.enum(['retry', 'restart']),
    /** The player may stop the clock between visits. */
    pause: z.boolean(),
    /** Highscores rank by time, or by darts (a one-step race like Around the Clock Sprint). */
    rankBy: z.enum(['time', 'darts']),
    steps: z.array(StepSchema).min(1).max(MISSION_LIMITS.steps),
  })
  .strict()
export type Mission = z.infer<typeof MissionSchema>

export const VISIBILITIES = ['private', 'friends', 'public'] as const
export type MissionVisibility = (typeof VISIBILITIES)[number]

/** A dart as a step reads it: number 25 is the outer bull, 50 the inner (multiplier 1, whatever the board sent: `toMissionDart`), 0 a miss. */
export type MissionDart = { number: number; multiplier: number; score: number }
