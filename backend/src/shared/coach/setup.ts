// The best setup dart: where to aim a dart that cannot check out, so the darts after it have the
// best chance to. The coach's own judgement (model.ts values, notes.ts bestLeaveAim), asked for the
// score left instead of for a thrown dart: the match screen's setup tip and the bots' aim.
import { AIMS, aimPoints, aimKind, type Aim } from './aims.js'
import { aimLabel, type CoachModel, type Evaluation } from './model.js'
import { bestLeaveAim } from './notes.js'
import { dartPhase } from './walk.js'

/** The tier the tip and the bots set up as: the best players' table, so a tip is the best play. */
export const SETUP_TIER = 'worldclass'

export type Setup = {
  aim: Aim
  /** What to hit, by name: the aim's label, or for the bull and the 25 the bed worth more (model.ts aimLabel) */
  label: string
  /** The score a dart in that bed leaves; null when that would bust */
  leaves: number | null
}

// Aims a player can read off the board: not the wires between two numbers
const AIM_INDEXES = AIMS.flatMap((a, i) => (aimKind(a.id) === 'W' ? [] : [i]))

const memo = new WeakMap<CoachModel, Map<number, Setup | null>>()

/** The best aim for one of the `darts` darts left (1–3) from `left`, double out: the highest chance
 *  to check out by the end of the visit or the next one, else the least chance of a bogey leave.
 *  Null when the score is a scoring dart's (walk.ts dartPhase: more than 170 left, and not the last
 *  dart from 230 or less). Judged as the visit's start, so a bust costs a visit from `left`. */
export function setupAim(model: CoachModel, left: number, darts: number): Setup | null {
  if (left < 2 || darts < 1 || darts > 3 || dartPhase({ left, darts }) === 'scoring') return null
  let byScore = memo.get(model)
  if (!byScore) memo.set(model, (byScore = new Map<number, Setup | null>()))
  const key = left * 4 + darts
  if (!byScore.has(key)) byScore.set(key, solve(model, left, darts))
  return byScore.get(key) ?? null
}

function solve(model: CoachModel, left: number, darts: number): Setup {
  const e: Evaluation = model.evaluator(left, 1)(left, darts)
  const i = bestLeaveAim(e, AIM_INDEXES)
  const aim = AIMS[i]
  const label = aimLabel(e, i)
  const after = left - (label === '25' ? 25 : aimPoints(aim)[0])
  return { aim, label, leaves: after >= 2 ? after : null }
}
