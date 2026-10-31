import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import type { CricketGame } from '$lib/api/game-ws'
import CricketMatch from '$lib/components/cricket/CricketMatch.svelte'
import Mark from '$lib/components/cricket/Mark.svelte'
import DartBoard from '$lib/components/DartBoard.svelte'

const twoDarts = [
  { segment: { name: 'T19', number: 19, multiplier: 3 }, score: 57 },
  { segment: { name: 'S5', number: 5, multiplier: 1 }, score: 5 },
] as never

// Cricket-Duel: Lena throwing, 20 closed by both, Lena on 19 (scorable), 18 on two marks
const game = (o: Partial<CricketGame> = {}): CricketGame => ({
  config: { mode: 'standard', firstTo: 3, botSpeed: 'normal' },
  phase: 'game',
  targets: [20, 19, 18, 17, 16, 15, 25],
  marks: [
    [3, 3, 2, 0, 0, 0, 1],
    [3, 0, 0, 3, 0, 1, 0],
  ],
  points: [57, 34],
  legs: [1, 1],
  firstTo: 3,
  closed: [true, false, false, false, false, false, false],
  scorable: [false, true, false, false, false, false, false],
  currentPlayer: 0,
  nextPlayer: 1,
  round: 6,
  winner: null,
  visitLocked: false,
  marksScored: [30, 24],
  dartsThrown: [42, 40],
  lastVisit: [null, null],
  bullOff: null,
  currentVisitDarts: twoDarts,
  totalDarts: [44, 40],
  totalVisits: [15, 14],
  ...o,
})

const props = (g: CricketGame, o: Record<string, unknown> = {}) => ({
  game: g,
  players: [{ name: 'Lena' }, { name: 'Tom' }],
  who: [
    { name: 'Lena', bot: null, face: null },
    { name: 'Tom', bot: null, face: null },
  ],
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
const rowHeads = (html: string) => [...html.matchAll(/<th[^>]*scope="row"[^>]*>([^]*?)<\/th>/g)].map(m => text(m[1]).trim())

describe('CricketMatch in a duel', () => {
  it('shows both players and the seven targets, Bull last, in a marks table', () => {
    const { body } = render(CricketMatch, { props: props(game()) })
    expect(text(body)).toContain('Lena')
    expect(text(body)).toContain('Tom')
    expect(body).toMatch(/<caption[^>]*>[^]*Marks/)
    const heads = rowHeads(body)
    expect(heads).toHaveLength(7)
    expect(heads[0]).toMatch(/^20/)
    expect(heads.at(-1)).toBe('Bull')
  })

  it('draws an opened target as ⊗ and labels each cell', () => {
    const { body } = render(CricketMatch, { props: props(game()) })
    expect(body).toContain('data-mark="⊗"')
    expect(body).toContain('aria-label="Lena, 19: opened, can score"')
    expect(body).toContain('aria-label="Lena, 18: 2 marks"')
    expect(body).toContain('aria-label="Tom, 19: no marks"')
    expect(body).toContain('aria-label="Tom, 15: 1 mark"')
  })

  it('says Closed on a row every player opened', () => {
    const { body } = render(CricketMatch, { props: props(game()) })
    expect(rowHeads(body)[0]).toBe('20Closed')
    expect(body).toContain('aria-label="Lena, 20: closed"')
    expect(rowHeads(body)[1]).toBe('19')
  })

  it('strikes a closed row through, edge to edge, and no other row', () => {
    const { body } = render(CricketMatch, { props: props(game()) })
    const cellClass = (label: string) => body.match(new RegExp(`aria-label="${label}"[^>]*class="([^"]*)"`))?.[1] ?? ''
    const struck = (cls: string) => cls.includes('after:bg-text-dim')
    expect(struck(cellClass('Lena, 20: closed'))).toBe(true)
    expect(struck(cellClass('Tom, 20: closed'))).toBe(true)
    expect(struck(cellClass('Lena, 19: opened, can score'))).toBe(false)
    // The target cell between them carries its piece of the line too
    expect(body.match(/<th scope="row" class="([^"]*)"/g)?.map(struck)).toEqual([true, false, false, false, false, false, false])
  })

  it("shows each dart's marks in the slots", () => {
    const { body } = render(CricketMatch, { props: props(game()) })
    expect(body).toContain('Dart 1: T19, 3 marks. Correct this dart')
    expect(body).toContain('Dart 2: S5, no mark. Correct this dart')
    expect(body).toContain('Dart 3: next')
  })
})

describe('CricketMatch in a party', () => {
  it('puts the targets first, then a column per player with their points', () => {
    const row = [0, 0, 0, 0, 0, 0, 0]
    const g = game({
      marks: [row, row, row, row],
      points: [19, 34, 52, 92],
      legs: [0, 1, 0, 0],
      closed: [false, false, false, false, false, false, false],
      scorable: [false, false, false, false, false, false, false],
      marksScored: [0, 0, 0, 0],
      dartsThrown: [0, 0, 0, 0],
      lastVisit: [null, null, null, null],
      totalDarts: [0, 0, 0, 0],
      totalVisits: [0, 0, 0, 0],
    })
    const players = [{ name: 'Christoph' }, { name: 'Lena' }, { name: 'Max' }, { name: 'Guest 1' }]
    const { body } = render(CricketMatch, { props: props(g, { layout: 'party', players }) })
    const cols = [...body.matchAll(/<th[^>]*scope="col"[^>]*>([^]*?)<\/th>/g)].map(m => text(m[1]))
    expect(cols).toHaveLength(5)
    expect(cols[0]).toContain('Target')
    for (const [i, p] of players.entries()) {
      expect(cols[i + 1]).toContain(p.name)
      expect(cols[i + 1]).toContain(String(g.points[i]))
    }
  })
})

describe('CricketMatch in a 2v2', () => {
  it('renders the duel table, not the party one, even though layout is party (only X01 sets it to teams)', () => {
    const g = game({
      teams: [
        { id: 'A', name: 'Team A', seats: [0, 2], points: 57, legs: 1 },
        { id: 'B', name: 'Team B', seats: [1, 3], points: 34, legs: 1 },
      ],
    })
    const { body } = render(CricketMatch, { props: props(g, { layout: 'party' }) })
    const cols = [...body.matchAll(/<th[^>]*scope="col"[^>]*>([^]*?)<\/th>/g)].map(m => text(m[1]))
    // The chalk (duel) layout: a side's head, then Target, then the other side's head
    expect(cols).toHaveLength(3)
    expect(cols[0]).toContain('Team A')
    expect(cols[1]).toContain('Target')
    expect(cols[2]).toContain('Team B')
  })
})

describe('CricketMatch on a phone', () => {
  it('shows both players and the table', () => {
    const { body } = render(CricketMatch, { props: props(game(), { layout: 'phone' }) })
    expect(body).toContain('aria-label="Lena, throwing, 57 points"')
    expect(body).toContain('aria-label="Tom, up next, 34 points"')
    expect(rowHeads(body)).toHaveLength(7)
  })
})

describe('Mark', () => {
  it('draws only the strokes past `from` in', () => {
    const { body } = render(Mark, { props: { marks: 3, from: 2 } })
    const paths = [...body.matchAll(/<(path|circle)[^>]*>/g)].map(m => m[0])
    expect(paths).toHaveLength(3)
    expect(paths[0]).not.toContain('draw')
    expect(paths[1]).not.toContain('draw')
    expect(paths[2]).toMatch(/^<circle[^>]*class="[^"]*draw/)
  })

  it('draws nothing in when the marks are as they were', () => {
    const { body } = render(Mark, { props: { marks: 2, from: 2 } })
    expect(body).not.toMatch(/class="[^"]*draw/)
    expect(body).toContain('data-mark="X"')
  })
})

describe('DartBoard in cricket', () => {
  it('tints what the thrower can score and dims what is closed or not in play', () => {
    const body = render(DartBoard, { props: { inPlay: { score: [19], open: [18, 17, 16, 15, 25] } } }).body
    // 20 closed and the 14 numbers not in play (1 to 14): 15 wedges dimmed; the bull is open
    expect(body.match(/data-board="dim"/g)).toHaveLength(15)
    expect(body.match(/data-board="score"/g)).toHaveLength(1)
  })
})
