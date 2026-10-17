import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import type { HiloGame } from '$lib/api/game-ws'
import HiloMatch from '$lib/components/hilo/HiloMatch.svelte'

type Seat = HiloGame['seats'][number]

const seat = (o: Partial<Seat> = {}): Seat => ({ lives: 2, out: false, place: null, outRound: null, visits: [], ...o })

const twoDarts = [
  { segment: { name: 'S20', number: 20, multiplier: 1 }, score: 20 },
  { segment: { name: 'S5', number: 5, multiplier: 1 }, score: 5 },
] as never

// HiLo-Duel: round 4, Anna on 25 after S20, S5, bars at 60 and 15
const game = (o: Partial<HiloGame> = {}): HiloGame => ({
  cfg: { startHigh: 41, startLow: 21, lives: 3, t1Zero: false, matchExtremes: true },
  phase: 'game',
  high: 60,
  low: 15,
  round: 4,
  currentPlayer: 0,
  nextPlayer: 1,
  winner: null,
  visitLocked: false,
  visitTotal: 25,
  seats: [
    seat({
      visits: [
        { round: 1, total: 45, outcome: 'high' },
        { round: 2, total: 60, outcome: 'high' },
        { round: 3, total: 38, outcome: 'between' },
      ],
    }),
    seat({
      visits: [
        { round: 1, total: 17, outcome: 'low' },
        { round: 2, total: 15, outcome: 'low' },
        { round: 3, total: 45, outcome: 'between' },
      ],
    }),
  ],
  lastResult: null,
  bullOff: null,
  currentVisitDarts: twoDarts,
  totalDarts: [11, 9],
  totalVisits: [3, 3],
  ...o,
})

const props = (g: HiloGame, o: Record<string, unknown> = {}) => ({
  game: g,
  players: [{ name: 'Anna' }, { name: 'Ben' }],
  darts: twoDarts,
  layout: 'duel' as const,
  canThrow: true,
  locked: false,
  canUndo: true,
  next: { label: 'Next player', prominent: true, enabled: true },
  onUndo: () => {},
  onNext: () => {},
  onBoardClick: () => {},
  onCorrect: () => {},
  ...o,
})

const text = (html: string) => html.replace(/<!--[^]*?-->/g, '').replace(/<[^>]+>/g, '')

describe('HiloMatch in a duel', () => {
  it('shows both players, the needs line and the scale with both bars', () => {
    const { body } = render(HiloMatch, { props: props(game()) })
    expect(text(body)).toContain('Anna')
    expect(text(body)).toContain('Ben')
    expect(text(body)).toContain('Over 60 · under 15')
    expect(body).toContain('aria-label="Scale from 0 to 180. HIGH bar at 60, LOW bar at 15. This visit is 25, between the bars."')
    expect(body).toContain('aria-label="2 of 3 lives left"')
    expect(text(body)).toContain('Between the bars')
  })

  it('shows what beats the high bar in the third slot', () => {
    const { body } = render(HiloMatch, { props: props(game()) })
    expect(body).toContain('Dart 3: needs 36 or more to beat HIGH 60')
    expect(text(body)).toMatch(/36\+\s*beats 60/)
    expect(text(body)).not.toContain('in 1 dart')
    // The open visit's row in the visit list
    expect(text(body)).toContain('25…')
  })

  it('puts the hint in the first slot, over the darts left, before any dart', () => {
    const g = game({ visitTotal: 0, currentVisitDarts: [] })
    const { body } = render(HiloMatch, { props: props(g, { darts: [] }) })
    expect(body).toContain('Dart 1: needs 61 or more in 3 darts to beat HIGH 60')
    expect(text(body)).toMatch(/61\+\s*in 3 darts · beats 60/)
    // No "0…" row before a dart is in
    expect(text(body)).not.toContain('0…')
  })

  it('shows Below LOW in the neutral style with the darts to go until the visit is in', () => {
    const one = [{ segment: { name: 'S10', number: 10, multiplier: 1 }, score: 10 }] as never
    const below = render(HiloMatch, { props: props(game({ visitTotal: 10, currentVisitDarts: one }), { darts: one }) }).body
    expect(text(below)).toContain('Below LOW · 2 to go')
    expect(below).toContain('bg-surface-2 text-text')
    expect(below).not.toContain('bg-accent-tint')
    const three = [...(one as unknown[]), ...(one as unknown[]), ...(one as unknown[])] as never
    const done = render(HiloMatch, { props: props(game({ visitTotal: 12, currentVisitDarts: three }), { darts: three }) }).body
    expect(text(done)).toContain('Below LOW')
    expect(text(done)).not.toContain('to go')
    expect(done).toContain('bg-accent-tint text-accent')
  })

  it('shows a visit locked by a miss as missed, a life lost', () => {
    const miss = [...(twoDarts as unknown[]), { segment: { name: 'Miss', number: 0, multiplier: 0 }, score: 0 }] as never
    const g = game({ visitLocked: true, currentVisitDarts: miss })
    const { body } = render(HiloMatch, { props: props(g, { darts: miss, locked: true }) })
    expect(text(body)).toContain('Missed · −1 life')
    expect(body).toContain('This visit is 25, missed the board, a life lost.')
    expect(body).not.toContain('needs 36 or more')
  })

  it('leaves the slots after a miss that locks the visit not thrown, with no next dart', () => {
    const miss = [{ segment: { name: 'Miss', number: 0, multiplier: 0 }, score: 0 }] as never
    const g = game({ visitLocked: true, visitTotal: 0, currentVisitDarts: miss })
    const { body } = render(HiloMatch, { props: props(g, { darts: miss, locked: true }) })
    expect(body).toContain('Dart 2: not thrown')
    expect(body).toContain('Dart 3: not thrown')
    expect(body).not.toContain('Dart 2: next')
    expect(body).not.toContain('rounded-full bg-accent"')
  })

  it('shows the life-lost banner in place of This visit after a visit between the bars', () => {
    const g = game({
      currentPlayer: 0,
      visitTotal: 0,
      currentVisitDarts: [],
      lastResult: { seat: 1, total: 45, outcome: 'between', high: 60, low: 15 },
    })
    const { body } = render(HiloMatch, { props: props(g, { darts: [] }) })
    expect(body).toContain('role="alert"')
    expect(text(body)).toContain('45 is between 15 and 60')
    expect(text(body)).not.toContain('This visit')
    expect(body).toContain('aria-label="2 of 3 lives left, one just lost"')
    expect(body).toContain('aria-label="Ben, just lost a life, 2 of 3 lives"')
    expect(body).toContain('The last visit of 45 lost a life.')
    expect(text(body)).toContain('· lost a life')
  })

  it('has no banner for a visit that moved a bar', () => {
    const g = game({ visitTotal: 0, currentVisitDarts: [], lastResult: { seat: 1, total: 70, outcome: 'high', high: 60, low: 15 } })
    const { body } = render(HiloMatch, { props: props(g, { darts: [] }) })
    expect(body).not.toContain('role="alert"')
    expect(text(body)).toContain('This visit')
  })
})

describe('HiloMatch in a party', () => {
  it('dims a player who is out with their place', () => {
    const g = game({
      seats: [seat(), seat(), seat({ lives: 0, out: true, place: 2, outRound: 3, visits: [{ round: 3, total: 26, outcome: 'between' }] })],
    })
    const { body } = render(HiloMatch, {
      props: props(g, { layout: 'party', players: [{ name: 'Anna' }, { name: 'Ben' }, { name: 'Cara' }] }),
    })
    expect(text(body)).toContain('Out · 2nd')
    expect(text(body)).toContain('Went out in round 3')
    expect(body).toContain('aria-label="No lives left"')
  })
})

describe('HiloMatch on a phone', () => {
  it('shows the other player as a row, the thrower as a card, and the horizontal scale', () => {
    const { body } = render(HiloMatch, { props: props(game(), { layout: 'phone' }) })
    expect(body).toContain('aria-label="Ben, Up next · lost a life · 45, 2 of 3 lives"')
    expect(body).toContain('aria-label="Anna, throwing, 2 of 3 lives"')
    expect(text(body)).toContain('Over 60 · under 15')
    expect(text(body)).toMatch(/25\s*· this visit · between the bars/)
    expect(body).toContain('Dart 3: needs 36 or more to beat HIGH 60')
    // No This visit band on phones: the scale's marker carries the total
    expect(text(body)).not.toContain('This visit')
  })
})
