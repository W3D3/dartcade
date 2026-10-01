// The three dart slots under the board: thrown darts, then what to aim at next.
import { checkoutHint, parseLabel } from './dartUtils.js'

export type SlotKind = 'thrown' | 'miss' | 'bust' | 'suggested-next' | 'suggested-later' | 'empty-next' | 'empty-later'
export type Slot = { kind: SlotKind; label: string; points: string; foot: string; aria: string }
export type ThrownDart = { segment?: { name?: string; number?: number; multiplier?: number }; score?: number }

function thrownSlot(d: ThrownDart, i: number, hit: boolean, points: string): Slot {
  const label = d.segment?.name || 'Miss'
  return {
    kind: hit ? 'thrown' : 'miss', label, points, foot: '',
    aria: `Dart ${i + 1}: ${label}, ${hit ? `${points} points` : 'no hit'}. Correct this dart`,
  }
}

/** Slots from `from` to the third: suggestions first, then empty ones. */
function openSlots(from: number, suggestions: { label: string; foot: string }[]): Slot[] {
  const out: Slot[] = []
  for (let i = from; i < 3; i++) {
    const s = suggestions.at(i - from)
    const next = i === from
    out.push(s
      ? { kind: next ? 'suggested-next' : 'suggested-later', label: s.label, points: '', foot: s.foot, aria: `Dart ${i + 1}: suggested ${s.label}, ${s.foot}` }
      : { kind: next ? 'empty-next' : 'empty-later', label: '', points: '', foot: '', aria: `Dart ${i + 1}: ${next ? 'next' : 'not thrown'}` })
  }
  return out
}

export function x01Slots(o: {
  darts: ThrownDart[]; remaining: number; outMode: 'straight' | 'double' | 'master'
  opened: boolean; bust: boolean; suggest: boolean
}): Slot[] {
  const done = o.darts.slice(0, 3).map((d, i) => {
    const score = d.score ?? 0
    return thrownSlot(d, i, score > 0, String(score))
  })
  if (o.bust) {
    return [...done, ...Array.from({ length: 3 - done.length }, (_, k): Slot =>
      ({ kind: 'bust', label: 'Bust', points: '', foot: '', aria: `Dart ${done.length + k + 1}: bust` }))]
  }
  const dartsLeft = 3 - done.length
  const hint = o.suggest && o.opened && o.remaining > 0 && dartsLeft > 0
    ? checkoutHint(o.remaining, o.outMode, dartsLeft) : null
  let rest = o.remaining
  const suggestions = (hint ?? []).map((label, k, all) => {
    rest -= parseLabel(label).score
    const foot = k < all.length - 1 ? `leaves ${rest}` : all.length === 1 ? 'Game shot' : 'to win the leg'
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
