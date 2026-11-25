// What a WLED state patch may hold: the keys a light can change and nothing else (no preset save
// or delete, no reboot, no sync or network settings). A raw JSON look is checked against it, and
// the bridge keeps its own copy (bridge/internal/wled/allow.go); schema/wled-state-allowlist.json
// is the list both are tested against.
import type { WledPresetState } from './types.js'

type Check = { kind: 'bool' } | { kind: 'int'; min: number; max: number } | { kind: 'name' } | { kind: 'colors' } | { kind: 'segs' }

const bool: Check = { kind: 'bool' }
const byte: Check = { kind: 'int', min: 0, max: 255 }
const int = (min: number, max: number): Check => ({ kind: 'int', min, max })

/** The top-level keys, and what each may be. `ps` plays a preset (or playlist) saved on the strip. */
export const WLED_STATE_KEYS = {
  on: bool,
  bri: byte,
  transition: int(0, 65535),
  mainseg: int(0, 31),
  ps: int(-1, 250),
  seg: { kind: 'segs' },
} as const satisfies Record<string, Check>

/** The keys of one segment. */
export const WLED_SEG_KEYS = {
  id: int(0, 31),
  start: int(0, 65535),
  stop: int(0, 65535),
  len: int(0, 65535),
  grp: byte,
  spc: byte,
  of: int(0, 65535),
  on: bool,
  frz: bool,
  bri: byte,
  cct: int(0, 65535),
  set: int(0, 3),
  lc: byte,
  n: { kind: 'name' },
  col: { kind: 'colors' },
  fx: byte,
  sx: byte,
  ix: byte,
  pal: byte,
  c1: byte,
  c2: byte,
  c3: byte,
  sel: bool,
  rev: bool,
  mi: bool,
  o1: bool,
  o2: bool,
  o3: bool,
  si: int(0, 3),
  m12: int(0, 4),
  bm: byte,
} as const satisfies Record<string, Check>

/** The most segments and bytes a raw look may hold. */
export const MAX_RAW_SEGMENTS = 32
export const MAX_RAW_BYTES = 2048

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function problem(c: Check, v: unknown, at: string): string[] {
  switch (c.kind) {
    case 'bool':
      return typeof v === 'boolean' ? [] : [`${at} must be true or false`]
    case 'int':
      return typeof v === 'number' && Number.isInteger(v) && v >= c.min && v <= c.max
        ? []
        : [`${at} must be a whole number from ${c.min} to ${c.max}`]
    case 'name':
      return typeof v === 'string' && v.length <= 32 ? [] : [`${at} must be text of at most 32 characters`]
    case 'colors': {
      const ok =
        Array.isArray(v) &&
        v.length <= 3 &&
        v.every(c => Array.isArray(c) && (c.length === 3 || c.length === 4) && c.every(n => Number.isInteger(n) && n >= 0 && n <= 255))
      return ok ? [] : [`${at} must be up to three [r, g, b] colours from 0 to 255`]
    }
    case 'segs': {
      if (!Array.isArray(v)) return [`${at} must be a list of segments`]
      if (v.length > MAX_RAW_SEGMENTS) return [`${at} has more than ${MAX_RAW_SEGMENTS} segments`]
      return v.flatMap((s, i) => (isRecord(s) ? keysProblems(s, WLED_SEG_KEYS, `${at}[${i}]`) : [`${at}[${i}] must be an object`]))
    }
  }
}

function keysProblems(o: Record<string, unknown>, allowed: Record<string, Check>, prefix: string): string[] {
  return Object.entries(o).flatMap(([k, v]) => {
    const at = prefix ? `${prefix}.${k}` : k
    return Object.hasOwn(allowed, k) ? problem(allowed[k], v, at) : [`${at} is not allowed`]
  })
}

/** The state if every key is allowed and in range, else what is wrong with it (one line each). */
export function checkWledState(v: unknown): { ok: true; state: WledPresetState } | { ok: false; problems: string[] } {
  if (!isRecord(v)) return { ok: false, problems: ['The state must be a JSON object'] }
  if (JSON.stringify(v).length > MAX_RAW_BYTES) return { ok: false, problems: [`The state is longer than ${MAX_RAW_BYTES} characters`] }
  const problems = keysProblems(v, WLED_STATE_KEYS, '')
  if (Object.keys(v).length === 0) problems.push('The state is empty')
  return problems.length ? { ok: false, problems } : { ok: true, state: v }
}
