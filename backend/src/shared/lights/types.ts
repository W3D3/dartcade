// Types shared by the backend's light service and the frontend's light settings UI.
// Dependency-free, like the rest of $shared.

export type GameId = 'x01' | 'atc' | 'p121' | 'hilo' | 'minigolf'

export type Trigger =
  | { kind: 'turn'; seat: number }
  | { kind: 'game.won'; seat: number }
  | { kind: 'idle' }
  | { kind: 'takeout.started' }
  | { kind: 'takeout.finished' }
  | { kind: 'visit'; seat: number; total: number }
  | { kind: 'bust'; seat: number }
  | { kind: 'checkout'; seat: number }
  | { kind: 'atc.hit'; seat: number; target: number }
  | { kind: 'hilo.lifeLost'; seat: number }
  | { kind: 'golf.sunk'; seat: number; strokes: number }
  | { kind: 'bulloff.won'; seat: number }

export type TriggerKind = Trigger['kind']

/** A trigger plus whether it happened on this board (vs. a remote seat in the same game). */
export type BoardTrigger = Trigger & { local: boolean }

export type Look = { color: 'seat' | 'team' | `#${string}`; fx: number; bri: number; speed?: number }

export type Rule = {
  when: { trigger: TriggerKind; total?: { op: '=' | '>='; n: number }; seats: 'any' | 'mine' | 'other'; game?: GameId }
  type: 'scene' | 'flash'
  look: Look
  holdMs?: number
}

export type Profile = { id: 'default'; name: string; rules: Rule[] }

export type SegmentMode = 'whole' | 'perSeat' | 'wled'

export type LightDevice = { leds: number; segmentMode: SegmentMode; segments: number }

/** teams: seats per team */
export type SeatLayout = { seatCount: number; teams?: number[][] }

export type WledSeg = { id: number; start?: number; stop?: number; on?: boolean; bri?: number; col?: number[][]; fx?: number; sx?: number }

export type WledState = { on: true; bri: number; seg: WledSeg[] }
