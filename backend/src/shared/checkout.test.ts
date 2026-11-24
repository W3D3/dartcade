import { describe, it, expect } from 'vitest'
import { checkoutHint, canCheckOut } from './checkout.js'
import { CHECKOUTS } from './checkoutTable.js'

const scoreOf = (label: string): number => {
  if (label === 'Bull') return 50
  if (label === '25') return 25
  const mult = label[0] === 'T' ? 3 : label[0] === 'D' ? 2 : 1
  return mult * parseInt(label.slice(1), 10)
}

const total = (route: string[]) => route.reduce((a, l) => a + scoreOf(l), 0)
const finishesOnADouble = (route: string[]) => route.at(-1) === 'Bull' || route.at(-1)?.startsWith('D') === true

// The DolfDarts chart (https://dolfdarts.com/checkouts): the recommended route with three darts in
// hand for every score from 170 down to 2.
const CHART: Record<number, string> = {
  170: 'T20 T20 Bull',
  167: 'T20 T19 Bull',
  164: 'T20 T18 Bull',
  161: 'T20 T17 Bull',
  160: 'T20 T20 D20',
  158: 'T20 T20 D19',
  157: 'T20 T19 D20',
  156: 'T20 T20 D18',
  155: 'T20 T19 D19',
  154: 'T20 T18 D20',
  153: 'T20 T19 D18',
  152: 'T20 T20 D16',
  151: 'T20 T17 D20',
  150: 'T20 T18 D18',
  149: 'T20 T19 D16',
  148: 'T20 T20 D14',
  147: 'T20 T17 D18',
  146: 'T20 T18 D16',
  145: 'T20 T15 D20',
  144: 'T20 T20 D12',
  143: 'T20 T17 D16',
  142: 'T20 T14 D20',
  141: 'T20 T19 D12',
  140: 'T20 T20 D10',
  139: 'T19 T14 D20',
  138: 'T20 T18 D12',
  137: 'T20 T19 D10',
  136: 'T20 T20 D8',
  135: 'T20 T17 D12',
  134: 'T20 T14 D16',
  133: 'T20 T19 D8',
  132: 'T20 T16 D12',
  131: 'T20 T13 D16',
  130: 'T20 T20 D5',
  129: 'T19 T16 D12',
  128: 'T18 T14 D16',
  127: 'T20 T17 D8',
  126: 'T19 T19 D6',
  125: '25 T20 D20',
  124: 'T20 T16 D8',
  123: 'T19 T16 D9',
  122: 'T18 T18 D7',
  121: 'T20 T11 D14',
  120: 'T20 S20 D20',
  119: 'T19 T10 D16',
  118: 'T20 S18 D20',
  117: 'T20 S17 D20',
  116: 'T19 S19 D20',
  115: 'T20 S15 D20',
  114: 'T20 S14 D20',
  113: 'T19 S16 D20',
  112: 'T20 S12 D20',
  111: 'T20 S19 D16',
  110: 'T20 S18 D16',
  109: 'T19 S20 D16',
  108: 'T20 S16 D16',
  107: 'T19 S18 D16',
  106: 'T20 S14 D16',
  105: 'T19 S16 D16',
  104: 'T18 S18 D16',
  103: 'T20 S3 D20',
  102: 'T20 S10 D16',
  101: 'T20 S9 D16',
  100: 'T20 D20',
  99: 'T19 S10 D16',
  98: 'T20 D19',
  97: 'T19 D20',
  96: 'T20 D18',
  95: 'T19 D19',
  94: 'T18 D20',
  93: 'T19 D18',
  92: 'T20 D16',
  91: 'T17 D20',
  90: 'T20 D15',
  89: 'T19 D16',
  88: 'T20 D14',
  87: 'T17 D18',
  86: 'T18 D16',
  85: 'T15 D20',
  84: 'T20 D12',
  83: 'T17 D16',
  82: 'Bull D16',
  81: 'T19 D12',
  80: 'T20 D10',
  79: 'T19 D11',
  78: 'T18 D12',
  77: 'T19 D10',
  76: 'T20 D8',
  75: 'T17 D12',
  74: 'T14 D16',
  73: 'T19 D8',
  72: 'T16 D12',
  71: 'T13 D16',
  70: 'T10 D20',
  69: 'T19 D6',
  68: 'T20 D4',
  67: 'T17 D8',
  66: 'T10 D18',
  65: 'T19 D4',
  64: 'T16 D8',
  63: 'T13 D12',
  62: 'T10 D16',
  61: 'T15 D8',
  60: 'S20 D20',
  59: 'S19 D20',
  58: 'S18 D20',
  57: 'S17 D20',
  56: 'T16 D4',
  55: 'S15 D20',
  54: 'S14 D20',
  53: 'S13 D20',
  52: 'S12 D20',
  51: 'S11 D20',
  50: 'Bull',
  49: 'S9 D20',
  48: 'S16 D16',
  47: 'S7 D20',
  46: 'S6 D20',
  45: 'S13 D16',
  44: 'S12 D16',
  43: 'S3 D20',
  42: 'S10 D16',
  41: 'S9 D16',
  40: 'D20',
  39: 'S7 D16',
  38: 'D19',
  37: 'S5 D16',
  36: 'D18',
  35: 'S3 D16',
  34: 'D17',
  33: 'S1 D16',
  32: 'D16',
  31: 'S15 D8',
  30: 'D15',
  29: 'S13 D8',
  28: 'D14',
  27: 'S11 D8',
  26: 'D13',
  25: 'S9 D8',
  24: 'D12',
  23: 'S7 D8',
  22: 'D11',
  21: 'S5 D8',
  20: 'D10',
  19: 'S3 D8',
  18: 'D9',
  17: 'S1 D8',
  16: 'D8',
  15: 'S7 D4',
  14: 'D7',
  13: 'S5 D4',
  12: 'D6',
  11: 'S3 D4',
  10: 'D5',
  9: 'S1 D4',
  8: 'D4',
  7: 'S3 D2',
  6: 'D3',
  5: 'S1 D2',
  4: 'D2',
  3: 'S1 D1',
  2: 'D1',
}
const BOGEYS = [169, 168, 166, 165, 163, 162, 159]

// Every way to finish `left` on a double or the bull in at most `darts` darts
const BEDS = [
  ...Array.from({ length: 20 }, (_, i) => [`S${i + 1}`, i + 1] as const),
  ...Array.from({ length: 20 }, (_, i) => [`D${i + 1}`, 2 * (i + 1)] as const),
  ...Array.from({ length: 20 }, (_, i) => [`T${i + 1}`, 3 * (i + 1)] as const),
  ['25', 25] as const,
  ['Bull', 50] as const,
]
const FINISHES = new Map(BEDS.filter(([l]) => l[0] === 'D' || l === 'Bull').map(([l, v]) => [v, l]))
const fewestDarts = (left: number, darts = 3): number | null => {
  if (FINISHES.has(left)) return 1
  if (darts < 2) return null
  let best: number | null = null
  for (const [, v] of BEDS) {
    const rest = fewestDarts(left - v, darts - 1)
    if (left - v >= 2 && rest !== null && (best === null || rest + 1 < best)) best = rest + 1
  }
  return best
}

describe('the checkout chart', () => {
  it('follows the chart for all 169 finishable scores', () => {
    const ours = Object.fromEntries(Object.keys(CHART).map(n => [n, checkoutHint(Number(n))?.join(' ')]))
    expect(ours).toEqual(CHART)
    expect(Object.keys(CHART).length + BOGEYS.length).toBe(169)
  })

  it('has no checkout for the seven bogey numbers, and none above 170', () => {
    for (const n of [...BOGEYS, 171, 180]) expect(checkoutHint(n)).toBeNull()
  })

  it('every route adds up to its score, ends on a double and fits the darts left', () => {
    for (let score = 2; score <= 170; score++) {
      for (const darts of [1, 2, 3]) {
        const route = checkoutHint(score, 'double', darts)
        // Null exactly when the darts left can't finish it
        expect({ score, darts, found: route !== null }).toEqual({ score, darts, found: fewestDarts(score, darts) !== null })
        if (!route) continue
        expect(route.length).toBeLessThanOrEqual(darts)
        expect({ score, total: total(route) }).toEqual({ score, total: score })
        expect(finishesOnADouble(route)).toBe(true)
      }
    }
  })

  it('takes the fewest darts, bar the bull set-ups on 101 to 110', () => {
    const setUps = [101, 104, 107, 110]
    for (let score = 2; score <= 170; score++) {
      const route = checkoutHint(score)
      if (route && !setUps.includes(score)) expect({ score, darts: route.length }).toEqual({ score, darts: fewestDarts(score) })
    }
  })

  it('every alternative in the table is a valid finish of its score', () => {
    for (const [score, entry] of Object.entries(CHECKOUTS)) {
      for (const route of entry.routes) {
        expect({ score, route, total: total(route) }).toEqual({ score, route, total: Number(score) })
        expect(finishesOnADouble(route)).toBe(true)
        expect(route.length).toBeLessThanOrEqual(3)
      }
    }
  })

  it('covers every score from 41 to 170 that can be finished in three darts', () => {
    const missing = Array.from({ length: 130 }, (_, i) => 41 + i).filter(n => !(n in CHECKOUTS))
    expect(missing).toEqual([159, 162, 163, 165, 166, 168, 169])
  })
})

describe('checkoutHint, double out', () => {
  it('a single sets up the double where a middle treble is not needed (110 is T20 S18 D16)', () => {
    expect(checkoutHint(110)).toEqual(['T20', 'S18', 'D16'])
    expect(checkoutHint(107)).toEqual(['T19', 'S18', 'D16'])
    expect(checkoutHint(112)).toEqual(['T20', 'S12', 'D20'])
  })

  it("follows the pros' routes", () => {
    expect(checkoutHint(170)).toEqual(['T20', 'T20', 'Bull'])
    expect(checkoutHint(81)).toEqual(['T19', 'D12'])
    // "16/8, D16/D20" in the table: the first field
    expect(checkoutHint(108)).toEqual(['T20', 'S16', 'D16'])
    expect(checkoutHint(50)).toEqual(['Bull'])
    expect(checkoutHint(56)).toEqual(['T16', 'D4'])
  })

  it('with two darts left: the two-dart route', () => {
    expect(checkoutHint(110, 'double', 2)).toEqual(['T20', 'Bull'])
    expect(checkoutHint(70, 'double', 2)).toEqual(['T10', 'D20'])
    expect(checkoutHint(81, 'double', 2)).toEqual(['T19', 'D12'])
    expect(checkoutHint(120, 'double', 2)).toBeNull()
  })

  it('with one dart left: only a double (or the bull) that finishes', () => {
    expect(checkoutHint(50, 'double', 1)).toEqual(['Bull'])
    expect(checkoutHint(32, 'double', 1)).toEqual(['D16'])
    expect(checkoutHint(39, 'double', 1)).toBeNull()
    expect(checkoutHint(60, 'double', 1)).toBeNull()
  })

  it('40 and under: a double, or a single that leaves one, halving down from D16', () => {
    expect(checkoutHint(40)).toEqual(['D20'])
    expect(checkoutHint(39)).toEqual(['S7', 'D16'])
    expect(checkoutHint(21)).toEqual(['S5', 'D8'])
    expect(checkoutHint(3)).toEqual(['S1', 'D1'])
  })

  it("can't finish 1, a bogey number, or more than 170", () => {
    expect([checkoutHint(1), checkoutHint(159), checkoutHint(169), checkoutHint(171), checkoutHint(0)]).toEqual([
      null,
      null,
      null,
      null,
      null,
    ])
  })

  it('a favourite double picks the route ending on it, and is set up below 41', () => {
    expect(checkoutHint(52)).toEqual(['S12', 'D20'])
    expect(checkoutHint(52, 'double', 3, { favouriteDouble: 16 })).toEqual(['S20', 'D16'])
    expect(checkoutHint(85, 'double', 3, { favouriteDouble: 14 })).toEqual(['T19', 'D14'])
    // No route ends on it: the table's first
    expect(checkoutHint(170, 'double', 3, { favouriteDouble: 16 })).toEqual(['T20', 'T20', 'Bull'])
    expect(checkoutHint(39, 'double', 3, { favouriteDouble: 18 })).toEqual(['S3', 'D18'])
  })
})

describe('checkoutHint, straight and master out', () => {
  it('straight out: the easiest dart finishes (a single before a double before a triple)', () => {
    expect(checkoutHint(18, 'straight')).toEqual(['S18'])
    expect(checkoutHint(3, 'straight')).toEqual(['S3'])
    expect(checkoutHint(40, 'straight')).toEqual(['D20'])
    expect(checkoutHint(60, 'straight')).toEqual(['T20'])
  })
  it('master out: a double before a triple', () => {
    expect(checkoutHint(18, 'master')).toEqual(['D9'])
    expect(checkoutHint(57, 'master')).toEqual(['T19'])
  })
})

describe('canCheckOut', () => {
  it('double out: up to 170, not the bogey numbers, not 1', () => {
    for (const n of [2, 40, 50, 101, 170]) expect(canCheckOut(n, 'double')).toBe(true)
    for (const n of [1, 159, 162, 163, 165, 166, 168, 169, 171, 180]) expect(canCheckOut(n, 'double')).toBe(false)
  })

  it('straight and master out reach 180', () => {
    for (const n of [1, 171, 174, 177, 180]) expect(canCheckOut(n, 'straight')).toBe(true)
    for (const n of [172, 173, 175, 176, 178, 179, 181]) expect(canCheckOut(n, 'straight')).toBe(false)
    for (const n of [171, 180]) expect(canCheckOut(n, 'master')).toBe(true)
    for (const n of [1, 179]) expect(canCheckOut(n, 'master')).toBe(false)
  })

  it('suggests a route for 180 in straight out', () => {
    expect(checkoutHint(180, 'straight')).toEqual(['T20', 'T20', 'T20'])
  })
})
