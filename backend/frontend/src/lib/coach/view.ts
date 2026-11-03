// Which finished games the coach reviews; how the Coach page shows a leg; how its tiles, pills and
// board draw a visit.
import type { CoachLegRow, CoachLegTitle, GameSummary } from '$lib/api'
import type { BedRing } from '$lib/details/boardGeometry'
import { startOfDay } from '$lib/fmt'
import { formatWhen } from '$lib/history'
import { HALF, SEGS } from '$shared/board'
import { checkoutHint } from '$shared/checkout.js'
import type { CoachNote, ReviewVisit, VisitGrade } from '$shared/coach'
import { AIM_RINGS, AIMS, aimKind, directOutId, type Aim } from '$shared/coach/aims'
import type { DartClass } from '$shared/coach/dartClass'
import { coachable as coachableGame } from '$shared/coach/coachable'

/** The coach reviews the game (shared/coach/coachable.ts) */
export const coachable = (game: Pick<GameSummary, 'mode' | 'config'>): boolean => coachableGame(game.mode, game.config)

/** A leg's title: "vs Lena", "vs Max, Sophie", or "Solo" without an opponent. */
export const vsLine = (opponents: readonly string[]): string => (opponents.length ? `vs ${opponents.join(', ')}` : 'Solo')

/** The Coach page's leg filters, as the API names them */
export const COACH_FILTERS = [
  { id: 'all', label: 'All legs' },
  { id: 'lost', label: 'Lost' },
  { id: 'ranked', label: 'Ranked' },
  { id: 'missedDoubles', label: 'Missed doubles' },
  { id: 'badSetups', label: 'Bad setups' },
  { id: 'lowVisits', label: 'Low visits' },
] as const
export type CoachFilter = (typeof COACH_FILTERS)[number]['id']

/** The Coach page's filter from its querystring (`filter=lost`); All legs when missing or unknown. */
export function coachFilter(querystring: string | undefined): CoachFilter {
  const f = new URLSearchParams(querystring ?? '').get('filter')
  return COACH_FILTERS.find(x => x.id === f)?.id ?? 'all'
}

/** A "Coach found" pill on a leg row (Coach-Review) */
export type FoundPill = { text: string; tone: 'red' | 'yellow' | 'green' }
const counted = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Missed doubles red, bad setups and low visits yellow; a clean leg only its green pill */
export function coachFound(row: Pick<CoachLegRow, 'missedDoubles' | 'badSetups' | 'lowVisits' | 'clean'>): FoundPill[] {
  if (row.clean) return [{ text: 'Clean leg', tone: 'green' }]
  const pills: FoundPill[] = []
  if (row.missedDoubles > 0) pills.push({ text: counted(row.missedDoubles, 'missed double'), tone: 'red' })
  if (row.badSetups > 0) pills.push({ text: counted(row.badSetups, 'bad setup'), tone: 'yellow' })
  if (row.lowVisits > 0) pills.push({ text: counted(row.lowVisits, 'low visit'), tone: 'yellow' })
  return pills
}

/** When a leg finished (Coach-Review): "Today 21:14", "Yesterday", the weekday ("Mon") within the
 *  week, the date beyond it. */
export function legWhen(iso: string, now: Date): string {
  const { day, time } = formatWhen(iso, now)
  if (day === 'Today') return `Today ${time}`
  const d = new Date(iso)
  const ago = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  return ago >= 2 && ago <= 6 ? d.toLocaleDateString('en-GB', { weekday: 'short' }) : day
}

/** How a dart tile looks (Coach-Leg): a treble, double or bull green, a single plain, a single or
 *  25 thrown at a one-dart finish red (a missed double), off the board dashed. */
export type DartTone = 'hit' | 'single' | 'missed' | 'miss'

/** `before`: the score left before the dart */
export function dartTone(name: string, before: number): DartTone {
  if (name === 'Miss') return 'miss'
  if (/^[TD]\d/.test(name) || name === 'Bull') return 'hit'
  const onDouble = before === 50 || (before <= 40 && before % 2 === 0)
  return onDouble ? 'missed' : 'single'
}

/** A visit's darts with their tones and class labels; each dart's score before it is the previous dart's `left`. */
export const visitTiles = (v: Pick<ReviewVisit, 'left' | 'darts'>): { name: string; tone: DartTone; label: string }[] =>
  v.darts.map((d, i) => ({ name: d.name, tone: dartTone(d.name, i === 0 ? v.left : v.darts[i - 1].left), label: dartLabel(d.class) }))

/** Offset parts this small get no direction word */
const DIRECTION_MIN_MM = 0.5
/** Millimetres as a player reads them: whole, at least 1 */
const wholeMm = (mm: number) => `${Math.max(1, Math.round(mm))} mm`

/** The number next to target `aimId` on the clockwise (+) or anticlockwise (−) side: a wire's own
 *  two numbers (W20-1: 1 clockwise, 20 anticlockwise), else the board neighbour (T20: 1, 5). */
function towards(aimId: string, clockwise: boolean): number | null {
  const wire = /^W(\d+)-(\d+)$/.exec(aimId)
  if (wire) return Number(wire[clockwise ? 2 : 1])
  const i = SEGS.indexOf(Number(/\d+/.exec(aimId)?.[0]))
  return i < 0 ? null : SEGS[(i + (clockwise ? 1 : 19)) % 20]
}

/** "4 mm inside, towards 1": the miss's distance from the edge of the target's bed and its
 *  direction parts above half a millimetre, the larger first, the same wherever the target sits on
 *  the board. Radial − is inside (towards the bull), + outside; tangential names the neighbouring
 *  number on that side. Null without a camera position: the dart sits at its bed's centre, so the
 *  millimetres would be made up. */
function offset(c: DartClass): string | null {
  if (c.estimated || c.edgeMm === null) return null
  const r = c.edgeRadialMm ?? 0
  const t = c.edgeTangentialMm ?? 0
  const side = c.target ? towards(c.target.aimId, t > 0) : null
  const parts = [
    { mm: Math.abs(r), word: r < 0 ? 'inside' : 'outside' },
    { mm: side === null ? 0 : Math.abs(t), word: `towards ${side}` },
  ]
    .filter(p => p.mm > DIRECTION_MIN_MM)
    .sort((x, y) => y.mm - x.mm)
    .map(p => p.word)
  return `${wholeMm(c.edgeMm)}${parts.length ? ` ${parts.join(', ')}` : ''}`
}

/** What a dart was aimed at and whether it got there, under its tile: "T20 ✓", "Miss T20 · 4 mm
 *  inside, towards 1" (from the bed's edge), "Split → D16 ✓", "D16 inside". It never judges the choice of target (the strategy
 *  note does). Without a camera position a miss reads "· est." instead of its millimetres. */
export function dartLabel(c: DartClass): string {
  const t = c.target?.label ?? '?'
  const miss = () => {
    const o = offset(c)
    return o ? ` · ${o}` : c.estimated ? ' · est.' : ''
  }
  const tick = (hit: boolean) => (hit ? '✓' : '✗')
  switch (c.kind) {
    case 'scoringHit':
      return `${t} ✓`
    case 'scoringSingle':
      return `Single ${t.replace(/^T/, '')}`
    case 'scoringMiss':
      return `Miss ${t}${miss()}`
    case 'route':
      return c.hit ? `Aimed ${t} ✓` : `Miss ${t}${miss()}`
    case 'split':
      return `Split → ${directOutId(c.plannedLeave ?? 0) ?? '?'} ${tick(c.hit)}`
    case 'double':
      if (c.hit) return `${t} ✓`
      // A typed miss has no position: off the board is a guess
      return c.detail === 'wide' ? `${t} wide${miss()}` : `${t} ${c.detail ?? 'missed'}${c.distanceMm === null ? ' · est.' : ''}`
    case 'bull':
      if (c.hit) return `${t} ✓`
      if (c.detail === 'sb') return '25 (aimed Bull)'
      if (c.detail === 'db') return 'Bull (aimed 25)'
      // Around the bull, high/low and left/right mean nothing: the distance only
      return `Miss ${t}${c.estimated ? ' · est.' : c.edgeMm === null ? '' : ` · ${wholeMm(c.edgeMm)}`}`
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

/** A grade pill's label and classes (Coach-Leg: Great filled lime, the rest tinted). Tip is a note
 *  that leaves the grade alone, in the blue Info style. */
export const GRADE_PILL: Record<VisitGrade | 'tip', { label: string; cls: string }> = {
  great: { label: 'Great', cls: 'bg-accent text-accent-fg' },
  good: { label: 'Good', cls: 'bg-good/15 text-good' },
  ok: { label: 'OK', cls: 'bg-text-dim/15 text-text-dim' },
  weak: { label: 'Weak', cls: 'bg-gold/15 text-gold' },
  mistake: { label: 'Mistake', cls: 'bg-live/15 text-live' },
  tip: { label: 'Tip', cls: 'bg-ice/15 text-ice' },
}

/** The centre of a segment's bed in board units (y up), a single's outer bed; null off the board. */
export function bedCentre(name: string): { x: number; y: number } | null {
  const id = /^S\d/.test(name) ? `SO${name.slice(1)}` : name
  const aim = aimById(id)
  return aim ? { x: aim.x, y: aim.y } : null
}

const AIM_AT: Record<string, Aim> = Object.fromEntries(AIMS.map(a => [a.id, a]))
const aimById = (id: string): Aim | undefined => AIM_AT[id]
/** An aim's point (AIMS id) in board units; null for an unknown id */
export const aimPoint = (aimId: string): { x: number; y: number } | null => {
  const a = aimById(aimId)
  return a ? { x: a.x, y: a.y } : null
}
const WHOLE_TURN = 2 * Math.PI

/** The bed an aim (AIMS id) sits in: a wire's is the two outer-single halves either side of it,
 *  the bulls' a whole ring. */
export function aimBed(aimId: string): BedRing | null {
  const aim = aimById(aimId)
  if (!aim) return null
  const [r0, r1] = AIM_RINGS[aimKind(aimId)]
  if (aim.numbers[0] === 25) return { r0, r1, from: 0, to: WHOLE_TURN }
  const a = Math.atan2(aim.y, aim.x)
  return { r0, r1, from: a - HALF, to: a + HALF }
}

/** A labelled spot on the board, in board units */
export type BoardTag = { label: string; x: number; y: number }
/** Where an Outside tag sits: past the numbers ring */
const OUTSIDE_R = 1.2

/** Where a dart at an aim (AIMS id) most likely lands instead: a treble's own single and its
 *  neighbours', a double's inside single and outside, a single's neighbours, the other bull, a
 *  wire's two numbers. */
export function likelyMisses(aimId: string): BoardTag[] {
  const aim = aimById(aimId)
  if (!aim) return []
  const tag = (label: string, id: string): BoardTag => ({ label, x: AIM_AT[id].x, y: AIM_AT[id].y })
  const kind = aimKind(aimId)
  if (kind === 'Bull') return [tag('25', '25')]
  if (kind === '25') return [tag('Bull', 'Bull')]
  if (kind === 'W') return aim.numbers.map(n => tag(`S${n}`, `SO${n}`))
  const n = aim.numbers[0]
  const i = SEGS.indexOf(n)
  const neighbours = (ring: 'SO' | 'SI') => [SEGS[(i + 19) % 20], SEGS[(i + 1) % 20]].map(m => tag(`S${m}`, `${ring}${m}`))
  if (kind === 'T') return [tag(`S${n}`, `SO${n}`), ...neighbours('SO')]
  if (kind === 'D') {
    const r = Math.hypot(aim.x, aim.y)
    return [tag(`S${n}`, `SO${n}`), { label: 'Outside', x: (aim.x / r) * OUTSIDE_R, y: (aim.y / r) * OUTSIDE_R }]
  }
  return neighbours(kind === 'SI' ? 'SI' : 'SO')
}

// The leg review (Coach-Leg)

/** "Leg 3 vs Lena", "Leg 1 · Solo"; `leg` is 0-based */
export const legHeading = (leg: number, opponents: readonly string[]): string =>
  `Leg ${leg + 1}${opponents.length ? ` ${vsLine(opponents)}` : ' · Solo'}`

/** The leg's context without its "· leg N" (the heading has it): "501 · Friday darts", "Ranked 1v1" */
const contextHead = (context: string) => context.replace(/ · leg \d+$/, '')
/** "today 21:14", "yesterday", "Mon", "2 Nov" */
const legWhenLower = (iso: string, now: Date) => legWhen(iso, now).replace(/^(Today|Yesterday)/, s => s.toLowerCase())

/** Desktop: "501 · double out · Friday darts · today 21:14 · lost, Lena checked out in 21 darts" */
export function legSubtitle(title: CoachLegTitle, darts: number, now: Date): string {
  const [first, ...rest] = contextHead(title.context).split(' · ')
  const result = title.won
    ? `won in ${darts} darts`
    : title.winnerName === null
      ? 'no checkout'
      : `lost, ${title.winnerName} checked out${title.winnerDarts === null ? '' : ` in ${title.winnerDarts} darts`}`
  // Every coached leg is double out: coachable() takes no other out mode
  return [first, 'double out', ...rest, legWhenLower(title.finishedAt, now), result].join(' · ')
}

/** Phone: "501 · today 21:14 · lost · 21 darts · avg 71.0" (the context's first part only); "no
 *  checkout" when nobody checked out */
export function legSubtitleShort(title: CoachLegTitle, darts: number, average: number | null, now: Date): string {
  const parts = [
    contextHead(title.context).split(' · ')[0],
    legWhenLower(title.finishedAt, now),
    title.won ? 'won' : title.winnerName === null ? 'no checkout' : 'lost',
    `${darts} darts`,
  ]
  return [...parts, ...(average === null ? [] : [`avg ${average.toFixed(1)}`])].join(' · ')
}

/** The visit the page opens on (an index): the first Mistake, else the first with a note, else the first. */
export function defaultVisit(visits: readonly Pick<ReviewVisit, 'grade' | 'notes'>[]): number {
  const i = visits.findIndex(v => v.grade === 'mistake')
  return Math.max(i >= 0 ? i : visits.findIndex(v => v.notes.length > 0), 0)
}

/** "S19 (76 left), T20 (16 left), S1 (15 left)."; the busting dart "T8 bust", a dart the game kept
 *  after it "S5 (not counted)", a checkout "D4 out" */
export function whatHappened(v: Pick<ReviewVisit, 'darts'>): string {
  const bustAt = v.darts.findIndex(d => d.bust)
  const parts = v.darts.map((d, i) =>
    d.bust
      ? `${d.name} bust`
      : bustAt >= 0 && i > bustAt
        ? `${d.name} (not counted)`
        : d.left === 0
          ? `${d.name} out`
          : `${d.name} (${d.left} left)`,
  )
  return `${parts.join(', ')}.`
}

/** What a dart in `label` (a likelyMisses tag: S8, Bull, 25, Outside) leaves from `left`, with its
 *  one-dart finish: "8 = D4"; null when that's no one-dart finish or the miss scores nothing. */
export function missLeaves(left: number, label: string): string | null {
  const points = label === 'Bull' ? 50 : label === '25' ? 25 : /^S\d+$/.test(label) ? Number(label.slice(1)) : 0
  const after = left - points
  const out = points > 0 && after >= 2 ? checkoutHint(after, 'double', 1) : null
  return out ? `${after} = ${out[0]}` : null
}

/** The better aim's likely misses as board tags, those leaving a finish with it: "S8 · 8 = D4" */
export const missTags = (note: Pick<CoachNote, 'left' | 'betterAimId'>): BoardTag[] =>
  likelyMisses(note.betterAimId).map(m => {
    const leaves = missLeaves(note.left, m.label)
    return leaves ? { ...m, label: `${m.label} · ${leaves}` } : m
  })

/** What follows "Better:" or "Tip:": "with 16 left and 1 dart, throw at D8 (blue). A miss into S8
 *  still leaves 8 = D4." */
export function betterLine(note: Pick<CoachNote, 'left' | 'darts' | 'better' | 'betterAimId'>): string {
  const misses = likelyMisses(note.betterAimId).flatMap(m => {
    const leaves = missLeaves(note.left, m.label)
    return leaves ? [` A miss into ${m.label} still leaves ${leaves}.`] : []
  })
  const darts = `${note.darts} dart${note.darts === 1 ? '' : 's'}`
  return `with ${note.left} left and ${darts}, throw at ${note.better} (blue).${misses.join('')}`
}
