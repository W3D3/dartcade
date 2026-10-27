import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import { p121Live, routeFontSize } from '../bigscreen/p121View.js'
import { rowScale } from '../bigscreen/rowScale.js'
import { atcLive } from '../bigscreen/atcView.js'
import { hiloLive } from '../bigscreen/hiloView.js'
import P121Live from '../components/bigscreen/P121Live.svelte'
import AtcLive from '../components/bigscreen/AtcLive.svelte'
import HiloLive from '../components/bigscreen/HiloLive.svelte'
import type { Snapshot } from '../ws.js'

const dart = (name: string, score: number, number = 0) => ({ segment: { name, number, bed: 'Single', multiplier: 1 }, score })

function snap(gameId: string, names: string[], game: Record<string, unknown>): Snapshot {
  return {
    type: 'snapshot',
    sessionId: 's1',
    gameId,
    boardId: 'b1',
    lobbyId: null,
    lobbyName: null,
    players: names.map(name => ({ name })),
    game,
    bmStatus: null,
    status: 'active',
    finishPending: false,
    canUndoVisit: false,
    ownerUserId: 'u1',
    seats: names.map(() => ({ userId: null, boardName: 'Living room', forfeited: false, bot: null })),
    mySeats: [0],
  } as unknown as Snapshot
}

const tryOf = (target: number, made: boolean, darts: number) => ({ target, made, darts, finish: made ? 'D12' : null })
const BULL_OFF = { phase: 'bulloff', bullOff: { throws: [null, null], sequence: [0, 1], currentPlayer: 1, result: null } }

const p121Seat = {
  target: 123,
  left: 24,
  darts: 3,
  visits: [3],
  floor: 121,
  tries: [tryOf(121, false, 9), tryOf(121, true, 6), tryOf(122, true, 8)],
  made: 2,
  highestMade: 122,
  avgDarts: 7,
  done: false,
}

function p121(o: Record<string, unknown> = {}, names = ['Christoph']) {
  return snap('p121', names, {
    cfg: { startTarget: 121, tries: 10, dartsPerTry: 9, outMode: 'double', missRule: 'reset', lock: false },
    phase: 'game',
    currentPlayer: 0,
    nextPlayer: null,
    winner: null,
    visitLocked: false,
    bust: false,
    visitStartLeft: 63,
    seats: names.map(() => p121Seat),
    lastResult: null,
    bullOff: null,
    currentVisitDarts: [dart('T13', 39, 13)],
    totalDarts: names.map(() => 3),
    totalVisits: names.map(() => 2),
    ...o,
  })
}

describe('p121Live', () => {
  const v = p121Live(p121())
  it('reads the try, target, left and darts left', () => {
    expect(v.header).toMatchObject({ title: '121 Checkout', meta: 'Practice · 9 darts per try · Double out · Try 4 of 10' })
    expect(v.seats[0]).toMatchObject({ name: 'Christoph', tryLabel: 'TRY 4 OF 10', target: 123, left: 24, throwing: true })
    // 3 darts in committed visits plus 1 in the open one
    expect(v.dartsLeft).toEqual({ used: 4, total: 9, text: '5 left' })
  })
  it('names the checkout route and what making it does', () => {
    expect(v.checkout).toEqual({ label: 'CHECKOUT', text: 'Make it to move up to 124', route: 'D12' })
    expect(v.visit.total).toBe(39)
    expect(v.slots.map(s => s.label)).toEqual(['T13', 'D12', ''])
  })
  it('lists the session tries and the in-progress one', () => {
    expect(v.session.score).toBe('2/3')
    expect(v.session.tries).toEqual([
      { label: 'TRY 1', target: 121, note: 'missed · reset', state: 'missed' },
      { label: 'TRY 2', target: 121, note: 'made · 6 darts', state: 'made' },
      { label: 'TRY 3', target: 122, note: 'made · 8 darts', state: 'made' },
      { label: 'TRY 4', target: 123, note: 'in progress', state: 'current' },
    ])
  })
  it('keeps the last four tries of a long session', () => {
    const tries = Array.from({ length: 8 }, (_, i) => tryOf(121 + i, true, 5))
    const s = p121({ seats: [{ ...p121Seat, tries }] })
    expect(p121Live(s).session.tries.map(t => t.label)).toEqual(['TRY 6', 'TRY 7', 'TRY 8', 'TRY 9'])
  })
  it('hands over to the bull off thrower', () => {
    const b = p121Live(p121(BULL_OFF, ['A', 'B']))
    expect(b.bullOff).toBe(true)
    expect(b.seats.map(s => s.throwing)).toEqual([false, true])
  })
  it('lists every seat of a group game', () => {
    expect(p121Live(p121({}, ['A', 'B', 'C'])).seats).toHaveLength(3)
  })
})

function atc(o: Record<string, unknown> = {}, names = ['Christoph', 'Lena']) {
  return snap('atc', names, {
    targets: [14, 9, 3, 1].slice(0, names.length),
    sequence: [...Array.from({ length: 20 }, (_, i) => i + 1), 22],
    currentPlayer: 0,
    winner: null,
    cfg: { throwAgainOnAllHit: false, finishOn: 'bull', multiplierAdvances: false, order: 'asc' },
    currentVisitHits: [true, false],
    hitCounts: [13, 8, 2, 0].slice(0, names.length),
    currentVisitDarts: [dart('S13', 13, 13), dart('S11', 11, 11)],
    totalDarts: [21, 18, 6, 4].slice(0, names.length),
    totalVisits: [12, 11, 12, 12].slice(0, names.length),
    ...o,
  })
}

describe('atcLive', () => {
  const v = atcLive(atc())
  it('shows each seat’s target, hit rate, darts and progress', () => {
    expect(v.seats[0]).toMatchObject({
      name: 'Christoph',
      target: '14',
      hitRate: '62%',
      darts: 21,
      doneText: '13 of 21 done',
      throwing: true,
      next: false,
    })
    expect(v.seats[1]).toMatchObject({ name: 'Lena', target: '9', hitRate: '44%', doneText: '8 of 21 done', throwing: false, next: true })
    expect(v.seats[0].cells.map(c => c.short).slice(-2)).toEqual(['20', 'B'])
    expect(v.seats[0].cells[13].state).toBe('current')
  })
  it('shows this visit with advances and misses', () => {
    expect(v.visit.total).toBe('+1')
    expect(v.slots.map(s => [s.label, s.note])).toEqual([
      ['S13', '+1 · ON TARGET'],
      ['S11', 'MISS'],
      ['14', 'YOUR TARGET'],
    ])
    expect(v.header.meta).toBe('1–20, then Bull · any segment counts · Round 12')
  })
  it('is a party of rows from three seats and survives one seat', () => {
    expect(atcLive(atc({}, ['A', 'B', 'C'])).party).toBe(true)
    expect(atcLive(atc({}, ['A'])).seats).toHaveLength(1)
    expect(atcLive(atc({}, ['A'])).seats[0].next).toBe(false)
  })
})

function hilo(o: Record<string, unknown> = {}, names = ['Anna', 'Ben']) {
  const seat = (lives: number, total: number, outcome: string) => ({
    lives,
    out: false,
    place: null,
    outRound: null,
    visits: [{ round: 3, total, outcome }],
  })
  return snap('hilo', names, {
    cfg: { startHigh: 41, startLow: 21, lives: 3, t1Zero: false, matchExtremes: false, keepBarsOnLifeLost: false },
    phase: 'game',
    high: 60,
    low: 15,
    round: 4,
    currentPlayer: 0,
    nextPlayer: 1,
    winner: null,
    visitLocked: false,
    visitTotal: 25,
    seats: [seat(2, 38, 'between'), seat(2, 45, 'between'), seat(3, 80, 'high')].slice(0, names.length),
    lastResult: null,
    bullOff: null,
    currentVisitDarts: [dart('S20', 20, 20), dart('S5', 5, 5)],
    totalDarts: names.map(() => 6),
    totalVisits: names.map(() => 3),
    ...o,
  })
}

describe('hiloLive', () => {
  const v = hiloLive(hilo())
  it('shows lives, the last visit and its effect', () => {
    expect(v.header.meta).toBe('2 players · 3 lives · Round 4')
    expect(v.seats[0]).toMatchObject({ name: 'Anna', livesText: '2 of 3 lives', lives: 2, total: 3, throwing: true })
    expect(v.seats[0].last).toEqual({ total: 38, effect: '−1 life', lost: true })
    expect(v.seats[1]).toMatchObject({ next: true, throwing: false })
  })
  it('shows a gained bar instead of a lost life', () => {
    expect(hiloLive(hilo({}, ['A', 'B', 'C'])).seats[2].last).toEqual({ total: 80, effect: 'New high', lost: false })
  })
  it('shows the bars and what this visit needs to beat', () => {
    expect([v.high, v.low]).toEqual([60, 15])
    expect(v.visit.total).toBe(25)
    expect(v.slots.map(s => [s.label, s.note])).toEqual([
      ['S20', '20'],
      ['S5', '5'],
      ['36+', 'BEATS HIGH 60'],
    ])
    expect(v.marker).toEqual({ total: 25, lost: false })
  })
  it('has no last visit before the first one, and no marker without darts', () => {
    const one = hiloLive(
      hilo({ currentVisitDarts: [], visitTotal: 0, seats: [{ lives: 3, out: false, place: null, outRound: null, visits: [] }] }, ['A']),
    )
    expect(one.seats[0].last).toBeNull()
    expect(one.marker).toBeNull()
  })
})

describe('rendering', () => {
  const props = (snapshot: Snapshot, orientation: 'landscape' | 'portrait') => ({ props: { snapshot, orientation } })
  for (const o of ['landscape', 'portrait'] as const) {
    it(`renders 121 ${o}`, () => {
      const { body } = render(P121Live, props(p121(), o))
      for (const t of [
        '121 Checkout',
        'TRY 4 OF 10',
        'TARGET',
        'LEFT',
        'DARTS',
        '5 left',
        'CHECKOUT',
        'Make it to move up to 124',
        'THIS VISIT',
        'SESSION',
        '2/3',
        'made · 6 darts',
        'in progress',
      ])
        expect(body).toContain(t)
    })
    it(`renders 121 ${o} with three seats`, () => {
      const { body } = render(P121Live, props(p121({}, ['Ann', 'Bob', 'Cy']), o))
      expect(body).toContain('Cy')
    })
    it(`renders ATC ${o}`, () => {
      const { body } = render(AtcLive, props(atc(), o))
      for (const t of [
        'Around the Clock',
        'THROWING',
        'NEXT',
        'HIT RATE',
        '62%',
        '13 of 21 done',
        'THIS VISIT',
        '+1 · ON TARGET',
        'MISS',
        'YOUR TARGET',
      ])
        expect(body).toContain(t)
    })
    it(`renders ATC ${o} with four seats`, () => {
      const { body } = render(AtcLive, props(atc({}, ['Ann', 'Bob', 'Cy', 'Dee']), o))
      expect(body).toContain('Dee')
      expect(body).toContain('8 of 21 done')
    })
    it(`renders HiLo ${o}`, () => {
      const { body } = render(HiloLive, props(hilo(), o))
      for (const t of [
        'Higher Lower',
        'THROWING',
        'NEXT',
        '2 of 3 lives',
        'LAST VISIT',
        '−1 life',
        'NEEDS',
        'OVER',
        'UNDER',
        'THIS VISIT',
        '36+',
        'BEATS HIGH 60',
      ])
        expect(body).toContain(t)
    })
    it(`renders a bull off ${o}`, () => {
      const { body } = render(HiloLive, props(hilo(BULL_OFF), o))
      expect(body).toContain('Bull off')
      expect(body).not.toContain('NEEDS')
    })
  }
})

describe('121 while the visit waits for takeout', () => {
  const made = p121({ currentVisitDarts: [dart('T13', 39, 13), dart('D12', 24, 12)], seats: [{ ...p121Seat, left: 0 }] })
  const bust = p121({ bust: true, seats: [{ ...p121Seat, left: 63 }] })
  it('says the try was made, with no route', () => {
    expect(p121Live(made).checkout).toEqual({ label: 'MADE IT', text: 'Take your darts out · up to 124', route: '' })
  })
  it('says bust, with no route', () => {
    expect(p121Live(bust).checkout).toMatchObject({ label: 'BUST', route: '' })
  })
  for (const o of ['landscape', 'portrait'] as const) {
    it(`renders both ${o}`, () => {
      expect(render(P121Live, { props: { snapshot: made, orientation: o } }).body).toContain('MADE IT')
      const b = render(P121Live, { props: { snapshot: bust, orientation: o } }).body
      expect(b).toContain('BUST')
      expect(b).not.toContain('Score 63 to make it')
    })
  }
})

describe('routeFontSize', () => {
  const routes = ['D12', 'T20 · D12', 'T20 · T11 · D14']
  it('shrinks the route with its darts', () => {
    expect(routes.map(r => routeFontSize(r, 'landscape'))).toEqual([110, 84, 64])
    expect(routes.map(r => routeFontSize(r, 'portrait'))).toEqual([110, 110, 96])
  })
  it('keeps the full size for no route', () => {
    expect([routeFontSize('', 'landscape'), routeFontSize('–', 'landscape')]).toEqual([110, 110])
  })
})

describe('rowScale', () => {
  it('shrinks from five seats', () => {
    expect(rowScale(4).name).toBe(40)
    expect(rowScale(5).name).toBe(32)
    expect(rowScale(6).name).toBe(26)
    expect(rowScale(6).strip).toBeLessThan(rowScale(5).strip)
  })
})

describe('edge seat counts', () => {
  const six = ['Ann', 'Bob', 'Cy', 'Dee', 'Eve', 'Fay']
  const hiloSeat = { lives: 2, out: false, place: null, outRound: null, visits: [{ round: 3, total: 38, outcome: 'between' }] }
  const props = (snapshot: Snapshot, orientation: 'landscape' | 'portrait') => ({ props: { snapshot, orientation } })
  for (const o of ['landscape', 'portrait'] as const) {
    it(`renders a 121 bull off ${o}`, () => {
      const { body } = render(P121Live, props(p121(BULL_OFF, ['A', 'B']), o))
      expect(body).toContain('BULL OFF')
      expect(body).not.toContain('SESSION')
    })
    it(`renders one seat of ATC and HiLo ${o}`, () => {
      expect(render(AtcLive, props(atc({}, ['Solo']), o)).body).toContain('Solo')
      expect(render(HiloLive, props(hilo({}, ['Solo']), o)).body).toContain('Solo')
    })
    it(`renders six seats of ATC and HiLo ${o}`, () => {
      expect(render(AtcLive, props(atc({}, six), o)).body).toContain('Fay')
      expect(render(HiloLive, props(hilo({ seats: six.map(() => hiloSeat) }, six), o)).body).toContain('Fay')
    })
  }
})
