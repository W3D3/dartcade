// Pure helpers for Settings' Lights section: formatting a light profile's rules, a device's
// segment layout and "since" timestamps, and whether a flagged settings section shows.
import type { LightRule } from '$lib/api'

type SegmentMode = 'whole' | 'perSeat' | 'wled'

const TRIGGER_LABELS: Record<string, string> = {
  turn: 'Turn changes',
  visit: 'Visit scored',
  bust: 'Bust',
  checkout: 'Checkout',
  'game.won': 'Game won',
  'atc.hit': 'Target hit',
  'hilo.lifeLost': 'Life lost',
  'golf.sunk': 'Ball sunk',
  'bulloff.won': 'Bull off won',
  'takeout.started': 'Takeout',
  'takeout.finished': 'Takeout',
  idle: 'No game',
}

const COLOR_NAMES: Record<string, string> = {
  '#ffffff': 'white',
  '#ff3b30': 'red',
}

// WLED effect ids used by the built-in profile
const FX_NAMES: Record<number, string> = { 0: 'solid', 1: 'blink', 2: 'pulse', 9: 'rainbow', 20: 'sparkle', 42: 'fireworks' }

const colorLabel = (color: string): string =>
  color === 'seat' ? 'seat colour' : color === 'team' ? 'team colour' : (COLOR_NAMES[color] ?? color)

const fxLabel = (fx: number): string => FX_NAMES[fx] ?? `fx ${fx}`

// 4000 -> '4 s', 1500 -> '1.5 s'
const holdLabel = (holdMs: number): string => `${Number((holdMs / 1000).toFixed(1))} s`

/** A rule's row in the Light profile card: when it fires, its filter chip, type and look. */
export function ruleLabel(rule: LightRule): { when: string; filter: string | null; type: 'Scene' | 'Flash'; look: string } {
  const totalPart = rule.when.total ? `${rule.when.total.op === '=' ? '=' : '≥'} ${rule.when.total.n}` : null
  const otherPart = rule.when.seats === 'other' ? 'other board' : null
  const filterParts = [totalPart, otherPart].filter((p): p is string => p !== null)
  const look = `${colorLabel(rule.look.color)} · ${fxLabel(rule.look.fx)}${rule.holdMs ? ` · ${holdLabel(rule.holdMs)}` : ''}`
  return {
    when: TRIGGER_LABELS[rule.when.trigger] ?? rule.when.trigger,
    filter: filterParts.length ? filterParts.join(' · ') : null,
    type: rule.type === 'scene' ? 'Scene' : 'Flash',
    look,
  }
}

/** How a device's LEDs are split: '4 × 36 LEDs', '3 × 36 + 37 LEDs', '120 LEDs', '3 WLED segments'. */
export function segmentHint(leds: number, mode: SegmentMode, seats: number, wledSegments: number): string {
  if (mode === 'whole') return `${leds} LEDs`
  if (mode === 'wled') return `${wledSegments} WLED segment${wledSegments === 1 ? '' : 's'}`
  const n = Math.max(1, seats)
  const size = Math.floor(leds / n)
  if (leds % n === 0) return `${n} × ${size} LEDs`
  return `${n - 1} × ${size} + ${leds - (n - 1) * size} LEDs`
}

/** A device row's segment summary: 'Whole strip', 'One per seat', 'WLED segments · 2'. */
export function deviceSummary(d: { segmentMode: SegmentMode; segments: number }): string {
  if (d.segmentMode === 'whole') return 'Whole strip'
  if (d.segmentMode === 'perSeat') return 'One per seat'
  return `WLED segments · ${d.segments}`
}

/** '2 min ago' / '3 h ago' (from 60 min) / 'just now'; '' without a timestamp. */
export function since(iso: string | undefined, now: Date): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (isNaN(then)) return ''
  const ms = now.getTime() - then
  if (ms < 60_000) return 'just now'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} min ago`
  return `${Math.round(minutes / 60)} h ago`
}

/** Whether a settings section shows: always, unless it names a flag that's off. */
export function sectionVisible(s: { flag?: string; [key: string]: unknown }, flags: Partial<Record<string, boolean>>): boolean {
  return !s.flag || flags[s.flag] === true
}
