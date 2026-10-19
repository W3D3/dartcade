// Step state for the pair/edit dialog (Settings' Lights, Task 13): where the user is in pairing
// a found device (confirm its blink, then name it and set it up) or editing a paired one
// (straight to the details), and the brightness slider's percent <-> WLED 1-255 conversion.
//
// The candidate is tracked by its `mac`, not by an index into `found`: the bridge's rescans
// replace that list (order isn't stable, probes can drop entries) while this state and the poll
// that refreshes `found` live for as long as the dialog is open, so an index can end up pointing
// at a different device than the one the user is looking at. A mac survives a reorder; if it
// stops resolving (the device went offline, or got paired to another board first), the dialog
// looks that up itself and shows it as gone rather than silently substituting another device.
import type { FoundWledDevice, WledDevice } from '$lib/api'
import type { SegmentMode } from './view'

export type PairStep = 'check' | 'details'

export type PairState = {
  step: PairStep
  /** The found device's mac being confirmed or paired; null once none are left to offer. */
  mac: string | null
  name: string
  boardId: string
  segmentMode: SegmentMode
  maxBri: number
}

const DEFAULT_MAX_BRI = 178

/** Found devices eligible to pair: not already paired to another board. */
function eligible(found: FoundWledDevice[]): FoundWledDevice[] {
  return found.filter(d => !d.onBoard)
}

/** Starts pairing `mac`, keeping it even if it isn't (or is no longer) in `found` — never
 * substitutes a different device. */
export function startPair(found: FoundWledDevice[], mac: string, boardId: string): PairState {
  const match = found.find(d => d.mac === mac)
  return { step: 'check', mac, name: match?.name ?? '', boardId, segmentMode: 'whole', maxBri: DEFAULT_MAX_BRI }
}

export function startEdit(d: WledDevice, boardId: string): PairState {
  return { step: 'details', mac: d.mac, name: d.name, boardId, segmentMode: d.segmentMode, maxBri: d.maxBri }
}

/** "No, show me another": the next eligible found device after the current mac, wrapping; the
 * first eligible one if the current mac isn't eligible (paired elsewhere, or gone); null if none
 * are eligible at all. */
export function nextCandidate(s: PairState, found: FoundWledDevice[]): PairState {
  const list = eligible(found)
  if (list.length === 0) return { ...s, mac: null }
  const pos = list.findIndex(d => d.mac === s.mac)
  const next = list[(pos + 1) % list.length]
  return { ...s, mac: next.mac, name: next.name }
}

export function confirmBlink(s: PairState): PairState {
  return { ...s, step: 'details' }
}

/** WLED's 1-255 brightness as a percent, e.g. 178 -> 70. */
export function brightnessPercent(maxBri: number): number {
  return Math.round((maxBri * 100) / 255)
}

/** A percent back to WLED's 1-255 range, e.g. 70 -> 178. */
export function maxBriFromPercent(p: number): number {
  return Math.max(1, Math.floor((p * 255) / 100))
}
