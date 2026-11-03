import { describe, it, expect } from 'vitest'
import { R, segmentAt, SEGS, segAngle } from '../board.js'
import { AIM_RINGS, AIMS, aimKind } from './aims.js'
import { classifyDart, finishCandidates, fromBed, NOT_COUNTED } from './dartClass.js'
import { evaluator } from './model.js'
import { dart, leg, visit } from './testLegs.js'
import { throwsOf, type CoachDart, type Throw } from './walk.js'

/** A dart with camera coords, its segment read off the board like the game does. */
const at = (x: number, y: number): CoachDart => {
  const { name, number, multiplier } = segmentAt(x, y)
  return { segment: { name, number, multiplier }, coords: { x, y } }
}
/** A dart `deg` degrees clockwise of number `n`'s centre line, at radius `r`. */
const polar = (n: number, r: number, deg = 0): CoachDart => {
  const a = segAngle(SEGS.indexOf(n)) - (deg * Math.PI) / 180
  return at(r * Math.cos(a), r * Math.sin(a))
}
const aim = (id: string) => AIMS.find(a => a.id === id) ?? AIMS[0]

/** One dart thrown with `left` to go (and `darts` in hand), in a visit that started on `start`. */
function classify(d: CoachDart, left: number, darts = 3, start = left) {
  const after = left - d.segment.number * d.segment.multiplier
  const checkout = after === 0 && (d.segment.multiplier === 2 || d.segment.number === 50)
  const t: Throw = {
    leg: 0,
    visit: 0,
    dart: 3 - darts,
    start,
    left,
    darts,
    d,
    visitDarts: [d],
    checkout,
    bust: !checkout && after < 2,
    w: 1,
    opponentOnOut: false,
  }
  return classifyDart(t, { evaluation: left > 170 ? null : evaluator(start, 1)(left, darts) })
}

/** The walked throws of one visit, each classified with the visit's shared evaluator. */
function visitClasses(start: number, names: string[]) {
  const throws = throwsOf([leg([visit(0, start, names)])], 0, 501)
  const evaluate = evaluator(start, 1)
  return throws.map(t => classifyDart(t, { evaluation: evaluate(t.left, t.darts) }))
}

describe('classifyDart: Scoring (more than 170 left)', () => {
  it('a treble 20 is a scoring hit', () => {
    const c = classify(dart('T20'), 501)
    expect(c).toMatchObject({ kind: 'scoringHit', hit: true, target: { aimId: 'T20', label: 'T20' }, estimated: true })
    expect(c.distanceMm).toBe(0)
  })

  it('a single 20 in the inner bed is a scoring single, inner', () => {
    expect(classify(polar(20, 0.5), 501)).toMatchObject({ kind: 'scoringSingle', hit: false, detail: 'inner', target: { aimId: 'T20' } })
  })

  it('S5 next to T20 is a miss of T20, one wedge anticlockwise', () => {
    const c = classify(polar(5, 0.55, 8), 501)
    expect(c).toMatchObject({ kind: 'scoringMiss', target: { aimId: 'T20' }, wedgesOff: -1, estimated: false })
    expect(c.tangentialMm).toBeLessThan(0)
  })

  it('S12 is a miss of T20, two wedges anticlockwise', () => {
    expect(classify(polar(12, 0.7), 501)).toMatchObject({ kind: 'scoringMiss', target: { aimId: 'T20' }, wedgesOff: -2 })
    expect(classify(dart('S12'), 501)).toMatchObject({ kind: 'scoringMiss', target: { aimId: 'T20' }, wedgesOff: -2, estimated: true })
  })

  it('S1 without coords goes with T20, not T18: at the same distance T20 has the higher prior', () => {
    expect(classify(dart('S1'), 501)).toMatchObject({ kind: 'scoringMiss', target: { aimId: 'T20' }, wedgesOff: 1 })
  })

  it('a dart more than two wedges from every scoring treble is wild', () => {
    expect(classify(polar(6, 0.7), 501)).toMatchObject({ kind: 'wild', target: null, distanceMm: null })
  })

  it('a dart in the Bull or 25 was thrown at a bull aim', () => {
    expect(classify(at(0, 0), 501)).toMatchObject({ kind: 'bull', hit: true, target: { aimId: 'Bull' } })
    expect(classify(dart('Bull'), 501)).toMatchObject({ kind: 'bull', hit: true, target: { aimId: 'Bull' } })
    expect(classify(dart('25'), 501)).toMatchObject({ kind: 'bull', hit: true, target: { aimId: '25' } })
    // The 25 below the Bull is nearer the Bull than the 25's aim point (above it)
    expect(classify(at(0, -0.06), 501)).toMatchObject({ kind: 'bull', hit: false, detail: 'sb', target: { aimId: 'Bull' } })
  })

  it('a typed miss without a position is wild', () => {
    expect(classify(dart('Miss'), 501)).toMatchObject({ kind: 'wild', target: null, estimated: true })
  })
})

describe('classifyDart: miss properties', () => {
  // Just clockwise of and below the T20's centre, (0, 0.6055): right of it on screen, nearer the bull
  const c = classify(at(0.03, 0.58), 501)

  it('pins the signs: radial − is low, tangential + is clockwise (towards the 1)', () => {
    expect(c.target?.aimId).toBe('T20')
    expect(c.radialMm).toBeCloseTo((Math.hypot(0.03, 0.58) - 0.6055) * 170, 6)
    expect(c.radialMm).toBeLessThan(0)
    expect(c.tangentialMm).toBeGreaterThan(0)
    expect(c.tangentialMm).toBeCloseTo(0.6055 * (Math.PI / 2 - Math.atan2(0.58, 0.03)) * 170, 6)
  })

  it('distanceMm is the distance to the aim point × 170', () => {
    const t20 = aim('T20')
    expect(c.distanceMm).toBeCloseTo(Math.hypot(0.03 - t20.x, 0.58 - t20.y) * 170, 6)
  })

  it('a dart high and anticlockwise has radial + and tangential −', () => {
    const high = classify(at(-0.03, 0.62), 501)
    expect(high.target?.aimId).toBe('T20')
    expect(high.radialMm).toBeGreaterThan(0)
    expect(high.tangentialMm).toBeLessThan(0)
  })
})

describe('classifyDart: the miss to the edge of the bed', () => {
  it('a dart in the bed is 0 from it', () => {
    expect(classify(at(0.03, 0.6), 501)).toMatchObject({ target: { aimId: 'T20' }, edgeMm: 0, edgeRadialMm: 0, edgeTangentialMm: 0 })
  })

  it('a dart just under the treble is that far inside it, straight in', () => {
    const c = classify(polar(20, R.si - 0.005), 501)
    expect(c.edgeMm).toBeCloseTo(0.85, 6)
    expect(c.edgeRadialMm).toBeCloseTo(-0.85, 6)
    expect(c.edgeTangentialMm).toBe(0)
  })

  it('a dart just past the treble wire, sideways, is about 1 mm off, not the 17 mm to its middle', () => {
    const c = classify(polar(20, (R.si + R.tr) / 2, 9.35), 501)
    expect(c).toMatchObject({ kind: 'scoringMiss', target: { aimId: 'T20' } })
    expect(c.distanceMm).toBeGreaterThan(16)
    expect(c.edgeMm).toBeCloseTo(0.6055 * Math.sin((0.35 * Math.PI) / 180) * 170, 6)
    expect(c.edgeTangentialMm).toBeGreaterThan(0)
    expect(c.edgeRadialMm).toBeCloseTo(0, 9)
  })

  it('past a corner of the bed, the miss is to the corner', () => {
    const p = polar(20, R.si - 0.01, 12)
    const c = classify(p, 501)
    const a = segAngle(0) - Math.PI / 20
    const corner = { x: R.si * Math.cos(a), y: R.si * Math.sin(a) }
    expect(c.edgeMm).toBeCloseTo(Math.hypot(p.coords!.x - corner.x, p.coords!.y - corner.y) * 170, 6)
    expect(c.edgeRadialMm).toBeLessThan(0)
    expect(c.edgeTangentialMm).toBeGreaterThan(0)
  })

  it('the 25 is its distance past the Bull wire from the Bull', () => {
    const c = classify(at(0, -0.06), 501)
    expect(c.edgeMm).toBeCloseTo((0.06 - R.bull50) * 170, 6)
    expect(c.edgeRadialMm).toBeCloseTo((0.06 - R.bull50) * 170, 6)
  })

  it('matches the nearest of densely sampled bed points', () => {
    const sample = (id: string) => {
      const a = aim(id)
      const [r0, r1] = AIM_RINGS[aimKind(id)]
      const c = Math.atan2(a.y, a.x)
      const span = a.numbers[0] === 25 ? Math.PI : Math.PI / 20
      const pts: { x: number; y: number }[] = []
      for (let i = 0; i <= 60; i++)
        for (let j = 0; j <= 60; j++) {
          const r = r0 + ((r1 - r0) * i) / 60
          const t = c - span + (2 * span * j) / 60
          pts.push({ x: r * Math.cos(t), y: r * Math.sin(t) })
        }
      return pts
    }
    let seed = 7
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
    for (const id of ['T20', 'D3', 'SO11', 'SI6', 'Bull', '25']) {
      const pts = sample(id)
      for (let k = 0; k < 40; k++) {
        const p = { x: rand(), y: rand() }
        const e = fromBed(aim(id), p)!
        const brute = Math.min(...pts.map(q => Math.hypot(p.x - q.x, p.y - q.y)))
        // The grid's spacing bounds its error
        expect(Math.hypot(e.radial, e.tangential), `${id} ${JSON.stringify(p)}`).toBeCloseTo(brute, 2)
        expect(Math.hypot(e.radial, e.tangential)).toBeLessThanOrEqual(brute + 1e-9)
      }
    }
  })

  it('a wire has no bed', () => {
    expect(fromBed(aim('W20-1'), { x: 0, y: 0.5 })).toBeNull()
  })
})

describe('classifyDart: Finish', () => {
  it('a dart near the centre on 50 is a Bull attempt', () => {
    expect(classify(at(0.01, 0.02), 50)).toMatchObject({
      kind: 'bull',
      hit: true,
      target: { aimId: 'Bull' },
      plannedLeave: 0,
      actualLeave: 0,
    })
    expect(classify(at(0.03, 0.06), 50)).toMatchObject({
      kind: 'bull',
      hit: false,
      detail: 'sb',
      target: { aimId: 'Bull' },
      actualLeave: 25,
    })
  })

  it('on 50, an inner single near the bull is a Bull attempt miss; an outer single is a route at its own bed', () => {
    expect(classify(at(0, 0.12), 50)).toMatchObject({ kind: 'bull', hit: false, target: { aimId: 'Bull' }, actualLeave: 30 })
    // The 3's outer single: outside the inner singles, so not the Bull; its own bed is a candidate
    expect(classify(polar(3, (R.tr + R.so) / 2), 50)).toMatchObject({
      kind: 'route',
      hit: true,
      target: { aimId: 'SO3' },
      plannedLeave: 47,
    })
  })

  it('the table first darts and T16 keep the prior floor inside the top 5 too (100, 2 darts)', () => {
    const v = evaluator(100, 1)(100, 2)
    const t16 = finishCandidates(100, 2, v, null).find(c => AIMS[c.a].id === 'T16')
    expect(t16?.prior).toBeGreaterThanOrEqual(Math.exp(-3))
  })

  it('38 → S6 is a split hit leaving D16', () => {
    for (const d of [dart('S6'), at(aim('SO6').x, aim('SO6').y)])
      expect(classify(d, 38)).toMatchObject({ kind: 'split', hit: true, target: { aimId: 'SO6' }, plannedLeave: 32, actualLeave: 32 })
  })

  it('38 → S13 next to the S6 is a split miss', () => {
    expect(classify(polar(13, 0.8, 8), 38)).toMatchObject({
      kind: 'split',
      hit: false,
      target: { aimId: 'SO6' },
      plannedLeave: 32,
      actualLeave: 25,
    })
  })

  it('D16 checked out is a double hit', () => {
    expect(classify(polar(16, 0.975), 32)).toMatchObject({ kind: 'double', hit: true, detail: null, plannedLeave: 0, actualLeave: 0 })
  })

  it('D16 inside: its single', () => {
    expect(classify(polar(16, 0.94), 32)).toMatchObject({
      kind: 'double',
      hit: false,
      detail: 'inside',
      target: { aimId: 'D16' },
      actualLeave: 16,
    })
  })

  it('D16 outside: off the board', () => {
    expect(classify(polar(16, 1.02), 32)).toMatchObject({
      kind: 'double',
      hit: false,
      detail: 'outside',
      target: { aimId: 'D16' },
      actualLeave: 32,
    })
  })

  it('D16 wide: the neighbour D7', () => {
    const c = classify(polar(16, 0.975, -9.2), 32)
    expect(c).toMatchObject({ kind: 'double', hit: false, detail: 'wide', target: { aimId: 'D16' }, wedgesOff: -1, actualLeave: 18 })
    expect(c.tangentialMm).toBeLessThan(0)
  })

  it('D16 wide by a whole wedge: the D7 centre, about 52 mm off, still has a target', () => {
    const c = classify(polar(7, 0.975), 32)
    expect(c).toMatchObject({ kind: 'double', hit: false, detail: 'wide', target: { aimId: 'D16' }, wedgesOff: -1 })
    expect(c.distanceMm).toBeCloseTo(0.9765 * 2 * Math.sin(Math.PI / 20) * 170, 0)
  })

  it('on a one-dart finish the only double is the finishing one: the D8 centre on 32 is D16 wide', () => {
    const c = classify(polar(8, 0.9765), 32)
    expect(c).toMatchObject({ kind: 'double', hit: false, detail: 'wide', target: { aimId: 'D16' }, wedgesOff: 1 })
    expect(c.distanceMm).toBeCloseTo(0.9765 * 2 * Math.sin(Math.PI / 20) * 170, 1)
  })

  it('a dart in the Bull or 25 has the bull aims only, on any finish', () => {
    for (const left of [50, 60, 75, 100, 170]) {
      const c = classify(at(0, 0), left)
      expect(c.kind, `${left}`).toBe('bull')
      expect(['Bull', '25'], `${left}`).toContain(c.target?.aimId)
    }
    expect(classify(at(0, 0), 50)).toMatchObject({ hit: true, target: { aimId: 'Bull' } })
    // On 60 the 25 (leaving 35) is the better bull aim: the Bull there reads as the 25's miss
    expect(classify(at(0, 0), 60)).toMatchObject({ hit: false, detail: 'db', target: { aimId: '25' } })
    for (const left of [32, 37, 60, 100]) expect(classify(dart('25'), left).kind, `${left}`).toBe('bull')
  })

  it('a dart outside the bull has no bull aim, except the Bull on 50', () => {
    // An inner single right next to the 25
    const d = at(0.12, 0)
    expect(classify(d, 50).target?.aimId).toBe('Bull')
    for (const left of [32, 75, 100]) expect(['Bull', '25']).not.toContain(classify(d, left).target?.aimId)
  })

  it('sweep 2–40: a dart at a neighbour double centre goes to the finishing double', () => {
    // A split single on the same number is a likelier target there: S2 leaves 32, S4 leaves 28
    const exceptions: Record<string, string> = { '34 D2': 'SO2', '36 D4': 'SO4' }
    for (let left = 2; left <= 40; left += 2) {
      const i = SEGS.indexOf(left / 2)
      for (const n of [SEGS[(i + 19) % 20], SEGS[(i + 1) % 20]]) {
        const { x, y } = aim(`D${n}`)
        expect(classify(at(x, y), left).target?.aimId, `${left} D${n}`).toBe(exceptions[`${left} D${n}`] ?? `D${left / 2}`)
      }
    }
  })

  it('a route shot on 100: T20 hit and missed', () => {
    expect(classify(dart('T20'), 100)).toMatchObject({
      kind: 'route',
      hit: true,
      target: { aimId: 'T20' },
      plannedLeave: 40,
      actualLeave: 40,
    })
    expect(classify(polar(20, 0.5), 100)).toMatchObject({
      kind: 'route',
      hit: false,
      target: { aimId: 'T20' },
      plannedLeave: 40,
      actualLeave: 80,
    })
  })

  it('a dart far from every good aim goes to its own bed', () => {
    expect(classify(polar(3, 0.4), 32)).toMatchObject({ kind: 'route', hit: true, target: { aimId: 'SI3' }, plannedLeave: 29 })
  })

  it('a typed miss is outside the double on a one-dart finish, a miss of the Bull on 50, else wild', () => {
    expect(classify(dart('Miss'), 32)).toMatchObject({
      kind: 'double',
      hit: false,
      detail: 'outside',
      target: { aimId: 'D16' },
      estimated: true,
      distanceMm: null,
      actualLeave: 32,
    })
    expect(classify(dart('Miss'), 50)).toMatchObject({
      kind: 'bull',
      hit: false,
      detail: null,
      target: { aimId: 'Bull' },
      distanceMm: null,
    })
    expect(classify(dart('Miss'), 37)).toMatchObject({ kind: 'wild', target: null })
  })

  it('no Bust-back on a one-dart finish, even when going back is worth more: 32 → S16, S10, S20 busting on 6', () => {
    const v = evaluator(32, 1)(6, 1)
    const back = v.outcomes(AIMS.findIndex(a => a.id === 'T20')).find(o => o.after === 'bust')?.value ?? 0
    expect(back).toBeGreaterThan(Math.max(...v.values.filter((_, a) => v.outcomes(a).every(o => o.after !== 'bust'))))
    const [, , c] = visitClasses(32, ['S16', 'S10', 'S20'])
    expect(c.kind).toBe('bust')
  })

  it("the aims on the dart's own number are candidates: S20 on 57, S1 on 47, T10 on 77 hit their beds", () => {
    expect(classify(dart('S20'), 57, 1)).toMatchObject({ kind: 'route', hit: true, target: { aimId: 'SO20' }, actualLeave: 37 })
    expect(classify(dart('S1'), 47, 2)).toMatchObject({ kind: 'route', hit: true, target: { aimId: 'SO1' }, actualLeave: 46 })
    expect(classify(dart('T10'), 77)).toMatchObject({ kind: 'route', hit: true, target: { aimId: 'T10' }, actualLeave: 47 })
  })

  it('on 40, a dart about a wedge off the D20 is its miss; one in the inner single 1 aims there', () => {
    expect(classify(at(aim('SO1').x, aim('SO1').y), 40)).toMatchObject({
      kind: 'double',
      detail: 'wide',
      target: { aimId: 'D20' },
      wedgesOff: 1,
    })
    expect(classify(dart('S1'), 40)).toMatchObject({ kind: 'double', detail: 'wide', target: { aimId: 'D20' } })
    expect(classify(at(aim('SI1').x, aim('SI1').y), 40)).toMatchObject({ kind: 'route', hit: true, target: { aimId: 'SI1' } })
  })

  it('a split leaves a one-dart finish; a single on a one-dart finish that leaves none is a route', () => {
    expect(classify(dart('S20'), 32)).toMatchObject({ kind: 'split', target: { aimId: 'SO20' }, plannedLeave: 12 })
    expect(classify(dart('S3'), 32)).toMatchObject({ kind: 'route', plannedLeave: 29 })
  })

  it('on a one-dart finish, an aim that likeliest busts is no candidate: S7 on 10 is a route, not a Bust-back', () => {
    const [, b] = visitClasses(20, ['S10', 'S7'])
    expect(b).toMatchObject({ kind: 'route', hit: true, target: { aimId: 'SO7' }, plannedLeave: 3, actualLeave: 3 })
  })

  it('when busting back is best, every aim that busts is a candidate at prior 1: T20 busting on 3 aimed at T20', () => {
    const [, , c] = visitClasses(20, ['S10', 'S7', 'T20'])
    expect(c).toMatchObject({ kind: 'bustBack', hit: true, target: { aimId: 'T20' }, plannedLeave: 20, actualLeave: 20 })
    const busts = finishCandidates(3, 1, evaluator(20, 1)(3, 1), null).filter(x => x.prior === 1)
    expect(busts.map(x => AIMS[x.a].id)).toEqual(expect.arrayContaining(['T20', 'D20', 'SO20', 'T5']))
  })

  it('20 → S10, S7, bust is a Bust-back: back on 20 beats S1 leaving 2', () => {
    const [a, , c] = visitClasses(20, ['S10', 'S7', 'S20'])
    // Without coords the S10 sits at its bed's centre, nearest the D10
    expect(a).toMatchObject({ kind: 'double', detail: 'inside', target: { aimId: 'D10' }, estimated: true })
    expect(c).toMatchObject({ kind: 'bustBack', hit: true, plannedLeave: 20, actualLeave: 20 })
  })

  it('a bust that throws away a good finish is a Bust', () => {
    const [, b] = visitClasses(32, ['S20', 'S13'])
    expect(b).toMatchObject({ kind: 'bust', hit: false, plannedLeave: null, actualLeave: null })
  })

  it('a dart aimed to bust that did not is a Bust-back miss (13 left, last dart, at T20, lands in T1)', () => {
    const c = classify(polar(1, 0.6055, 10 - 18), 13, 1, 32)
    expect(c).toMatchObject({ kind: 'bustBack', hit: false, target: { aimId: 'T20' }, plannedLeave: 32, actualLeave: 10 })
  })
})

describe('classifyDart: not counted', () => {
  it('the walk drops darts after a bust; the caller marks them NOT_COUNTED', () => {
    expect(visitClasses(32, ['S20', 'S13', 'S5'])).toHaveLength(2)
    expect(NOT_COUNTED).toMatchObject({ kind: 'notCounted', hit: false, target: null })
  })
})
