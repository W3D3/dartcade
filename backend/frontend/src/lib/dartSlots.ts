// The three dart slots under the board: thrown darts, then what to aim at next.
import { parseLabel } from './dartUtils.js'
import { checkoutHint, type CheckoutPrefs } from '$shared/checkout.js'
import { nextTargetIndex } from '$shared/atc.js'
import { dartMarks } from './cricket/view.js'
import { plural } from './fmt.js'

export type SlotKind = 'thrown' | 'miss' | 'suggested-next' | 'suggested-later' | 'empty-next' | 'empty-later'
export type Slot = { kind: SlotKind; label: string; points: string; foot: string; aria: string }
export type ThrownDart = { segment?: { name?: string; number?: number; multiplier?: number }; score?: number }

function thrownSlot(d: ThrownDart, i: number, hit: boolean, points: string): Slot {
  const label = d.segment?.name || 'Miss'
  return {
    kind: hit ? 'thrown' : 'miss',
    label,
    points,
    foot: '',
    aria: `Dart ${i + 1}: ${label}, ${hit ? `${points} points` : 'no hit'}. Correct this dart`,
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
  const hint =
    o.suggest && o.opened && o.remaining > 0 && dartsLeft > 0 ? checkoutHint(o.remaining, o.outMode, dartsLeft, o.checkout) : null
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

/** Cricket: the thrown darts with the marks each is worth ("3 marks"), then the next dart. A visit
 *  that won the leg is over: the slots left are not thrown. */
export function cricketSlots(o: { darts: ThrownDart[]; targets: readonly number[]; locked: boolean }): Slot[] {
  const done = o.darts.slice(0, 3).map((d, i): Slot => {
    const m = dartMarks(d.segment ?? {}, o.targets)
    const marks = m ? plural(m, 'mark') : 'no mark'
    return { ...thrownSlot(d, i, m > 0, m ? marks : '0'), aria: `Dart ${i + 1}: ${d.segment?.name || 'Miss'}, ${marks}. Correct this dart` }
  })
  return [...done, ...(o.locked ? notThrown(done.length) : openSlots(done.length, []))]
}

/** The checkout labels to highlight on the board: only X01's next suggested dart. ATC's
 *  suggestion is a bare target number, not a checkout; the board shows its whole wedge. */
export function boardCheckoutTargets(slots: Slot[], isX01: boolean): string[] {
  return isX01 ? slots.filter(s => s.kind === 'suggested-next').map(s => s.label) : []
}
