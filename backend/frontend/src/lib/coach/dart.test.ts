import { describe, it, expect } from 'vitest'
import { bedAim } from '$shared/coach/aims'
import { NOT_COUNTED, type DartClass } from '$shared/coach/dartClass'
import { coachOpenVisit } from '$shared/coach/openVisit'
import { REF } from '$shared/coach/testLegs'
import type { CoachDart } from '$shared/coach/walk'
import { dartAt, dartFromLabel } from './sandbox'
import { dartLabel, dartRows, dartTone, visitTiles } from './dart'

describe('visitTiles', () => {
  const d = (name: string, left: number) => ({
    name,
    bedAimId: bedAim(name)?.id ?? null,
    coords: null,
    left,
    bust: false,
    class: NOT_COUNTED,
    delta: null,
    closeness: null,
  })
  it('without a grade (Scoring): greens trebles and doubles, leaves singles plain, dashes a miss', () => {
    expect(visitTiles({ darts: [d('T20', 120), d('S5', 115), d('Miss', 115)] }).map(t => [t.tone, t.offBoard, t.word])).toEqual([
      ['good', false, null],
      ['plain', false, null],
      ['miss', true, null],
    ])
  })

  // On 20 left with the third dart (60: S20, S20; the user's examples), the dart's tone and its word
  const tile = (d: CoachDart) => visitTiles(coachOpenVisit({ start: 60, opponent: null, average: 60 }, [S20, S20, d], REF, 5).visit!)[2]
  const S20 = dartFromLabel('S20')!
  it('a miss 10 mm outside D10 is a slight loss, not costly', () => {
    expect(tile(dartAt({ x: 1.008, y: -0.3276 }))).toMatchObject({ name: 'M10', tone: 'weak', offBoard: true, word: 'slight loss' })
  })
  it('S15 leaving 5 and a D15 bust are costly; D10 is good', () => {
    expect(tile(dartFromLabel('S15')!)).toMatchObject({ tone: 'costly', word: 'costly' })
    expect(tile(dartFromLabel('D15')!)).toMatchObject({ tone: 'costly', word: 'costly' })
    expect(tile(dartFromLabel('D10')!)).toMatchObject({ tone: 'good', word: 'good' })
  })
  it('grades by the thresholds', () => {
    const g = (delta: number, closeness: number | null = null) => dartTone({ ...d('S1', 0), delta, closeness })
    expect([g(5), g(4.9), g(-4.9), g(-5), g(-10, 4.9), g(-15), g(-20, 18)]).toEqual([
      'good',
      'plain',
      'plain',
      'weak',
      'weak',
      'costly',
      'plain',
    ])
  })
})

describe('dartRows', () => {
  it("gives a miss's distance to the bed, marks one within 5 mm a near miss, a hit and a typed dart none", () => {
    // On 20: two misses outside D10, then D10
    const v = coachOpenVisit(
      { start: 20, opponent: null, average: 60 },
      [dartAt({ x: 0.965, y: -0.3137 }), dartAt({ x: 1.008, y: -0.3276 }), dartFromLabel('D10')!],
      REF,
      5,
    ).visit!
    expect(dartRows(v).map(r => [r.name, r.distance, r.near])).toEqual([
      ['M10', '3 mm', true],
      ['M10', '10 mm', false],
      ['D10', '–', false],
    ])
  })
})

describe('dartLabel', () => {
  const cls = (c: Partial<DartClass>) => ({ ...NOT_COUNTED, ...c }) as DartClass
  const at = (label: string, aimId = label) => ({ target: { aimId, label } })
  /** The miss from the edge of the target's bed, the labels' numbers */
  const off = (edgeMm: number, edgeRadialMm: number, edgeTangentialMm: number) => ({
    miss: { mm: edgeMm + 10, radialMm: 0, tangentialMm: 0, edgeMm, edgeRadialMm, edgeTangentialMm, wedgesOff: null },
  })

  it.each<[string, Partial<DartClass>, string]>([
    ['a treble hit', { kind: 'scoringHit', hit: true, ...at('T20'), ...off(2, 1, 1) }, 'T20 ✓'],
    ['a single on scoring', { kind: 'scoringSingle', ...at('T20'), detail: 'outer', ...off(20, 18, 4) }, 'Single 20'],
    ['a scoring miss, low and left', { kind: 'scoringMiss', ...at('T20'), ...off(14, -10, -9) }, 'Miss T20 · 14 mm inside, towards 5'],
    [
      'a scoring miss, the larger part first',
      { kind: 'scoringMiss', ...at('T19'), ...off(30, 5, 29) },
      'Miss T19 · 30 mm towards 7, outside',
    ],
    ['a miss on the lower half, clockwise', { kind: 'scoringMiss', ...at('T3'), ...off(20, -6, 19) }, 'Miss T3 · 20 mm towards 19, inside'],
    ['a miss on the lower half, anticlockwise', { kind: 'route', ...at('T3'), ...off(20, 15, -12) }, 'Miss T3 · 20 mm outside, towards 17'],
    ['a miss of the 5 wrapping to the 20', { kind: 'scoringMiss', ...at('T5'), ...off(18, 0, 18) }, 'Miss T5 · 18 mm towards 20'],
    ['a miss of the 20 wrapping to the 5', { kind: 'scoringMiss', ...at('T20'), ...off(18, 0, -18) }, 'Miss T20 · 18 mm towards 5'],
    ['a miss of the 20, clockwise', { kind: 'scoringMiss', ...at('T20'), ...off(18, 0, 18) }, 'Miss T20 · 18 mm towards 1'],
    [
      "a wire miss names the wire's own numbers",
      { kind: 'route', ...at('20/1', 'W20-1'), ...off(25, 0, -25) },
      'Miss 20/1 · 25 mm towards 20',
    ],
    [
      'a scoring miss, parts of half a millimetre or less dropped',
      { kind: 'scoringMiss', ...at('T20'), ...off(22, 0.5, -22) },
      'Miss T20 · 22 mm towards 5',
    ],
    [
      'a miss just past the treble wire reads from the edge, not the 17 mm to its middle',
      {
        kind: 'scoringMiss',
        ...at('T20'),
        miss: { mm: 16.7, radialMm: 0, tangentialMm: 16.7, edgeMm: 0.6, edgeRadialMm: 0, edgeTangentialMm: 0.6, wedgesOff: null },
      },
      'Miss T20 · 1 mm towards 1',
    ],
    ['a small miss on both sides', { kind: 'scoringMiss', ...at('T20'), ...off(2.2, -1.4, 1.7) }, 'Miss T20 · 2 mm towards 1, inside'],
    [
      'a scoring miss without a camera position',
      { kind: 'scoringMiss', ...at('T20'), ...off(40, -40, 2), estimated: true },
      'Miss T20 · est.',
    ],
    ['a route hit', { kind: 'route', hit: true, ...at('S20', 'SO20'), plannedLeave: 40, actualLeave: 40 }, 'Aimed S20 ✓'],
    ['a route miss', { kind: 'route', ...at('T19'), ...off(12, 0, -12) }, 'Miss T19 · 12 mm towards 3'],
    ['a split hit', { kind: 'split', hit: true, ...at('S6', 'SO6'), plannedLeave: 32, actualLeave: 32 }, 'Split → D16 ✓'],
    ['a split miss', { kind: 'split', ...at('S6', 'SO6'), plannedLeave: 32, actualLeave: 25 }, 'Split → D16 ✗'],
    ['a split to the bull', { kind: 'split', hit: true, ...at('S10', 'SO10'), plannedLeave: 50, actualLeave: 50 }, 'Split → Bull ✓'],
    ['a double hit', { kind: 'double', hit: true, ...at('D16'), plannedLeave: 0, actualLeave: 0 }, 'D16 ✓'],
    ['a double inside', { kind: 'double', ...at('D16'), detail: 'inside', ...off(15, -15, 0) }, 'D16 inside'],
    ['a double outside', { kind: 'double', ...at('D16'), detail: 'outside', ...off(9, 9, 1) }, 'D16 outside'],
    ['a typed miss at a double', { kind: 'double', ...at('D16'), detail: 'outside', estimated: true }, 'D16 outside · est.'],
    ['a typed single at a double', { kind: 'double', ...at('D16'), detail: 'inside', ...off(15, -15, 0), estimated: true }, 'D16 inside'],
    ['a double wide', { kind: 'double', ...at('D16'), detail: 'wide', ...off(52, 0, 52) }, 'D16 wide · 52 mm towards 8'],
    [
      'a double wide and inside',
      { kind: 'double', ...at('D16'), detail: 'wide', ...off(50, -20, -45) },
      'D16 wide · 50 mm towards 7, inside',
    ],
    [
      'a double wide without a camera position',
      { kind: 'double', ...at('D16'), detail: 'wide', ...off(50, 0, 50), estimated: true },
      'D16 wide · est.',
    ],
    ['a bull hit', { kind: 'bull', hit: true, ...at('Bull') }, 'Bull ✓'],
    ['the 25 for the bull', { kind: 'bull', ...at('Bull'), detail: 'sb', ...off(11, 11, 0) }, '25 (aimed Bull)'],
    ['the bull for the 25', { kind: 'bull', ...at('25'), detail: 'db', ...off(11, -11, 0) }, 'Bull (aimed 25)'],
    ['a bull miss into a single', { kind: 'bull', ...at('Bull'), ...off(31.4, 31.4, 0) }, 'Miss Bull · 31 mm'],
    ['a bust-back that busted', { kind: 'bustBack', hit: true, plannedLeave: 57, actualLeave: 57 }, 'Bust-back ✓'],
    ["a bust-back that didn't", { kind: 'bustBack', ...at('T20'), plannedLeave: 57, actualLeave: 3 }, 'Bust-back missed'],
    ['a bust', { kind: 'bust', ...at('D16') }, 'Bust'],
    ['a wild dart', { kind: 'wild' }, 'Wild'],
    ['a dart after the bust', {}, 'Not counted'],
  ])('%s', (_, c, label) => {
    expect(dartLabel(cls(c))).toBe(label)
  })
})
