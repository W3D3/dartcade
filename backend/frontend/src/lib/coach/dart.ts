// A visit's darts as the coach draws them (Coach-Leg): each tile's tone, its class label under it,
// and the selected visit's dart table.
import { SEGS } from '$shared/board'
import type { ReviewDart, ReviewVisit } from '$shared/coach'
import { aimById, aimKind, directOutId, oneDartFinish } from '$shared/coach/aims'
import type { DartClass } from '$shared/coach/dartClass'
import { dartBand, NEAR_MISS_MM, type DartBand } from '$shared/coach/grade'

/** How a dart tile looks (Coach-Leg). A graded dart (finish and setup visits) by its band
 *  (grade.ts dartBand): green good, plain, yellow a slight loss, orange costly, red the busting
 *  dart. Without a grade (Scoring, after a bust) a treble, double or bull green, a single plain, a
 *  miss red-lettered. Off the board is dashed in every tone. */
export type DartTone = DartBand | 'bust' | 'miss'
/** `word`: the grade for screen readers, so colour isn't the only signal; null without a grade */
export type DartTileView = { name: string; tone: DartTone; offBoard: boolean; word: string | null; label: string }

const TONE_WORD: Record<DartTone, string> = {
  good: 'good',
  plain: 'even',
  weak: 'slight loss',
  costly: 'costly',
  bust: 'bust',
  miss: 'miss',
}

/** Tone without a grade: a treble, double or bull good */
const GOOD_BEDS = new Set(['T', 'D', 'Bull'])

export function dartTone(d: Pick<ReviewDart, 'bedAimId' | 'bust' | 'class' | 'delta' | 'closeness'>): DartTone {
  if (d.delta === null) return d.bedAimId === null ? 'miss' : GOOD_BEDS.has(aimKind(d.bedAimId)) ? 'good' : 'plain'
  return d.bust ? 'bust' : dartBand(d.delta, d.closeness, d.class.hit, d.bust)
}

/** A visit's darts with their tones and class labels. */
export const visitTiles = (v: Pick<ReviewVisit, 'darts'>): DartTileView[] =>
  v.darts.map(d => {
    const tone = dartTone(d)
    return { name: d.name, tone, offBoard: d.bedAimId === null, word: d.delta === null ? null : TONE_WORD[tone], label: dartLabel(d.class) }
  })

/** `tile`: the dart in its visit-row tile's tone */
export type DartRow = { tile: DartTileView; label: string; distance: string; near: boolean }

/** The selected visit's dart table (Coach-Leg): each dart's tile, class label and its distance to
 *  its target's bed, "4 mm from D16"; "–" for a hit or a dart without a position. */
export const dartRows = (v: Pick<ReviewVisit, 'darts'>): DartRow[] => {
  const tiles = visitTiles(v)
  return v.darts.map(({ class: c }, i) => {
    const edge = c.hit || !c.target ? null : (c.miss?.edgeMm ?? null)
    return {
      tile: tiles[i],
      label: tiles[i].label,
      distance: edge === null ? '–' : `${wholeMm(edge)} from ${c.target?.label}`,
      near: edge !== null && edge <= NEAR_MISS_MM,
    }
  })
}

/** Offset parts this small get no direction word */
const DIRECTION_MIN_MM = 0.5
/** Millimetres as a player reads them: whole, at least 1 */
const wholeMm = (mm: number) => `${Math.max(1, Math.round(mm))} mm`

/** The number next to target `aimId` on the clockwise (+) or anticlockwise (−) side: a wire's own
 *  two numbers (W20-1: 1 clockwise, 20 anticlockwise), else the board neighbour (T20: 1, 5). */
function towards(aimId: string, clockwise: boolean): number | null {
  const numbers = aimById(aimId)?.numbers ?? []
  if (numbers.length === 2) return numbers[clockwise ? 1 : 0]
  const i = SEGS.indexOf(numbers[0])
  return i < 0 ? null : SEGS[(i + (clockwise ? 1 : 19)) % 20]
}

/** "4 mm inside, towards 1": the miss's distance from the edge of the target's bed and its
 *  direction parts above half a millimetre, the larger first, the same wherever the target sits on
 *  the board. Radial − is inside (towards the bull), + outside; tangential names the neighbouring
 *  number on that side. Null without a camera position: the dart sits at its bed's centre, so the
 *  millimetres would be made up. */
function offset(c: DartClass): string | null {
  const m = c.miss
  if (c.estimated || m === null) return null
  const r = m.edgeRadialMm
  const t = m.edgeTangentialMm
  const side = c.target ? towards(c.target.aimId, t > 0) : null
  const parts = [
    { mm: Math.abs(r), word: r < 0 ? 'inside' : 'outside' },
    { mm: side === null ? 0 : Math.abs(t), word: `towards ${side}` },
  ]
    .filter(p => p.mm > DIRECTION_MIN_MM)
    .sort((x, y) => y.mm - x.mm)
    .map(p => p.word)
  return `${wholeMm(m.edgeMm)}${parts.length ? ` ${parts.join(', ')}` : ''}`
}

/** A route at a double whose hit leaves a one-dart finish: 64 → D16, double to double */
const setupDouble = (c: DartClass) =>
  c.target !== null && aimKind(c.target.aimId) === 'D' && c.plannedLeave !== null && oneDartFinish(c.plannedLeave)

/** Where a setup double's miss went, as a Double attempt's: outside (scored nothing), inside (its
 *  number), wide (another) */
function setupMiss(c: DartClass): 'inside' | 'outside' | 'wide' {
  const double = 2 * Number(c.target?.aimId.slice(1))
  if (c.actualLeave === (c.plannedLeave ?? 0) + double) return 'outside'
  return c.miss?.wedgesOff === 0 ? 'inside' : 'wide'
}

/** What a dart was aimed at and whether it got there, under its tile: "T20 ✓", "Miss T20 · 4 mm
 *  inside, towards 1" (from the bed's edge), "Split → D16 ✓", "D16 inside", a setup double "D16 ✓
 *  double to double". It never judges the choice of target (the strategy
 *  note does). Without a camera position a miss reads "· est." instead of its millimetres. */
export function dartLabel(c: DartClass): string {
  const t = c.target?.label ?? '?'
  const miss = () => {
    const o = offset(c)
    return o ? ` · ${o}` : c.estimated ? ' · est.' : ''
  }
  const tick = (hit: boolean) => (hit ? '✓' : '✗')
  // A typed miss has no position: off the board is a guess
  const doubleMiss = (where: string | null) =>
    where === 'wide' ? `${t} wide${miss()}` : `${t} ${where ?? 'missed'}${c.miss === null ? ' · est.' : ''}`
  switch (c.kind) {
    case 'scoringHit':
      return `${t} ✓`
    case 'scoringSingle':
      return `Single ${t.replace(/^T/, '')}`
    case 'scoringMiss':
      return `Miss ${t}${miss()}`
    case 'route':
      if (setupDouble(c)) return c.hit ? `${t} ✓ double to double` : doubleMiss(setupMiss(c))
      return c.hit ? `Aimed ${t} ✓` : `Miss ${t}${miss()}`
    case 'split':
      return `Split → ${directOutId(c.plannedLeave ?? 0) ?? '?'} ${tick(c.hit)}`
    case 'double':
      return c.hit ? `${t} ✓` : doubleMiss(c.detail)
    case 'bull':
      if (c.hit) return `${t} ✓`
      if (c.detail === 'sb') return '25 (aimed Bull)'
      if (c.detail === 'db') return 'Bull (aimed 25)'
      // Around the bull, high/low and left/right mean nothing: the distance only
      return `Miss ${t}${c.estimated ? ' · est.' : c.miss === null ? '' : ` · ${wholeMm(c.miss.edgeMm)}`}`
    case 'bustBack':
      return c.hit ? 'Bust-back ✓' : 'Bust-back missed'
    case 'bust':
      return 'Bust'
    case 'wild':
      return 'Wild'
    case 'notCounted':
      return 'Not counted'
  }
}
