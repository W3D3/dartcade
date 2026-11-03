// Which finished games the coach reviews; how the Coach page shows a leg; how its tiles, pills and
// board draw a visit.
import type { CoachLegRow, CoachLegTitle, GameSummary } from '$lib/api'
import type { BedRing } from '$lib/details/boardGeometry'
import { startOfDay } from '$lib/fmt'
import { formatWhen } from '$lib/history'
import { HALF, SEGS } from '$shared/board'
import { LEVEL_AVERAGE } from '$shared/botLevels'
import { checkoutHint } from '$shared/checkout.js'
import type { CoachNote, LegReview, ReviewDart, ReviewVisit, VisitGrade } from '$shared/coach'
import { dartGrade } from '$shared/coach/grade'
import { AIM_RINGS, AIMS, aimById, aimIndex, aimKind, aimPoints, directOutId } from '$shared/coach/aims'
import type { DartClass } from '$shared/coach/dartClass'
import { coachable as coachableGame } from '$shared/coach/coachable'
import type { Grouping, GroupingLevel } from '$shared/coach/grouping'

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

/** A dart's own grade (grade.ts dartGrade: its delta plus closeness credit, in checkout-chance
 *  points) on the visit scale: good from this (or a hit of its target)… */
export const DART_GOOD_FROM = 5
/** …plain above this, a slight loss down to and including it… */
export const DART_PLAIN_ABOVE = -5
/** …costly at or below this (and a bust) */
export const DART_COSTLY_AT = -15

/** How a dart tile looks (Coach-Leg). A graded dart (finish and setup visits) by its own grade:
 *  green good, plain, gold a slight loss, red costly. Without a grade (Scoring, after a bust) a
 *  treble, double or bull green, a single plain, a miss red-lettered. Off the board is dashed in
 *  every tone. */
export type DartTone = 'good' | 'plain' | 'weak' | 'costly' | 'miss'
/** `word`: the grade for screen readers, so colour isn't the only signal; null without a grade */
export type DartTileView = { name: string; tone: DartTone; offBoard: boolean; word: string | null; label: string }

const TONE_WORD: Record<DartTone, string> = { good: 'good', plain: 'even', weak: 'slight loss', costly: 'costly', miss: 'miss' }

/** Tone without a grade: a treble, double or bull good */
const GOOD_BEDS = new Set(['T', 'D', 'Bull'])

export function dartTone(d: Pick<ReviewDart, 'bedAimId' | 'bust' | 'class' | 'delta' | 'closeness'>): DartTone {
  if (d.delta === null) return d.bedAimId === null ? 'miss' : GOOD_BEDS.has(aimKind(d.bedAimId)) ? 'good' : 'plain'
  const g = dartGrade(d.delta, d.closeness)
  if (d.bust || g <= DART_COSTLY_AT) return 'costly'
  if (d.class.hit || g >= DART_GOOD_FROM) return 'good'
  return g > DART_PLAIN_ABOVE ? 'plain' : 'weak'
}

/** A visit's darts with their tones and class labels. */
export const visitTiles = (v: Pick<ReviewVisit, 'darts'>): DartTileView[] =>
  v.darts.map(d => {
    const tone = dartTone(d)
    return { name: d.name, tone, offBoard: d.bedAimId === null, word: d.delta === null ? null : TONE_WORD[tone], label: dartLabel(d.class) }
  })

/** A missed dart this close to its target's bed (mm, edgeMm) is a near miss: on a double, nearly a checkout */
export const NEAR_MISS_MM = 5

export type DartRow = { name: string; label: string; distance: string; near: boolean }

/** The selected visit's dart table (Coach-Leg): each dart's class label and its distance to the
 *  target's bed, "–" for a hit or a dart without a position. */
export const dartRows = (v: Pick<ReviewVisit, 'darts'>): DartRow[] =>
  v.darts.map(({ name, class: c }) => {
    const edge = c.hit ? null : (c.miss?.edgeMm ?? null)
    return { name, label: dartLabel(c), distance: edge === null ? '–' : wholeMm(edge), near: edge !== null && edge <= NEAR_MISS_MM }
  })

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
      return c.detail === 'wide' ? `${t} wide${miss()}` : `${t} ${c.detail ?? 'missed'}${c.miss === null ? ' · est.' : ''}`
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

/** A grade pill's label and classes (Coach-Leg: Great filled lime, the rest tinted; Perfect filled
 *  lime with a lime halo). Tip is a note that leaves the grade alone, in the blue Info style. */
export const GRADE_PILL: Record<VisitGrade | 'tip', { label: string; cls: string }> = {
  perfect: { label: 'Perfect', cls: 'bg-accent text-accent-fg ring-[3px] ring-accent/35' },
  great: { label: 'Great', cls: 'bg-accent text-accent-fg' },
  good: { label: 'Good', cls: 'bg-good/15 text-good' },
  ok: { label: 'OK', cls: 'bg-text-dim/15 text-text-dim' },
  weak: { label: 'Weak', cls: 'bg-gold/15 text-gold' },
  mistake: { label: 'Bad', cls: 'bg-live/15 text-live' },
  tip: { label: 'Tip', cls: 'bg-ice/15 text-ice' },
}

/** A grouping comment's pill classes, in the same tones as the grade pill: Great filled lime,
 *  Good tinted green, Scattered tinted gold (the weak tone). */
const GROUPING_CLS: Record<GroupingLevel, string> = {
  great: 'bg-accent text-accent-fg',
  good: 'bg-good/15 text-good',
  scattered: 'bg-gold/15 text-gold',
}

/** A visit's grouping comment as a pill's label and classes; null without one worth saying
 *  (groupingComment, shared/coach/grouping.ts, judged on the server against the player's average). */
export function groupingPill(g: Pick<Grouping, 'comment'> | null): { label: string; cls: string } | null {
  const c = g?.comment
  return c ? { label: c.text, cls: GROUPING_CLS[c.level] } : null
}

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
/** A likely miss: its tag and what a dart there scores (0 off the board) */
export type MissTag = BoardTag & { points: number }
/** Where an Outside tag sits: past the numbers ring */
const OUTSIDE_R = 1.2

/** Where a dart at an aim (AIMS id) most likely lands instead: a treble's own single and its
 *  neighbours', a double's inside single and outside, a single's neighbours, the other bull, a
 *  wire's two numbers. */
export function likelyMisses(aimId: string): MissTag[] {
  const aim = aimById(aimId)
  if (!aim) return []
  const tag = (label: string, id: string): MissTag => {
    const a = AIMS[aimIndex(id)]
    return { label, x: a.x, y: a.y, points: aimPoints(a)[0] }
  }
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
    return [tag(`S${n}`, `SO${n}`), { label: 'Outside', x: (aim.x / r) * OUTSIDE_R, y: (aim.y / r) * OUTSIDE_R, points: 0 }]
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

/** "Coached as a 46 average": the level whose model judged the leg (model.ts coachLevel) */
export const coachedAs = (level: number): string => `Coached as a ${LEVEL_AVERAGE[level - 1]} average`

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

/** Rounded checkout-chance points with their sign: "+12", "−25", "0" */
export function signedPoints(v: number): string {
  const n = Math.round(v)
  return n === 0 ? '0' : `${n > 0 ? '+' : '−'}${Math.abs(n)}`
}

/** "S20 −4 · T17 +11 · S18 +2 · near misses +3": each dart's change in checkout chance, then the
 *  near-miss credit when there is any; null on a Scoring visit */
export function valueLine(v: Pick<ReviewVisit, 'darts'>): string | null {
  const darts = v.darts.flatMap(d => (d.delta === null ? [] : [{ ...d, delta: d.delta }]))
  if (!darts.length) return null
  const close = Math.round(darts.reduce((s, d) => s + (d.closeness ?? 0), 0))
  return [...darts.map(d => `${d.name} ${signedPoints(d.delta)}`), ...(close > 0 ? [`near misses +${close}`] : [])].join(' · ')
}

/** "Grouping 6 mm (yours: ~9 mm) · 2 mm off T20 · edge 1 mm · rating 75": how the visit's placed
 *  darts sat together against the spread expected at the player's average, the spread and offset
 *  only when they shared a target, the rating only on a Scoring
 *  visit (the only grade it feeds); null without a grouping. */
export function groupingLine(v: Pick<ReviewVisit, 'darts' | 'grouping' | 'tag'>): string | null {
  const g = v.grouping
  if (!g) return null
  const target = v.darts.find(d => d.coords && d.class.target)?.class.target?.label
  return [
    g.spreadMm === null ? null : `Grouping ${Math.round(g.spreadMm)} mm (yours: ~${Math.round(g.expectedSpreadMm)} mm)`,
    g.offsetMm === null ? null : `${Math.round(g.offsetMm)} mm off ${target}`,
    `edge ${Math.round(g.edgeMm)} mm`,
    v.tag === 'scoring' ? `rating ${Math.round(g.rating)}` : null,
  ]
    .filter(p => p !== null)
    .join(' · ')
}

/** The scoring skill's grouping: " · grouping 12 mm · edge 4 mm", empty without a placed group */
export function legGroupingLine(g: LegReview['grouping']): string {
  return [
    g.spreadMm === null ? '' : ` · grouping ${Math.round(g.spreadMm)} mm`,
    g.edgeMm === null ? '' : ` · edge ${Math.round(g.edgeMm)} mm`,
  ].join('')
}

/** What a dart scoring `points` (a likelyMisses tag's) leaves from `left`, with its one-dart
 *  finish: "8 = D4"; null when that's no one-dart finish or the miss scores nothing. */
export function missLeaves(left: number, points: number): string | null {
  const after = left - points
  const out = points > 0 && after >= 2 ? checkoutHint(after, 'double', 1) : null
  return out ? `${after} = ${out[0]}` : null
}

/** The better aim's likely misses as board tags, those leaving a finish with it: "S8 · 8 = D4" */
export const missTags = (note: Pick<CoachNote, 'left' | 'betterAimId'>): BoardTag[] =>
  likelyMisses(note.betterAimId).map(({ points, ...m }) => {
    const leaves = missLeaves(note.left, points)
    return leaves ? { ...m, label: `${m.label} · ${leaves}` } : m
  })

/** What follows "Better:" or "Tip:": "with 16 left and 1 dart, throw at D8 (blue). A miss into S8
 *  still leaves 8 = D4." */
export function betterLine(note: Pick<CoachNote, 'left' | 'darts' | 'better' | 'betterAimId'>): string {
  const misses = likelyMisses(note.betterAimId).flatMap(m => {
    const leaves = missLeaves(note.left, m.points)
    return leaves ? [` A miss into ${m.label} still leaves ${leaves}.`] : []
  })
  const darts = `${note.darts} dart${note.darts === 1 ? '' : 's'}`
  return `with ${note.left} left and ${darts}, throw at ${note.better} (blue).${misses.join('')}`
}
