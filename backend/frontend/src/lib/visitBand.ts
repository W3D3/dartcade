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

export function x01Band(o: { darts: ThrownDart[]; left: number; bust: boolean }): BandData {
  const sum = o.darts.reduce((a, d) => a + (d.score ?? 0), 0)
  const fx = o.bust ? 'none' : visitFx(sum)
  const last = o.darts.at(-1)?.score ?? 0
  return {
    eyebrow: o.bust ? 'Bust' : EYEBROW[fx],
    progress: `${o.darts.length} of 3 darts`, progressShort: `${o.darts.length} of 3`,
    sum: String(sum), afterLabel: 'Left after', after: String(o.left),
    fx, bigDart: !o.bust && isBigDart(last), bust: o.bust,
  }
}

export function atcBand(o: { dartCount: number; advanced: number; target: string }): BandData {
  return {
    eyebrow: 'This visit', progress: `${o.dartCount} of 3 darts`, progressShort: `${o.dartCount} of 3`,
    sum: `+${o.advanced}`, afterLabel: 'Target now', after: o.target, fx: 'none', bigDart: false, bust: false,
  }
}
