// What the visit band says, and how much it celebrates.
import type { ThrownDart } from './dartSlots.js'

export type VisitFx = 'none' | 'ton' | 'max'
export type BandData = {
  eyebrow: string; progress: string; progressShort: string; sum: string
  afterLabel: string; after: string; fx: VisitFx; bigDart: boolean; bust: boolean
}

export const visitFx = (sum: number): VisitFx => (sum === 180 ? 'max' : sum >= 100 ? 'ton' : 'none')
export const isBigDart = (score: number): boolean => score >= 50

const EYEBROW: Record<VisitFx, string> = { none: 'This visit', ton: 'Ton plus', max: 'Maximum' }

/** `scored`: points the engine took off this visit, when known (darts before opening,
 *  after a checkout, or 50/50 bulls differ from the dart faces). */
export function x01Band(o: { darts: ThrownDart[]; left: number; bust: boolean; scored?: number }): BandData {
  const sum = o.scored ?? o.darts.reduce((a, d) => a + (d.score ?? 0), 0)
  const fx = o.bust ? 'none' : visitFx(sum)
  const last = o.darts.at(-1)?.score ?? 0
  return {
    eyebrow: o.bust ? 'Bust' : EYEBROW[fx],
    progress: `${o.darts.length} of 3 darts`, progressShort: `${o.darts.length} of 3`,
    sum: String(sum), afterLabel: 'Left after', after: String(o.left),
    fx, bigDart: !o.bust && sum > 0 && isBigDart(last), bust: o.bust,
  }
}

export function atcBand(o: { dartCount: number; advanced: number; target: string }): BandData {
  return {
    eyebrow: 'This visit', progress: `${o.dartCount} of 3 darts`, progressShort: `${o.dartCount} of 3`,
    sum: `+${o.advanced}`, afterLabel: 'Target now', after: o.target, fx: 'none', bigDart: false, bust: false,
  }
}

/** ATC targets advanced this visit; counts hits when the visit's start is unknown (after a reload). */
export function atcAdvanced(hitCount: number, start: number | null, hits: boolean[]): number {
  return start === null ? hits.filter(Boolean).length : Math.max(0, hitCount - start)
}

/** Replay the celebration only when a celebrating sum goes up (not on undo, not on load). */
export function shouldReplay(prevSum: number | null, band: BandData): boolean {
  const sum = Number(band.sum.replace('+', ''))
  return prevSum !== null && sum > prevSum && (band.fx !== 'none' || band.bigDart)
}

/** The slot to pop: the last dart when it is worth 50+ and actually scored. */
export function bigDartIndex(darts: ThrownDart[], o: { opened: boolean; bust: boolean }): number | null {
  const last = darts.length - 1
  return last >= 0 && o.opened && !o.bust && isBigDart(darts[last].score ?? 0) ? last : null
}
