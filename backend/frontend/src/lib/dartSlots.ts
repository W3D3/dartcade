// The three dart slots under the board: thrown darts, then what to aim at next.
import { parseLabel } from './dartUtils.js'
import { checkoutHint, type CheckoutPrefs } from '$shared/checkout.js'

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

export function atcSlots(o: { darts: ThrownDart[]; hits: boolean[]; target: string | null; multiplierAdvances?: boolean }): Slot[] {
  // With multiplierAdvances a double/treble moves 2/3 targets; bulls always move one
  const steps = (d: ThrownDart) => {
    const n = d.segment?.number ?? 0
    return o.multiplierAdvances && n <= 20 ? Math.max(1, d.segment?.multiplier ?? 1) : 1
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
  if (o.locked)
    return [
      ...done,
      ...openSlots(done.length, []).map((s, k): Slot => ({ ...s, kind: 'empty-later', aria: `Dart ${done.length + k + 1}: not thrown` })),
    ]
  const left = 3 - done.length
  if (!o.hint || left === 0) return [...done, ...openSlots(done.length, [])]
  const { need, high } = o.hint
  const within = left > 1 ? `in ${left} darts` : ''
  const foot = [within, `beats ${high}`].filter(Boolean).join(' · ')
  const [next, ...rest] = openSlots(done.length, [{ label: `${need}+`, foot }])
  const aria = `Dart ${done.length + 1}: needs ${need} or more ${within ? `${within} ` : ''}to beat HIGH ${high}`
  return [...done, { ...next, aria }, ...rest]
}

/** The checkout labels to highlight on the board: only X01's next suggested dart. ATC's
 *  suggestion is a bare target number, not a checkout; the board shows its whole wedge. */
export function boardCheckoutTargets(slots: Slot[], isX01: boolean): string[] {
  return isX01 ? slots.filter(s => s.kind === 'suggested-next').map(s => s.label) : []
}
