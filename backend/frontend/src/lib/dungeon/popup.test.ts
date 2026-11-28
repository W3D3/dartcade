import { describe, expect, it } from 'vitest'
import type { DungeonTrace, DungeonTraceStep } from '$lib/api/game-ws'
import { beatsOf, chipOf, fireLevel, fxOf, popupAt, rumble } from './popup'

const step = (s: Partial<DungeonTraceStep>): DungeonTraceStep => ({
  source: 'dart',
  id: null,
  effect: 'base_add',
  value: 0,
  base: 0,
  mult: 1,
  target: null,
  ...s,
})

// S19 with a +10 rune and the Brawler's x1.5 kills the slime (40 HP); T20 then hits the skeleton
const trace: DungeonTrace = {
  seat: 0,
  darts: [
    {
      number: 19,
      ring: 'single',
      target: 'slime',
      steps: [
        step({ value: 19, base: 19 }),
        step({ source: 'segment', id: 'whetstoneRune', value: 10, base: 29 }),
        step({ source: 'class', id: 'brawler', effect: 'mult_mul', value: 1.5, base: 29, mult: 1.5 }),
      ],
      damage: 43,
      hpBefore: 40,
      hpAfter: 0,
      killed: true,
    },
    {
      number: 20,
      ring: 'treble',
      target: 'skeleton',
      steps: [step({ value: 60, base: 60 })],
      damage: 60,
      hpBefore: 90,
      hpAfter: 30,
      killed: false,
    },
  ],
  afterVisit: [step({ source: 'afterVisit', id: 'spikedBuckler', effect: 'damage', value: 10, target: 'skeleton' })],
  total: 113,
  targetHp: 40,
  enemies: [
    { uid: 'slime', hpBefore: 40, hpAfter: 0 },
    { uid: 'skeleton', hpBefore: 90, hpAfter: 20 },
  ],
}

describe('beatsOf', () => {
  it('lands each dart, pops its steps (not the dart itself), lands its damage, then the after-visit steps and the end', () => {
    expect(beatsOf(trace).map(b => b.kind)).toEqual(['dart', 'step', 'step', 'damage', 'dart', 'damage', 'after', 'end'])
  })
})

describe('popupAt', () => {
  it('shows nothing before the first beat: every row empty, full HP, no total', () => {
    const p = popupAt(trace, 0)
    expect(p.rows.map(r => [r.label, r.base, r.damage])).toEqual([
      ['S19', null, null],
      ['T20', null, null],
    ])
    expect(p.hp).toEqual({ slime: 40, skeleton: 90 })
    expect(p).toMatchObject({ total: 0, done: false, fire: 0 })
  })

  it('moves Base and Mult with each chip, and only the damage beat hurts the enemy', () => {
    const p = popupAt(trace, 3)
    expect(p.rows[0]).toMatchObject({ base: 29, mult: 1.5, damage: null })
    expect(p.rows[0]?.chips).toHaveLength(2)
    expect(p.hp.slime).toBe(40)
    const hit = popupAt(trace, 4)
    expect(hit.rows[0]?.damage).toBe(43)
    expect(hit).toMatchObject({ total: 43, hits: { slime: [43] } })
    expect(hit.hp.slime).toBe(0)
  })

  it("ends on the trace's own total and HP", () => {
    const p = popupAt(trace, 99)
    expect(p).toMatchObject({ total: 113, done: true, fire: 3, hp: { slime: 0, skeleton: 20 } })
    expect(p.after).toHaveLength(1)
  })
})

describe('fireLevel', () => {
  it('burns past half, three quarters and all of the HP', () => {
    expect([49, 50, 74, 75, 99, 100].map(t => fireLevel(t, 100))).toEqual([0, 1, 1, 2, 2, 3])
    expect(fireLevel(10, 0)).toBe(0)
  })
})

describe('rumble', () => {
  it('rumbles only past the threshold, harder the further past', () => {
    expect([null, 100, 101, 201, 401].map(v => rumble(v, 100))).toEqual([0, 0, 1, 2, 3])
  })
})

describe('chipOf', () => {
  it('names the source and writes the change as the popup does', () => {
    expect(chipOf(step({ source: 'class', id: 'brawler', effect: 'mult_mul', value: 1.5 }))).toMatchObject({
      name: 'Brawler',
      change: '×1.5',
      unit: '',
    })
    expect(chipOf(step({ source: 'weakness', effect: 'mult_mul', value: 2 }))).toMatchObject({ name: 'Weak', change: '×2' })
    expect(chipOf(step({ source: 'artifact', id: 'spikedBuckler', effect: 'block', value: 10 }))).toMatchObject({
      change: '+10',
      unit: 'Block',
      artifact: 'spikedBuckler',
    })
  })
})

describe('fxOf', () => {
  it('hits the target on a damage beat, harder on a kill, and plays nothing for a plain Base or Mult chip', () => {
    const [, rune, , kill, , hit] = beatsOf(trace)
    expect(fxOf(kill, trace)).toEqual({ kind: 'crit', at: { enemy: 'slime' } })
    expect(fxOf(hit, trace)).toEqual({ kind: 'hit', at: { enemy: 'skeleton' } })
    expect(fxOf(rune, trace)).toBeNull()
    expect(fxOf({ kind: 'step', dart: 0, step: step({ source: 'artifact', effect: 'block', value: 5 }) }, trace)).toEqual({
      kind: 'block',
      at: { hero: 0 },
    })
  })
})
