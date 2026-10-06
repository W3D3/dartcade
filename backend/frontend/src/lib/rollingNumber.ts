// ScoreCount on the canvas: big numbers turn like mechanical digit wheels. What a change
// does (roll, jump, which way, which colour) and how far each digit's drum turns.

export type Dir = 'down' | 'up'
/** plain: the usual way; back: a take-back (undo, correction), amber; bust: rolled back in red. */
export type Tone = 'plain' | 'back' | 'bust'
export type Change = { kind: 'none' | 'jump' | 'roll'; dir: Dir; tone: Tone }

/** How a rolling number reads its changes (see RollingNumber.svelte). */
export type RollOptions = {
  /** Which way the number usually moves: a score left counts down, a visit sum up. */
  normal?: Dir
  /** Changes when the number starts over (a new leg, a new visit): it jumps, no roll. */
  reset?: string | number
  /** The visit is bust: the change into it flashes red, shakes and rolls back up. */
  bust?: boolean
  /** Checked out: the number (0) turns lime once it has rolled in. */
  checkout?: boolean
  /** Something that only grows in play (ATC: targets done); a drop is a take-back. */
  progress?: number
}

/** One digit's drum: `place` 0 is the ones. `steps` is how many cells it turns, negative
 *  rolling down. `enter`/`leave`: a leading digit that slides in or away. */
export type Drum = { place: number; from: number; to: number; steps: number; enter: boolean; leave: boolean }

/** A number to roll: a static prefix ("+") and its digits; null for text such as "Bull". */
export function parseRolling(s: string): { prefix: string; digits: string } | null {
  const m = /^(\D*)(\d+)$/.exec(s)
  return m ? { prefix: m[1], digits: m[2] } : null
}

export function planChange(o: {
  from: string | null
  to: string
  /** Which way the number usually moves: a score left counts down, a visit sum up. */
  normal: Dir
  /** A new leg or visit: the number starts over without rolling. */
  reset?: boolean
  bust?: boolean
  wasBust?: boolean
  /** Something that only grows in play (ATC: targets done); a drop is a take-back. */
  progress?: number
  prevProgress?: number
  reducedMotion?: boolean
}): Change {
  const a = o.from === null ? null : parseRolling(o.from)
  const b = parseRolling(o.to)
  const numeric = a !== null && b !== null && a.prefix === b.prefix
  const dir: Dir = numeric && Number(b.digits) > Number(a.digits) ? 'up' : 'down'
  const busted = o.bust === true && !o.wasBust && o.from !== null && !o.reset
  // The visit was cleared (takeout, a new one opened) before another dart changed the score:
  // still a take-back, so the red doesn't just sit there till a later change happens to clear it
  const unbusted = o.wasBust === true && o.bust !== true
  // A dart that busts on a score that stays (the visit's first) still flashes and shakes
  if (o.from === o.to && !busted && !unbusted) return { kind: 'none', dir, tone: 'plain' }
  if (o.from === null || o.reset || !numeric) return { kind: 'jump', dir, tone: busted ? 'bust' : unbusted ? 'back' : 'plain' }

  let tone: Tone
  if (busted) tone = 'bust'
  else if (o.wasBust && !o.bust) tone = 'back'
  else if (o.progress !== undefined && o.prevProgress !== undefined && o.progress !== o.prevProgress)
    tone = o.progress < o.prevProgress ? 'back' : 'plain'
  else tone = dir === o.normal ? 'plain' : 'back'
  return { kind: o.reducedMotion ? 'jump' : 'roll', dir, tone }
}

/** The drums from one number to the next, most significant first. Each drum turns the short
 *  way in `dir`; the ones drum always turns at least once. */
export function planDrums(from: string, to: string, dir: Dir): Drum[] {
  const n = Math.max(from.length, to.length)
  const digit = (s: string, place: number) => (place < s.length ? Number(s[s.length - 1 - place]) : null)
  const changed = from !== to
  const drums: Drum[] = []
  for (let place = n - 1; place >= 0; place--) {
    const f = digit(from, place)
    const t = digit(to, place)
    const a = f ?? 0
    const z = t ?? 0
    let steps = dir === 'down' ? (a - z + 10) % 10 : (z - a + 10) % 10
    if (steps === 0 && place === 0 && changed) steps = 10
    drums.push({ place, from: a, to: z, steps: dir === 'down' && steps ? -steps : steps, enter: f === null, leave: t === null })
  }
  return drums
}
