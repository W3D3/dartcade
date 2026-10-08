import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import StatsTable from '../components/details/StatsTable.svelte'
import Standings from '../components/details/Standings.svelte'
import ResultCard from '../components/details/ResultCard.svelte'
import TeamShares from '../components/details/TeamShares.svelte'
import X01Legs from '../components/details/X01Legs.svelte'
import X01Section from '../components/details/X01Section.svelte'
import AtcTargets from '../components/details/AtcTargets.svelte'
import RaceChart from '../components/details/RaceChart.svelte'
import HeatBoard from '../components/details/HeatBoard.svelte'
import HeatmapView from '../components/details/HeatmapView.svelte'
import type { GameDetail, StatRow } from '../api'
import { groupingMm, type HeatDart } from '../details/heatmap.js'
import { detailSides } from '../details/page.js'

const rows: StatRow[] = [
  { key: 'average', label: '3-dart average', format: 'decimal', better: 'higher', compact: false },
  { key: 'bestLegDarts', label: 'Best leg', format: 'darts', better: 'lower', compact: true },
]
const seat = (s: number, name: string, placement: number) => ({
  seat: s,
  throwPosition: s,
  name,
  userId: null,
  placement,
  stats: {},
  forfeited: false,
})
const game = (n: number): GameDetail => ({
  game: {
    id: 'g',
    mode: 'x01',
    config: { startScore: 501, inMode: 'straight', outMode: 'double', firstTo: 3 },
    createdAt: '2026-09-26T19:00:00.000Z',
    finishedAt: '2026-09-26T19:14:00.000Z',
    board: null,
    mySeat: 0,
    players: Array.from({ length: n }, (_, i) => seat(i, `P${i}`, i + 1)),
  },
  detail: { mode: 'x01', legs: [] },
  stats: {
    rows,
    seats: Array.from({ length: n }, (_, i): { index: number; values: Record<string, number> } => ({
      index: i,
      values: i === 1 ? { average: 71.6 } : { average: 83.9, bestLegDarts: 15 },
    })),
  },
})

describe('details components', () => {
  it('duel stats: labels, values, a dash for what does not apply, lime on the better side', () => {
    const d = game(2)
    const out = render(StatsTable, { props: { rows, sides: detailSides(d) } }).body
    expect(out).toContain('3-dart average')
    expect(out).toContain('83.9')
    expect(out).toContain('71.6')
    expect(out).toContain('—')
    expect(out).toMatch(/text-accent[^>]*>83\.9/)
  })

  it('solo: one side, no highlight', () => {
    const d = game(1)
    const out = render(StatsTable, { props: { rows, sides: detailSides(d) } }).body
    expect(out).toContain('83.9')
    expect(out).not.toMatch(/text-accent[^>]*>83\.9/)
    expect(render(ResultCard, { props: { detail: d, sides: detailSides(d) } }).body).not.toContain('Winner')
  })

  it('shows who gave up instead of a Winner tag', () => {
    const d = game(2)
    d.game.players[0].forfeited = true
    const out = render(ResultCard, { props: { detail: d, sides: detailSides(d) } }).body
    expect(out).toContain('Gave up')
  })

  it('hides non-compact rows on phones', () => {
    const out = render(StatsTable, { props: { rows, sides: detailSides(game(2)) } }).body
    expect(out).toMatch(/max-md:hidden[^>]*>[^<]*<span[^>]*>83\.9/)
  })

  it('party standings: places and only the compact rows', () => {
    const d = game(3)
    const out = render(Standings, { props: { rows, sides: detailSides(d) } }).body
    expect(out).toContain('1st')
    expect(out).toContain('3rd')
    expect(out).toContain('Best leg')
    expect(out).not.toContain('3-dart average')
  })

  it('teams: stats, each player share and the chalkboard name the thrower', () => {
    const d = game(4)
    d.detail = {
      mode: 'x01',
      teams: [
        { id: 'A', name: 'Team A', seats: [0, 2] },
        { id: 'B', name: 'Team B', seats: [1, 3] },
      ],
      legs: [
        {
          leg: 0,
          starter: 0,
          winner: null,
          visits: [
            { visit: 0, seat: 0, committedAt: '', darts: [], scored: 60, remaining: 441, bust: false },
            { visit: 1, seat: 1, committedAt: '', darts: [], scored: 45, remaining: 456, bust: false },
          ],
        },
      ],
    }
    d.stats.teams = [
      { index: 0, values: { average: 78.2 } },
      { index: 1, values: { average: 65.4 } },
    ]
    d.stats.seats = [
      { index: 0, values: { average: 80.1, legsClosed: 2 } },
      { index: 1, values: { average: 60.3, legsClosed: 1 } },
      { index: 2, values: { average: 76.3, legsClosed: 1 } },
      { index: 3, values: { average: 70.5, legsClosed: 0 } },
    ]

    const statsOut = render(StatsTable, { props: { rows, sides: detailSides(d) } }).body
    expect(statsOut).toContain('Team A')
    expect(statsOut).toContain('Team B')
    expect(statsOut).toContain('78.2')

    const sharesOut = render(TeamShares, { props: { detail: d } }).body
    expect(sharesOut).toContain("Each player's share")
    expect(sharesOut).toContain('P0')
    expect(sharesOut).toContain('2')

    const legsOut = render(X01Legs, { props: { detail: d, party: false, leg: 0, highlight: null } }).body
    expect(legsOut).toContain('P0')
    expect(legsOut).toContain('P1')
  })
})

describe('X01 leg by leg', () => {
  it('shows the last leg: summary, chart and chalkboard', () => {
    const seg = (name: string, number: number, multiplier: 1 | 2 | 3) => ({ name, number, multiplier, bed: 'Single' as const })
    const dart = (s: ReturnType<typeof seg>, index: number) => ({
      index,
      segment: s,
      coords: null,
      source: 'manual' as const,
      corrected: false,
      thrownAt: '',
    })
    const d = game(2)
    d.detail = {
      mode: 'x01',
      legs: [
        {
          leg: 0,
          starter: 0,
          winner: 0,
          visits: [
            {
              visit: 0,
              seat: 0,
              committedAt: '',
              darts: [dart(seg('T20', 20, 3), 0), dart(seg('T20', 20, 3), 1), dart(seg('T20', 20, 3), 2)],
              scored: 180,
              remaining: 321,
              bust: false,
            },
            { visit: 1, seat: 1, committedAt: '', darts: [dart(seg('S20', 20, 1), 0)], scored: 20, remaining: 481, bust: false },
            {
              visit: 2,
              seat: 0,
              committedAt: '',
              darts: [dart(seg('D20', 20, 2), 0)],
              scored: 40,
              remaining: 0,
              bust: false,
            },
          ],
        },
      ],
    }
    const out = render(X01Legs, { props: { detail: d, party: false, leg: 0, highlight: null } }).body
    expect(out).toContain('P0 threw first')
    expect(out).toContain('<svg')
    expect(out).toContain('T20')
    // seat 0's first visit (321 left) is crossed out once passed, not the checkout visit
    expect(out).toContain('321')
    expect(out).toContain('Out')
  })
})

describe('X01Section', () => {
  it('title-tabs: Leg by leg selected by default, its panel shows the chalkboard', () => {
    const seg = (name: string, number: number, multiplier: 1 | 2 | 3) => ({ name, number, multiplier, bed: 'Single' as const })
    const dart = (s: ReturnType<typeof seg>, index: number) => ({
      index,
      segment: s,
      coords: null,
      source: 'manual' as const,
      corrected: false,
      thrownAt: '',
    })
    const d = game(2)
    d.detail = {
      mode: 'x01',
      legs: [
        {
          leg: 0,
          starter: 0,
          winner: 0,
          visits: [{ visit: 0, seat: 0, committedAt: '', darts: [dart(seg('T20', 20, 3), 0)], scored: 60, remaining: 441, bust: false }],
        },
      ],
    }
    const out = render(X01Section, { props: { detail: d, party: false } }).body
    expect(out).toContain('role="tablist"')
    expect(out).toContain('aria-label="Match view"')
    expect(out.match(/role="tab"/g)).toHaveLength(2)
    expect(out).toMatch(/aria-selected="true"[^>]*>Leg by leg/)
    expect(out).toMatch(/aria-selected="false"[^>]*>Heatmap/)
    // The unselected tab hovers to the artboard's full-brightness text, not a middling one.
    expect(out).toMatch(/text-text-dim hover:text-text[^>]*>Heatmap/)
    expect(out).toContain('role="tabpanel"')
    // Only one leg: the header's right side falls back to a plain "Leg 1" label, in the same
    // row as the title-tabs (not a separate row owned by X01Legs).
    const tablistIdx = out.indexOf('role="tablist"')
    const panelIdx = out.indexOf('role="tabpanel"')
    const legLabelIdx = out.indexOf('Leg 1')
    expect(legLabelIdx).toBeGreaterThan(tablistIdx)
    expect(legLabelIdx).toBeLessThan(panelIdx)
    // The Leg by leg panel's content: the chalkboard's table and a dart from it.
    expect(out).toContain('T20')
    expect(out).toContain('<svg')
    // Heatmap's own subtitle only shows when Heatmap is the selected view.
    expect(out).not.toContain('Where every dart landed')
  })

  it('party, several legs: leg tabs and the highlight picker share the header row with the title-tabs', () => {
    const d = game(3)
    d.detail = {
      mode: 'x01',
      legs: [0, 1].map(leg => ({
        leg,
        starter: 0,
        winner: leg === 0 ? 1 : null,
        visits: [{ visit: 0, seat: 0, committedAt: '', darts: [], scored: 60, remaining: 441, bust: false }],
      })),
    }
    const out = render(X01Section, { props: { detail: d, party: true } }).body
    const tablistIdx = out.indexOf('role="tablist"')
    const panelIdx = out.indexOf('role="tabpanel"')
    // The leg tabs group and the highlight picker both sit between the title-tabs and the panel
    // — the same header row, not a second row owned by X01Legs.
    const legGroupIdx = out.indexOf('aria-label="Leg"')
    const highlightIdx = out.indexOf('aria-label="Highlight a player"')
    expect(legGroupIdx).toBeGreaterThan(tablistIdx)
    expect(legGroupIdx).toBeLessThan(panelIdx)
    expect(highlightIdx).toBeGreaterThan(tablistIdx)
    expect(highlightIdx).toBeLessThan(panelIdx)
    // The last leg is selected by default.
    expect(out).toMatch(/aria-pressed="true"[^>]*>Leg 2</)
    // Heatmap's note doesn't show while Leg by leg is selected.
    expect(out).not.toContain('Where every dart landed')
  })
})

describe('Around the Clock sections', () => {
  const atc = (): GameDetail => {
    const d = game(2)
    d.game.mode = 'atc'
    d.game.config = { order: 'asc', finishOn: 'twenty', multiplierAdvances: false }
    d.detail = {
      mode: 'atc',
      sequence: [1, 2, 3],
      visits: [],
      progress: [
        {
          seat: 0,
          steps: [
            { target: 1, darts: 2, hit: true },
            { target: 2, darts: 3, hit: false },
          ],
        },
        { seat: 1, steps: [{ target: 1, darts: 5, hit: false }] },
      ],
    }
    d.stats = {
      rows: [],
      seats: [
        { index: 0, values: { hardestTarget: 1 } },
        { index: 1, values: {} },
      ],
    }
    return d
  }

  it('grids targets per player with the hardest-target line', () => {
    const out = render(AtcTargets, { props: { detail: atc() } }).body
    expect(out).toContain('Target by target')
    expect(out).toContain('1 cost P0 the most.')
    expect(out).toContain('P1')
  })

  it('draws the race', () => {
    const out = render(RaceChart, { props: { detail: atc(), highlight: 0 } }).body
    expect(out).toContain('Race to the Bull')
    expect(out).toContain('<path')
  })
})

describe('HeatBoard', () => {
  const seg = (name: string, number: number, multiplier: 0 | 1 | 2 | 3) => ({
    name,
    number,
    multiplier,
    bed: (multiplier === 0 ? 'Outside' : multiplier === 2 ? 'Double' : multiplier === 3 ? 'Triple' : 'Single') as 'Single',
  })
  const S20 = seg('S20', 20, 1)

  it('shows the board label, a dot per positioned dart and the legend; no empty-state text', () => {
    const darts: HeatDart[] = [
      { segment: S20, coords: { x: 0, y: 0.8 }, manual: false },
      { segment: S20, coords: { x: 0.1, y: 0.7 }, manual: false },
      { segment: S20, coords: { x: -0.1, y: 0.75 }, manual: false },
      { segment: S20, coords: null, manual: true },
    ]
    const out = render(HeatBoard, { props: { darts, name: 'Christoph' } }).body
    expect(out).toContain('role="img"')
    expect(out).toMatch(/aria-label="Heatmap of 3 dart positions for Christoph/)
    expect(out.match(/class="heat-dot"/g)).toHaveLength(3)
    expect(out).toContain('Fewer')
    expect(out).toContain('More darts')
    // The legend runs cool to hot: blue first at 0%, red last at 100% (not a solid bar)
    expect(out).toMatch(/linear-gradient\(to right, #2b6cff 0%, [^)]*#ef4444 100%\)/)
    expect(out).not.toContain('No dart positions')
  })

  it('gives each dot a <title> with its dart label, for a native tooltip and assistive tech', () => {
    const T20 = seg('T20', 20, 3)
    const darts: HeatDart[] = [{ segment: T20, coords: { x: 0, y: 0.8 }, manual: false }]
    const out = render(HeatBoard, { props: { darts, name: 'Christoph' } }).body
    expect(out).toContain('<title>T20</title>')
  })

  it('labels a near-miss dot "Miss" instead of the chalkboard dash', () => {
    const miss = seg('–', 20, 0)
    const darts: HeatDart[] = [{ segment: miss, coords: { x: 0, y: 0.9 }, manual: false }]
    const out = render(HeatBoard, { props: { darts, name: 'Christoph' } }).body
    expect(out).toContain('<title>Miss</title>')
  })

  it('shows the hand-entered empty state when every unpositioned dart is manual', () => {
    const darts: HeatDart[] = [{ segment: S20, coords: null, manual: true }]
    const out = render(HeatBoard, { props: { darts, name: 'Christoph' } }).body
    expect(out).toContain('No dart positions — these darts were entered by hand')
  })

  it('shows the plain empty state when an unpositioned dart is a camera bounce-out', () => {
    const bounceOut: HeatDart[] = [{ segment: S20, coords: null, manual: false }]
    const out = render(HeatBoard, { props: { darts: bounceOut, name: 'Christoph' } }).body
    expect(out).toContain('No dart positions')
    expect(out).not.toContain('entered by hand')
  })

  it('shows the plain empty state when unpositioned darts are a mix of manual and camera', () => {
    const mixed: HeatDart[] = [
      { segment: S20, coords: null, manual: true },
      { segment: S20, coords: null, manual: false },
    ]
    const out = render(HeatBoard, { props: { darts: mixed, name: 'Christoph' } }).body
    expect(out).toContain('No dart positions')
    expect(out).not.toContain('entered by hand')
  })

  it('shows "No darts thrown" with no darts at all', () => {
    const out = render(HeatBoard, { props: { darts: [], name: 'Christoph' } }).body
    expect(out).toContain('No darts thrown')
    expect(out).toMatch(/aria-label="No darts thrown for Christoph"/)
  })

  it('widens the viewBox so a wide miss (r ≈ 1.25) still lands inside it', () => {
    // 1.25 board units × 170 mm/unit = 212.5, inside BOARD_VIEW_HALF (235) but outside the old
    // -200..200 box, which used to clip this dart off the board entirely.
    const darts: HeatDart[] = [{ segment: S20, coords: { x: 1.25, y: 0 }, manual: false }]
    const out = render(HeatBoard, { props: { darts, name: 'Christoph' } }).body
    expect(out).toContain('viewBox="-235 -235 470 470"')
    expect(out).toContain('class="heat-dot"')
    expect(out).toMatch(/cx="212\.5"/)
  })

  it('clamps an extreme outlier to the viewBox rim for drawing, instead of dropping it', () => {
    // r = 500/170 ≈ 2.94, far past BOARD_VIEW_HALF; the drawn dot must still sit on the rim.
    const darts: HeatDart[] = [{ segment: S20, coords: { x: 500 / 170, y: 0 }, manual: false }]
    const out = render(HeatBoard, { props: { darts, name: 'Christoph' } }).body
    const cx = out.match(/class="heat-dot"[\s\S]*?cx="(-?[\d.]+)"/)
    expect(cx).not.toBeNull()
    expect(Number(cx![1])).toBeCloseTo(235, 5)
  })
})

describe('HeatmapView', () => {
  const seg = (name: string, number: number, multiplier: 0 | 1 | 2 | 3) => ({
    name,
    number,
    multiplier,
    bed: (multiplier === 0 ? 'Outside' : multiplier === 2 ? 'Double' : multiplier === 3 ? 'Triple' : 'Single') as 'Single',
  })
  const dart = (
    s: ReturnType<typeof seg>,
    coords: { x: number; y: number } | null,
    index = 0,
  ): {
    index: number
    segment: ReturnType<typeof seg>
    coords: { x: number; y: number } | null
    source: 'camera' | 'manual'
    corrected: boolean
    thrownAt: string
  } => ({
    index,
    segment: s,
    coords,
    source: coords ? 'camera' : 'manual',
    corrected: false,
    thrownAt: '',
  })
  const T20 = seg('T20', 20, 3)
  const S5 = seg('S5', 5, 1)
  const S1 = seg('S1', 1, 1)
  const S7 = seg('S7', 7, 1)
  const S9 = seg('S9', 9, 1)

  it('duel with darts: chips, summary and the exact card values for the selected (default) player', () => {
    const d = game(2)
    const seat0Coords = [
      { x: 0, y: 0.85 },
      { x: 0.02, y: 0.86 },
      { x: -0.01, y: 0.87 },
    ]
    d.detail = {
      mode: 'x01',
      legs: [
        {
          leg: 0,
          starter: 0,
          winner: 0,
          visits: [
            {
              visit: 0,
              seat: 0,
              committedAt: '',
              darts: seat0Coords.map((c, i) => dart(T20, c, i)),
              scored: 180,
              remaining: 321,
              bust: false,
            },
            {
              visit: 1,
              seat: 1,
              committedAt: '',
              darts: [dart(S5, { x: 0.3, y: 0.2 }, 0), dart(S1, { x: 0.5, y: -0.1 }, 1)],
              scored: 6,
              remaining: 495,
              bust: false,
            },
          ],
        },
      ],
    }
    // d.game.mySeat is 0 (see `game()`), so seat 0 (three T20s) is the default-selected player.
    const expectedMm = Math.round(groupingMm(seat0Coords.map(c => ({ segment: T20, coords: c, manual: false })))!)
    const out = render(HeatmapView, { props: { detail: d } }).body
    expect(out).toContain('aria-pressed')
    expect(out).toContain('P0')
    expect(out).toContain('P1')
    expect(out).toContain('<strong class="font-semibold text-text">P0</strong> · 1 leg · 3 darts')
    expect(out).toMatch(/In the 20[\s\S]*?>100%</)
    expect(out).toContain('3 of 3')
    expect(out).toMatch(/Trebles[\s\S]*?>3</)
    expect(out).toContain('T20 × 3')
    expect(out).toContain(`${expectedMm} mm`)
    // Neither 1/18 nor 5/12: no miss-side lean at all for this player.
    expect(out).toMatch(/Miss side[\s\S]*?>—</)
    expect(out).toMatch(/Most hit[\s\S]*?T20/)
  })

  it('most hit: every treble bolds regardless of rank, and bars are shaded by share of the first', () => {
    const d = game(2)
    const S20 = seg('S20', 20, 1)
    d.detail = {
      mode: 'x01',
      legs: [
        {
          leg: 0,
          starter: 0,
          winner: null,
          visits: [
            {
              visit: 0,
              seat: 0,
              committedAt: '',
              darts: [
                ...Array.from({ length: 4 }, (_, i) => dart(S20, null, i)),
                ...Array.from({ length: 2 }, (_, i) => dart(T20, null, 4 + i)),
                dart(S5, null, 6),
              ],
              scored: 100,
              remaining: 401,
              bust: false,
            },
          ],
        },
      ],
    }
    const out = render(HeatmapView, { props: { detail: d } }).body
    // S20 ranks first (4 hits) but isn't a treble: medium weight, not bold.
    expect(out).toContain('<span class="font-mono text-[13px] text-ink-2 font-medium">S20</span>')
    // T20 ranks second (2 hits) but is a treble: bold, regardless of rank.
    expect(out).toContain('<span class="font-mono text-[13px] text-text font-bold">T20</span>')
    // Its bar is half the width of the first (2 of 4 hits); opacity follows 0.35 + 0.65 × ratio,
    // the floor that keeps the smallest bar readable.
    expect(out).toMatch(/T20[\s\S]*?width: 50%; opacity: 0\.675/)
  })

  it('a player with no trebles, no 20s or miss-side numbers, and fewer than 3 positions: the dash branches', () => {
    const d = game(2)
    d.detail = {
      mode: 'x01',
      legs: [
        {
          leg: 0,
          starter: 0,
          winner: null,
          visits: [
            {
              visit: 0,
              seat: 0,
              committedAt: '',
              darts: [dart(S7, { x: 0.1, y: 0.1 }, 0), dart(S9, { x: -0.1, y: 0.1 }, 1)],
              scored: 16,
              remaining: 485,
              bust: false,
            },
          ],
        },
      ],
    }
    const out = render(HeatmapView, { props: { detail: d } }).body
    // In the 20: 0 of 2 (a real value, not a dash — these darts exist, just not in the 20).
    expect(out).toMatch(/In the 20[\s\S]*?>0%</)
    expect(out).toContain('0 of 2')
    // Trebles: count 0, and its sub ("—") immediately follows.
    expect(out).toMatch(/Trebles[\s\S]*?>0<[\s\S]*?>—</)
    // Miss side: neither 1/18 nor 5/12 was hit.
    expect(out).toMatch(/Miss side[\s\S]*?>—<[\s\S]*?>—</)
    // Grouping: only 2 positioned darts, below the 3-dart floor.
    expect(out).toMatch(/Grouping[\s\S]*?>—</)
  })

  it('teams: Team A and Team B headings group the right players under each', () => {
    const d = game(4)
    d.detail = {
      mode: 'x01',
      teams: [
        { id: 'A', name: 'Team A', seats: [0, 2] },
        { id: 'B', name: 'Team B', seats: [1, 3] },
      ],
      legs: [],
    }
    const out = render(HeatmapView, { props: { detail: d } }).body
    const aIdx = out.indexOf('Team A')
    const bIdx = out.indexOf('Team B')
    const chipsEnd = out.indexOf('@container')
    expect(aIdx).toBeGreaterThanOrEqual(0)
    expect(bIdx).toBeGreaterThan(aIdx)
    expect(chipsEnd).toBeGreaterThan(bIdx)
    const teamASection = out.slice(aIdx, bIdx)
    const teamBSection = out.slice(bIdx, chipsEnd)
    expect(teamASection).toContain('P0')
    expect(teamASection).toContain('P2')
    expect(teamASection).not.toContain('P1')
    expect(teamASection).not.toContain('P3')
    expect(teamBSection).toContain('P1')
    expect(teamBSection).toContain('P3')
    expect(teamBSection).not.toContain('P0')
    expect(teamBSection).not.toContain('P2')
  })

  it('a player with only manual darts: the summary line ends with the hand-entered note', () => {
    const d = game(2)
    d.detail = {
      mode: 'x01',
      legs: [
        {
          leg: 0,
          starter: 0,
          winner: null,
          visits: [
            {
              visit: 0,
              seat: 0,
              committedAt: '',
              darts: [dart(T20, null, 0), dart(S5, null, 1)],
              scored: 65,
              remaining: 436,
              bust: false,
            },
          ],
        },
      ],
    }
    const out = render(HeatmapView, { props: { detail: d } }).body
    expect(out).toContain('entered by hand, not on the board</p>')
  })

  it('a forfeit before any visit: the summary reads "No darts thrown", not "All 0 legs"', () => {
    const d = game(2)
    d.detail = { mode: 'x01', legs: [] }
    const out = render(HeatmapView, { props: { detail: d } }).body
    expect(out).toContain('<strong class="font-semibold text-text">P0</strong> · No darts thrown')
    expect(out).not.toContain('All 0 legs')
    // The board's aria label matches the visible overlay text instead of disagreeing with it.
    expect(out).toMatch(/aria-label="No darts thrown for P0"/)
    expect(out).toContain('>No darts thrown<')
  })
})
