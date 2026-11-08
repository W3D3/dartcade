// The three dart slots under the board: thrown darts, then what to aim at next.
import { parseLabel } from './dartUtils.js'
import { checkoutHint, type CheckoutPrefs } from '$shared/checkout.js'
import type { Setup } from '$shared/coach/setup.js'
import { nextTargetIndex } from '$shared/atc.js'
import { dartMarks } from './cricket/view.js'
import { plural } from './fmt.js'

export type SlotKind = 'thrown' | 'miss' | 'suggested-next' | 'suggested-later' | 'empty-next' | 'empty-later'
/** `struck`: the label is drawn crossed out (Cricket: a dart on a number every team has closed). */
export type Slot = { kind: SlotKind; label: string; points: string; foot: string; aria: string; struck?: boolean }
export type ThrownDart = { segment?: { name?: string; number?: number; multiplier?: number }; score?: number }

function thrownSlot(d: ThrownDart, i: number, hit: boolean, points: string): Slot {
  const label = d.segment?.name || 'Miss'
  return {
    kind: hit ? 'thrown' : 'miss',
    label,
    points,
    foot: '',
    aria: `Dart ${i + 1}: ${label}, ${hit ? `${points} points` : 'no hit'}`,
  }
}

/** Slots from `from` to the third: suggestions first, then empty ones. */
function openSlots(from: number, suggestions: { label: string; foot: string }[]): Slot[] {
  const out: Slot[] = []
  for (let i = from; i < 3; i++) {
    const s = suggestions.at(i - from)
    const next = i === from
    out.push(
      s
        ? {
            kind: next ? 'suggested-next' : 'suggested-later',
            label: s.label,
            points: '',
            foot: s.foot,
            aria: `Dart ${i + 1}: suggested ${s.label}, ${s.foot}`,
          }
        : {
            kind: next ? 'empty-next' : 'empty-later',
            label: '',
            points: '',
            foot: '',
            aria: `Dart ${i + 1}: ${next ? 'next' : 'not thrown'}`,
          },
    )
  }
  return out
}

/** "Setup · leaves 40": the dart is not a finish, it sets one up */
const setupFoot = ({ leaves }: Setup): string => (leaves === null ? 'Setup' : `Setup · leaves ${leaves}`)

export function x01Slots(o: {
  darts: ThrownDart[]
  remaining: number
  outMode: 'straight' | 'double' | 'master'
  opened: boolean
  bust: boolean
  suggest: boolean
  /** The player's checkout preferences (favourite double). */
  checkout?: CheckoutPrefs
  /** Replaces the last suggestion's 'Game shot'/'to win the leg' foot, e.g. 121's 'checks out'. */
  finishFoot?: string
  /** The best setup dart for a score no finish is left for: shown in place of a finish route. Double out only. */
  setup?: (left: number, darts: number) => Setup | null
}): Slot[] {
  const done = o.darts.slice(0, 3).map((d, i) => {
    const score = d.score ?? 0
    return thrownSlot(d, i, score > 0, String(score))
  })
  if (o.bust) {
    return [
      ...done,
      ...Array.from({ length: 3 - done.length }, (_, k): Slot => ({
        // Plain empty slots: the visit summary already says Bust
        kind: 'empty-later',
        label: '',
        points: '',
        foot: '',
        aria: `Dart ${done.length + k + 1}: bust`,
      })),
    ]
  }
  const dartsLeft = 3 - done.length
  const suggest = o.suggest && o.opened && o.remaining > 0 && dartsLeft > 0
  const hint = suggest ? checkoutHint(o.remaining, o.outMode, dartsLeft, o.checkout) : null
  const setup = suggest && !hint && o.outMode === 'double' ? o.setup?.(o.remaining, dartsLeft) : null
  if (setup) return [...done, ...openSlots(done.length, [{ label: setup.aim.label, foot: setupFoot(setup) }])]
  let rest = o.remaining
  const suggestions = (hint ?? []).map((label, k, all) => {
    rest -= parseLabel(label).score
    const foot = k < all.length - 1 ? `leaves ${rest}` : (o.finishFoot ?? (all.length === 1 ? 'Game shot' : 'to win the leg'))
    return { label, foot }
  })
  return [...done, ...openSlots(done.length, suggestions)]
}

/** `walk` is the sequence and the index the visit started on, when known: each hit then shows how
 *  far the game moved it. Without it, a double/treble shows 2/3 and a bull 1. */
export function atcSlots(o: {
  darts: ThrownDart[]
  hits: boolean[]
  target: string | null
  multiplierAdvances?: boolean
  walk?: { sequence: number[]; start: number }
}): Slot[] {
  let at = o.walk?.start
  const steps = (d: ThrownDart) => {
    const n = o.multiplierAdvances ? Math.max(1, d.segment?.multiplier ?? 1) : 1
    if (!o.walk || at === undefined) return (d.segment?.number ?? 0) <= 20 ? n : 1
    const from = at
    at = nextTargetIndex(o.walk.sequence, from, n)
    return at - from
  }
  const done = o.darts.slice(0, 3).map((d, i) => thrownSlot(d, i, o.hits[i], o.hits[i] ? `+${steps(d)}` : '0'))
  return [...done, ...openSlots(done.length, o.target ? [{ label: o.target, foot: 'your target' }] : [])]
}

/**
 * Higher Lower: the thrown darts, then the score that beats the high bar (`highHint`) in the next
 * slot: "61+" over "in 3 darts · beats 60", or "beats 60" on the last dart. A visit a miss
 * locked is over: the slots left are not thrown, with no next dart.
 */
export function hiloSlots(o: { darts: ThrownDart[]; hint: { need: number; high: number } | null; locked?: boolean }): Slot[] {
  const done = o.darts.slice(0, 3).map((d, i) => thrownSlot(d, i, (d.score ?? 0) > 0, String(d.score ?? 0)))
  if (o.locked) return [...done, ...notThrown(done.length)]
  const left = 3 - done.length
  if (!o.hint || left === 0) return [...done, ...openSlots(done.length, [])]
  const { need, high } = o.hint
  const within = left > 1 ? `in ${left} darts` : ''
  const foot = [within, `beats ${high}`].filter(Boolean).join(' · ')
  const [next, ...rest] = openSlots(done.length, [{ label: `${need}+`, foot }])
  const aria = `Dart ${done.length + 1}: needs ${need} or more ${within ? `${within} ` : ''}to beat HIGH ${high}`
  return [...done, { ...next, aria }, ...rest]
}

/** A visit that is over early: the slots from `from` on are not thrown, with no next dart. */
function notThrown(from: number): Slot[] {
  return openSlots(from, []).map((s, k): Slot => ({ ...s, kind: 'empty-later', aria: `Dart ${from + k + 1}: not thrown` }))
}

/** Cricket: the thrown darts with what each did ("3 marks", "+57" when it only scored, "2 marks +40"
 *  when it did both), then the next dart. A dart on a number every team has closed is dead: its
 *  label is crossed out and it is no hit. A visit that won the leg is over: the slots left are not
 *  thrown. */
export function cricketSlots(o: {
  darts: ThrownDart[]
  effects: readonly { marks: number; points: number }[]
  targets: readonly number[]
  locked: boolean
}): Slot[] {
  const done = o.darts.slice(0, 3).map((d, i): Slot => {
    const label = d.segment?.name || 'Miss'
    // No effect is kept for a dart thrown after the leg was won: it counted for nothing, it is no dead number
    const effect = o.effects.at(i)
    if (!effect) return { ...thrownSlot(d, i, false, '0'), aria: `Dart ${i + 1}: ${label}, did not count` }
    const { marks, points } = effect
    const onTarget = dartMarks(d.segment ?? {}, o.targets) > 0
    if (onTarget && marks === 0 && points === 0) {
      return {
        kind: 'miss',
        label,
        points: 'Closed',
        foot: '',
        aria: `Dart ${i + 1}: ${label}, number already closed, no mark`,
        struck: true,
      }
    }
    const said = [marks ? plural(marks, 'mark') : '', points ? `+${points}` : ''].filter(Boolean).join(' ')
    return { ...thrownSlot(d, i, marks > 0 || points > 0, said || '0'), aria: `Dart ${i + 1}: ${label}, ${said || 'no mark'}` }
  })
  return [...done, ...(o.locked ? notThrown(done.length) : openSlots(done.length, []))]
}

/** The checkout labels to highlight on the board: only X01's next suggested dart. ATC's
 *  suggestion is a bare target number, not a checkout; the board shows its whole wedge. */
export function boardCheckoutTargets(slots: Slot[], isX01: boolean): string[] {
  return isX01 ? slots.filter(s => s.kind === 'suggested-next').map(s => s.label) : []
}
