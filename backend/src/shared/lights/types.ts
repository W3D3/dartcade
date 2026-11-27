// Types shared by the backend's light service and the frontend's light settings UI.
// Dependency-free, like the rest of $shared.

import type { GameId } from '../gameNames.js'

export type { GameId }

export type Trigger =
  | { kind: 'turn'; seat: number }
  | { kind: 'game.won'; seat: number }
  | { kind: 'lobby' }
  | { kind: 'takeout.started' }
  | { kind: 'takeout.finished' }
  | { kind: 'calibration.finished' }
  | { kind: 'visit'; seat: number; total: number }
  | { kind: 'bust'; seat: number }
  | { kind: 'checkout'; seat: number }
  | { kind: 'cricket.closed'; seat: number }
  | { kind: 'p121.made'; seat: number }
  | { kind: 'hilo.lifeLost'; seat: number }
  | { kind: 'golf.sunk'; seat: number; strokes: number }
  | { kind: 'bulloff.won'; seat: number }
  | { kind: 'dungeon.hit'; seat: number }
  | { kind: 'dungeon.kill'; seat: number }
  | { kind: 'dungeon.hurt'; seat: number }
  | { kind: 'dungeon.victory' }
  | { kind: 'dungeon.defeat' }

export type TriggerKind = Trigger['kind']

/** A trigger plus whether it happened on this board (vs. a remote seat in the same game). */
export type BoardTrigger = Trigger & { local: boolean }

/** A raw WLED state, as sent back verbatim for a preset look (e.g. GET /json/state of a saved preset). */
export type WledPresetState = Record<string, unknown>

/** `ix` is WLED's effect intensity, `pal` its palette (0, Default, takes the colour as is). */
export type ColorLook = { color: 'seat' | 'team' | `#${string}`; fx: number; bri: number; speed?: number; ix?: number; pal?: number }
/** One of Dartcade's own preset states (`PRESETS`), by name; the state always comes from the server's copy. */
export type PresetLook = { preset: string; state: WledPresetState }
/** A preset saved on the player's own strip, by its WLED id. */
export type StripPresetLook = { ps: number }
/** A playlist saved on the player's own strip, by its WLED id (WLED starts a playlist through `ps`). */
export type PlaylistLook = { pl: number }
/** A WLED state patch the player wrote, only with the keys `checkWledState` allows. */
export type RawLook = { raw: WledPresetState }
export type Look = ColorLook | PresetLook | StripPresetLook | PlaylistLook | RawLook

/** A visit total filter; `between` includes both ends. */
export type TotalFilter = { op: '=' | '>=' | '<='; n: number } | { op: 'between'; n: number; to: number }

export type Rule = {
  when: { trigger: TriggerKind; total?: TotalFilter; seats: 'any' | 'mine' | 'other'; game?: GameId }
  type: 'scene' | 'flash'
  /** A disabled rule never matches. */
  enabled: boolean
  look: Look
  holdMs?: number
}

/** `seatColors`: one `#rrggbb` per seat from seat 1; a seat past the end wraps around (`seatColor`). */
export type Profile = { id: string; name: string; seatColors: readonly string[]; rules: Rule[] }

export type SegmentMode = 'whole' | 'perSeat' | 'wled'

export type LightDevice = { leds: number; segmentMode: SegmentMode; segments: number }

/** teams: seats per team */
export type SeatLayout = { seatCount: number; teams?: number[][] }

export type WledSeg = {
  id: number
  start?: number
  stop?: number
  on?: boolean
  bri?: number
  col?: number[][]
  fx?: number
  sx?: number
  pal?: number
  ix?: number
  grp?: number
  spc?: number
  of?: number
  rev?: boolean
  mi?: boolean
}

export type WledState = { on: true; bri: number; seg: WledSeg[] }
