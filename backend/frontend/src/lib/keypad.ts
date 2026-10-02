// The keypad's number keys: the dart for the multiplier tab that is on, and the tab after it.
import type { Segment } from './api/game-ws'

export type Mult = 1 | 2 | 3

const SHORT = { 1: 'S', 2: 'D', 3: 'T' } as const
const BED: Record<Mult, Segment['bed']> = { 1: 'SingleOuter', 2: 'Double', 3: 'Triple' }

/** A number key: the dart, and the tab to show next. Double and Treble only last for one dart. */
export function keypadPick(number: number, mult: Mult): { dart: Segment; mult: Mult } {
  return { dart: { name: `${SHORT[mult]}${number}`, number, bed: BED[mult], multiplier: mult }, mult: 1 }
}
