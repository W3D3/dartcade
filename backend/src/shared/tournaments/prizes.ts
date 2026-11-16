// What an official tournament pays by final place. Pure, shared with the SPA.
import { perk } from '../progression.js'

/** Final places `from` to `to` (inclusive) each win `xp` and, when set, the title perk `title` (a perk id). */
export interface Prize {
  from: number
  to: number
  xp: number
  title: string | null
}

export const MAX_PRIZE_XP = 10_000

/** The prize of final place `place`, if any. */
export const prizeFor = (prizes: readonly Prize[], place: number): Prize | undefined => prizes.find(p => place >= p.from && place <= p.to)

/** What is wrong with a prize list, empty when fine: ranges in order, no overlap, known title perks. */
export function prizeProblems(prizes: readonly Prize[]): string[] {
  const out: string[] = []
  let last = 0
  for (const p of prizes) {
    if (p.from < 1 || p.to < p.from) out.push(`places ${p.from}-${p.to} are not a range`)
    else if (p.from <= last) out.push(`places ${p.from}-${p.to} overlap the prize before`)
    last = Math.max(last, p.to)
    if (p.xp < 0 || p.xp > MAX_PRIZE_XP) out.push(`XP for places ${p.from}-${p.to} must be 0 to ${MAX_PRIZE_XP}`)
    if (p.title !== null && perk(p.title)?.kind !== 'title') out.push(`${p.title} is not a title`)
    if (p.xp === 0 && p.title === null) out.push(`places ${p.from}-${p.to} win nothing`)
  }
  return out
}
