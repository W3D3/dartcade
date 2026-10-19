import { seatColor } from './profile.js'
import type { BoardTrigger, ColorLook, LightDevice, Rule, SeatLayout, WledPresetState, WledSeg, WledState } from './types.js'

// Segments cleared after the ones a whole/perSeat layout uses, so an older layout doesn't linger
const MAX_SEGMENTS = 16
const DIM = 38 // 15%: the other seats' parts in "one per seat"
const DEFAULT_SPEED = 128

const rgb = (hex: string): number[] => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const seatOf = (t: BoardTrigger): number | null => ('seat' in t ? t.seat : null)

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** For segmentMode 'wled': a preset's `seg` carries explicit start/stop (and other geometry) on the
 *  segments it sets, plus filler entries (`{stop: 0}`) that delete every segment beyond them. Sent
 *  as-is, that would destroy the user's own WLED segment layout, which the `wled` restore (no
 *  start/stop, no clearing) can't repair. So the filler entries are dropped and the geometry keys
 *  are stripped from what's left, leaving only the look (col, fx, …) applied to the existing segments. */
function withoutSegmentGeometry(state: WledPresetState): WledPresetState {
  const seg = state.seg
  if (!Array.isArray(seg)) return state
  const kept = seg
    .filter((s): s is Record<string, unknown> => isRecord(s) && s.stop !== 0)
    .map(({ start: _start, stop: _stop, len: _len, grp: _grp, spc: _spc, of: _of, ...rest }) => rest)
  return { ...state, seg: kept }
}

function lookColor(look: ColorLook, seat: number | null, layout: SeatLayout): string {
  const c = look.color
  if (c === 'seat') return seatColor(seat ?? 0)
  if (c === 'team') {
    const team = layout.teams?.find(ts => seat !== null && ts.includes(seat))
    return seatColor(team?.[0] ?? seat ?? 0)
  }
  return c
}

/** The WLED state that shows `rule` for trigger `t` on one device. */
export function patchFor(rule: Rule, t: BoardTrigger, device: LightDevice, layout: SeatLayout): WledState | WledPresetState {
  if ('preset' in rule.look) {
    const state = structuredClone(rule.look.state)
    return device.segmentMode === 'wled' ? withoutSegmentGeometry(state) : state
  }
  const seat = seatOf(t)
  // A preset the user applied earlier can leave its palette and other segment options behind on the
  // device; reset them so a colour look's effect (e.g. Breathe) can't inherit them (WLED effects take
  // their colours from the segment palette, and pal 0 "Default" is the one that uses col[0] as-is).
  const reset = { pal: 0, ix: 128, grp: 1, spc: 0, of: 0, rev: false, mi: false }
  const look = {
    on: true,
    bri: 255,
    col: [rgb(lookColor(rule.look, seat, layout))],
    fx: rule.look.fx,
    sx: rule.look.speed ?? DEFAULT_SPEED,
    ...reset,
  }
  const part = (i: number) =>
    seat === null || i === seat ? look : { on: true, bri: DIM, col: [rgb(seatColor(i))], fx: 0, sx: DEFAULT_SPEED, ...reset }
  const clear = (from: number): WledSeg[] => Array.from({ length: MAX_SEGMENTS - from }, (_, k) => ({ id: from + k, stop: 0 }))

  if (device.segmentMode === 'whole') {
    return { on: true, bri: rule.look.bri, seg: [{ id: 0, start: 0, stop: device.leds, ...look }, ...clear(1)] }
  }
  const n = Math.max(1, layout.seatCount)
  if (device.segmentMode === 'perSeat') {
    const size = Math.floor(device.leds / n)
    const seg: WledSeg[] = Array.from({ length: n }, (_, i) => ({
      id: i,
      start: Math.min(i * size, device.leds),
      stop: i === n - 1 ? device.leds : (i + 1) * size,
      ...part(i),
    }))
    return { on: true, bri: rule.look.bri, seg: [...seg, ...clear(n)] }
  }
  const count = Math.min(n, device.segments)
  return { on: true, bri: rule.look.bri, seg: Array.from({ length: count }, (_, i) => ({ id: i, ...part(i) })) }
}
