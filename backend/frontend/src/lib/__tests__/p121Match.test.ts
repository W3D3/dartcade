import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import type { P121Game } from '$lib/api/game-ws'
import { defaultSettings } from '$lib/gameSettings'

vi.mock('$lib/api', () => ({ api: { GET: () => Promise.resolve({ data: { best: null } }) } }))
const { default: P121Match } = await import('$lib/components/p121/P121Match.svelte')

type Seat = P121Game['seats'][number]

// Task 6's fixture (lib/p121/view.test.ts), at the start of the open try
const seat = (o: Partial<Seat> = {}): Seat => ({
  target: 122,
  left: 24,
  darts: 0,
  visits: [],
  floor: 0,
  tries: [
    { target: 121, made: true, darts: 6, finish: 'D10' },
    { target: 122, made: false, darts: 9, finish: null },
    { target: 121, made: true, darts: 7, finish: 'D11' },
  ],
  made: 2,
  highestMade: 121,
  avgDarts: 6.5,
  done: false,
  ...o,
})

const game = (o: Partial<P121Game> = {}): P121Game => ({
  cfg: { startTarget: 121, tries: 10, dartsPerTry: 9, outMode: 'double', missRule: 'reset', lock: false },
  phase: 'game',
  currentPlayer: 0,
  nextPlayer: 0,
  winner: null,
  visitLocked: false,
  bust: false,
  visitStartLeft: 24,
  seats: [seat()],
  lastResult: null,
  bullOff: null,
  currentVisitDarts: [],
  totalDarts: [22],
  totalVisits: [8],
  ...o,
})

const props = (g: P121Game) => ({
  game: g,
  players: [{ name: 'Christoph' }],
  who: [{ name: 'Christoph', face: null }],
  darts: [],
  layout: 'solo' as const,
  canThrow: true,
  locked: false,
  canUndo: false,
  next: { label: 'Next player', prominent: true, enabled: true },
  onUndo: () => {},
  onNext: () => {},
  onBoardClick: () => {},
  onCorrect: () => {},
  onGiveUp: () => {},
  settings: { ...defaultSettings },
})

const text = (html: string) => html.replace(/<!--[^]*?-->/g, '').replace(/<[^>]+>/g, '')

describe('P121Match in solo', () => {
  it('shows the route, the three slots ending on "checks out", and the ladder', () => {
    const { body } = render(P121Match, { props: props(game()) })
    expect(text(body)).toContain('Hit D12 to make it')
    expect(body).toContain('aria-label="Target 122, 24 left, 0 of 9 darts used"')
    // The three slots: D12 to throw, then two spare ones; the route's last foot checks out
    expect(body.match(/>Dart \d: /g)).toHaveLength(3)
    expect(body).toContain('Dart 1: suggested D12, checks out')
    // The ladder: three tries and the open one, "now"
    const ladder = body.slice(body.indexOf('<ol'), body.indexOf('</ol>'))
    expect(ladder.match(/<li/g)).toHaveLength(4)
    expect(text(ladder)).toMatch(/Try 4\s*122\s*now/)
    expect(text(ladder)).toContain('back to 121')
    expect(text(body)).toContain('6 more tries after this one')
    expect(text(body)).toContain('Give up this try ›')
  })

  it('shows the checked-out card once the try is made', () => {
    const g = game({ visitLocked: true, seats: [seat({ left: 0 })] })
    const darts = [
      { segment: { name: 'T13', number: 13, multiplier: 3 }, score: 39 },
      { segment: { name: 'D12', number: 12, multiplier: 2 }, score: 24 },
    ] as never
    const { body } = render(P121Match, { props: { ...props(g), darts, locked: true } })
    expect(text(body)).toContain('Checked out')
    expect(text(body)).toContain('122 · T13, D12 in 2 darts')
    expect(text(body)).toContain('Take your darts out to start the next try')
    // One Next button: the controls' own, naming the next try
    expect(body.match(/>\s*Next: 123/g)).toHaveLength(1)
    expect(text(body)).not.toContain('Next player')
    // A decided visit can't be given up
    expect(text(body)).not.toContain('Give up this try')
  })

  it('disables give up while darts are in the board, with a hint', () => {
    const darts = [{ segment: { name: 'S1', number: 1, multiplier: 1 }, score: 1 }] as never
    const { body } = render(P121Match, { props: { ...props(game({ seats: [seat({ left: 23 })] })), darts } })
    expect(body).toMatch(/<button[^>]* disabled(="")?[ >][^>]*>Give up this try ›/)
    expect(text(body)).toContain('Take your darts out first')
    const clean = render(P121Match, { props: props(game()) }).body
    expect(clean).not.toMatch(/<button[^>]* disabled(="")?[ >][^>]*>Give up this try ›/)
    expect(text(clean)).not.toContain('Take your darts out first')
  })

  it('shows the missed banner after a missed try', () => {
    const g = game({ lastResult: { seat: 0, target: 123, made: false, darts: 9, next: 121 }, seats: [seat({ target: 121, left: 121 })] })
    const { body } = render(P121Match, { props: props(g) })
    expect(text(body)).toContain('Missed 123 · back to 121')
  })
})

describe('P121Match in a duel', () => {
  it("doesn't promise the takeout starts the next try (it passes to the next player)", () => {
    const g = game({ visitLocked: true, seats: [seat({ left: 0 }), seat()] })
    const darts = [{ segment: { name: 'D12', number: 12, multiplier: 2 }, score: 24 }] as never
    const { body } = render(P121Match, {
      props: {
        ...props(g),
        players: [{ name: 'Anna' }, { name: 'Ben' }],
        who: [
          { name: 'Anna', face: null },
          { name: 'Ben', face: null },
        ],
        layout: 'duel' as const,
        darts,
        locked: true,
      },
    })
    expect(text(body)).toContain('Checked out')
    expect(text(body)).not.toContain('Take your darts out to start')
    expect(text(body)).toContain('Next player')
  })
})

describe('P121Match solo controls', () => {
  it('names the next visit, not a next player', () => {
    const { body } = render(P121Match, { props: props(game()) })
    expect(text(body)).toContain('Next visit')
    expect(text(body)).not.toContain('Next player')
  })
  it('says "again" in the ladder when a miss keeps the target', () => {
    const tries = [{ target: 121, made: false, darts: 9, finish: null }]
    const g = game({ seats: [seat({ target: 121, left: 121, tries, made: 0, highestMade: null, avgDarts: null })] })
    const { body } = render(P121Match, { props: props(g) })
    const ladder = text(body.slice(body.indexOf('<ol'), body.indexOf('</ol>')))
    expect(ladder).toContain('again')
    expect(ladder).not.toContain('back to')
  })
})
