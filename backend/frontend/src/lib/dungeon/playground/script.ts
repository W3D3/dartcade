// The throw script: "t20 t20 s5", "D16, 25, miss", "20x3". Tokens split on spaces, commas and semicolons.
import type { Hit, Ring } from '$shared/dungeon/hit.js'
import { MISS } from '$shared/dungeon/hit.js'

export type ScriptResult = { hits: Hit[]; errors: { token: string; message: string }[] }

const RINGS: Record<number, Ring> = { 1: 'single', 2: 'double', 3: 'treble' }

/** A dart on a number 1-20 with a multiplier 1-3. */
export const onNumber = (number: number, multiplier: 1 | 2 | 3): Hit => ({ number, ring: RINGS[multiplier], score: number * multiplier })
export const OUTER_BULL: Hit = { number: 25, ring: 'bull', score: 25 }
export const BULLSEYE: Hit = { number: 25, ring: 'bullseye', score: 50 }

const num = (s: string): number | null => (/^\d{1,2}$/.test(s) ? Number(s) : null)
const onBoard = (n: number | null): n is number => n !== null && n >= 1 && n <= 20

function parseToken(raw: string): Hit | string {
  const t = raw.toLowerCase()
  if (['miss', 'm', '0', 'out'].includes(t)) return MISS
  if (['bull', 'bullseye', 'db', 'inner', '50'].includes(t)) return BULLSEYE
  if (['outer', 'sb', 'ob', '25'].includes(t)) return OUTER_BULL
  const ring = /^([sdt])(\d{1,2})$/.exec(t)
  if (ring) {
    const n = num(ring[2])
    if (!onBoard(n)) return `${ring[2]} is not a number on the board`
    return onNumber(n, ring[1] === 's' ? 1 : ring[1] === 'd' ? 2 : 3)
  }
  const times = /^(\d{1,2})x([123])$/.exec(t)
  if (times) {
    const n = num(times[1])
    const m = times[2] === '1' ? 1 : times[2] === '2' ? 2 : 3
    if (n === 25) return m === 1 ? OUTER_BULL : m === 2 ? BULLSEYE : 'the bull has no treble'
    if (!onBoard(n)) return `${times[1]} is not a number on the board`
    return onNumber(n, m)
  }
  const single = num(t)
  if (onBoard(single)) return onNumber(single, 1)
  return 'not a dart: try t20, d16, s5, 20x3, 25, bull or miss'
}

export function parseScript(text: string): ScriptResult {
  const out: ScriptResult = { hits: [], errors: [] }
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    const r = parseToken(token)
    if (typeof r === 'string') out.errors.push({ token, message: r })
    else out.hits.push(r)
  }
  return out
}

/** A dart as the script writes it (what `parseScript` reads back). */
export const hitLabel = (h: Hit): string =>
  h.ring === 'miss' ? 'miss' : h.ring === 'bull' ? '25' : h.ring === 'bullseye' ? 'bull' : `${h.ring[0].toUpperCase()}${h.number}`
