import { describe, it, expect } from 'vitest'
import { shanghaiMeta, roundLabel, rangeLabel, hitsTarget, missingKinds, kindsOf, visitText, targetLabel } from './view.js'
import { shanghaiRules } from '../gameViews/meta.js'
import { shanghaiSlots } from '../dartSlots.js'
import type { ShanghaiGame } from '../api/game-ws'

const game = (o: Partial<ShanghaiGame> = {}): ShanghaiGame =>
  ({
    cfg: { start: 1, end: 7, bullRound: false, shanghaiWins: true, tieBreak: 'bull' },
    phase: 'game',
    round: 3,
    rounds: 7,
    target: 3,
    currentPlayer: 0,
    nextPlayer: 1,
    winner: null,
    shanghai: null,
    hits: { single: false, double: false, treble: false },
    visitScore: 0,
    contenders: null,
    seats: [],
    bullOff: null,
    currentVisitDarts: [],
    totalDarts: [0, 0],
    totalVisits: [0, 0],
    ...o,
  }) as unknown as ShanghaiGame
const seg = (number: number, multiplier: number) => ({ segment: { number, multiplier } })

describe('labels', () => {
  it('names the round, the bull round and the sudden-death rounds', () => {
    expect(roundLabel(game())).toBe('Round 3 of 7')
    const bull = game({ cfg: { ...game().cfg, bullRound: true }, rounds: 8, round: 8, target: 25 })
    expect(roundLabel(bull)).toBe('Bull round')
    expect(roundLabel(game({ round: 9 }))).toBe('Sudden death 2')
  })
  it('the header line', () => {
    expect(shanghaiMeta(game(), 2)).toBe('2 players · 1–7 · Round 3 of 7')
    expect(rangeLabel({ start: 1, end: 20, bullRound: true })).toBe('1–20 + Bull')
  })
  it('the rules line', () => {
    expect(shanghaiRules({ start: 1, end: 7, bullRound: false, shanghaiWins: true })).toBe('1–7 · Shanghai wins')
    expect(shanghaiRules({ start: 3, end: 9, bullRound: true, shanghaiWins: false })).toBe('3–9 + Bull')
  })
  it('the bull is a bull', () => expect(targetLabel(25)).toBe('Bull'))
  it('a Shanghai visit reads as one, a scoreless one as a dash', () => {
    expect(visitText({ score: 18, shanghai: true })).toBe('Shanghai')
    expect(visitText({ score: 0, shanghai: false })).toBe('–')
    expect(visitText({ score: 5, shanghai: false })).toBe('5')
  })
})

describe('darts', () => {
  it('only the round number hits; the bull round takes 25 and 50', () => {
    expect(hitsTarget(seg(3, 3), 3)).toBe(true)
    expect(hitsTarget(seg(4, 1), 3)).toBe(false)
    expect(hitsTarget(seg(3, 0), 3)).toBe(false)
    expect(hitsTarget(seg(25, 1), 25)).toBe(true)
    expect(hitsTarget(seg(50, 2), 25)).toBe(true)
    expect(hitsTarget(seg(20, 1), 25)).toBe(false)
  })
  it('the bull has no treble', () => expect(kindsOf(25)).toEqual(['single', 'double']))
  it('what the visit still needs, treble first, only while three darts can make it', () => {
    expect(missingKinds(game())).toEqual(['treble', 'double', 'single'])
    expect(missingKinds(game({ target: 25 }))).toEqual([])
  })
  it('the slots show what was scored and suggest what is missing', () => {
    const slots = shanghaiSlots({ darts: [{ score: 3, segment: { name: 'S3' } }], hits: [true], target: 3, suggest: ['T3', 'D3'] })
    expect(slots.map(s => s.kind)).toEqual(['thrown', 'suggested-next', 'suggested-later'])
    expect(slots[0].points).toBe('+3')
    expect(slots[1].label).toBe('T3')
    const out = shanghaiSlots({
      darts: [{ score: 0, segment: { name: 'Miss' } }, { score: 0 }],
      hits: [false, false],
      target: 3,
      suggest: ['T3', 'D3', 'S3'],
    })
    expect(out.map(s => s.kind)).toEqual(['miss', 'miss', 'empty-next'])
  })
})
