import { describe, expect, it } from 'vitest'
import { render } from 'svelte/server'
import type { DungeonGame, DungeonSummary } from '$lib/api/game-ws'
import MapScreen from '$lib/components/dungeon/MapScreen.svelte'
import PartyScreen from '$lib/components/dungeon/PartyScreen.svelte'
import RunSummary from '$lib/components/dungeon/RunSummary.svelte'

const names = ['Christoph', 'Lena', 'Max']
const hero = (seat: number, classId: string | null, hp = 80) => ({
  seat,
  classId,
  healSegment: null,
  hp,
  maxHp: 80,
  block: 0,
  artifacts: classId ? ['pinCushion'] : [],
})
const game = (over: Partial<DungeonGame> = {}): DungeonGame => ({
  phase: 'setup',
  difficulty: 'medium',
  floors: 9,
  floor: 0,
  room: null,
  path: [],
  cleared: 0,
  map: { lanes: 5, floors: [] },
  votes: [null, null, null],
  currentPlayer: 0,
  nextPlayer: 0,
  winner: null,
  outcome: null,
  visitLocked: true,
  gold: 0,
  heroes: [hero(0, 'brawler'), hero(1, 'healer'), hero(2, null)],
  items: [],
  battle: null,
  trace: null,
  offers: null,
  event: null,
  lastEvent: null,
  lastHeal: null,
  lastReward: null,
  summary: null,
  currentVisitDarts: [],
  totalDarts: [0, 0, 0],
  totalVisits: [0, 0, 0],
  ...over,
})
const send = () => {}

describe('PartyScreen', () => {
  it('marks taken classes with their hero, offers the rest, and waits for whoever is still picking', () => {
    const out = render(PartyScreen, { props: { game: game(), names, mySeats: [0, 1, 2], host: true, viewOnly: false, send } }).body
    expect(out).toContain('Choose your hero')
    expect(out).toContain('Pick for Max')
    expect(out).toContain('Waiting for Max to pick a hero.')
    // Max has no class yet: the host can't start
    expect(out).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>)[\s\S])*Start run<\/button>/)
  })
  it('lets only the host change the run and start it', () => {
    const ready = game({ heroes: [hero(0, 'brawler'), hero(1, 'healer'), hero(2, 'archer')] })
    const guest = render(PartyScreen, { props: { game: ready, names, mySeats: [2], host: false, viewOnly: false, send } }).body
    expect(guest).not.toContain('Start run')
    expect(guest).toContain('Waiting for the host to start.')
    expect(render(PartyScreen, { props: { game: ready, names, mySeats: [], host: true, viewOnly: false, send } }).body).toContain(
      'Everyone is ready.',
    )
  })
})

describe('MapScreen', () => {
  const map: DungeonGame['map'] = {
    lanes: 5,
    floors: [
      [{ lane: 2, type: 'fight' }],
      [
        { lane: 1, type: 'elite' },
        { lane: 3, type: 'treasure' },
      ],
      [{ lane: 2, type: 'boss' }],
    ],
  }
  const props = {
    names,
    viewOnly: false,
    keypad: false,
    canThrow: true,
    locked: false,
    canUndo: false,
    next: { label: 'Next player', prominent: false, enabled: false },
    onUndo: send,
    onNext: send,
    onBoardClick: send,
    onDart: send,
  }
  it('shows the map, the party, the two ways up and who voted for which', () => {
    const g = game({
      phase: 'map',
      map,
      floor: 1,
      room: 2,
      path: [2],
      votes: ['left', null, null],
      currentPlayer: 1,
      heroes: [hero(0, 'brawler'), hero(1, 'healer'), hero(2, 'archer')],
    })
    const out = render(MapScreen, { props: { ...props, game: g } }).body
    expect(out).toContain('Act 1 · Floor 1 cleared')
    expect(out).toContain('1 of 3 voted')
    expect(out).toContain('Lena throws')
    expect(out).toContain('data-side="left"')
    expect(out).toContain('Leading · 1 vote')
    expect(out).toContain('data-room="treasure" data-state="next"')
    expect(out).toContain('data-room="fight" data-state="here"')
    expect(out).toContain('You are here')
  })
})

describe('RunSummary', () => {
  const summary = (outcome: DungeonSummary['outcome']): DungeonSummary => ({
    outcome,
    difficulty: 'medium',
    floors: 5,
    cleared: outcome === 'victory' ? 5 : 3,
    gold: 207,
    path: [
      { lane: 2, type: 'fight' },
      { lane: 1, type: 'elite' },
    ],
    heroes: [
      {
        ...hero(0, 'brawler'),
        damage: 4820,
        bestVisit: 743,
        healed: 0,
        blocked: 210,
        bestDart: { number: 20, ring: 'double', damage: 660 },
        damageByFloor: [100, 300],
      },
      { ...hero(1, 'healer'), damage: 2310, bestVisit: 312, healed: 640, blocked: 95, bestDart: null, damageByFloor: [50] },
    ],
    best: {
      seat: 0,
      darts: [
        { number: 19, ring: 'single' },
        { number: 11, ring: 'single' },
        { number: 20, ring: 'double' },
      ],
      damage: 743,
      enemy: 'dungeonWarden',
    },
  })
  it('a won run: the result, the totals, the MVP and the best visit', () => {
    const out = render(RunSummary, { props: { summary: summary('victory'), names, darts: [120, 123], timeMs: 41 * 60_000 + 12_000 } }).body
    expect(out).toContain('Victory')
    expect(out).toContain('5 / 5')
    expect(out).toContain('7,130')
    expect(out).toContain('243')
    expect(out).toContain('D20 · 660')
    expect(out).toContain('MVP')
    expect(out).toContain('Christoph · S19, S11, D20 · 743 damage to the Dungeon Warden')
  })
  it('a lost or given-up run says so, and an unknown time is a dash', () => {
    expect(render(RunSummary, { props: { summary: summary('defeat'), names, darts: [0, 0] } }).body).toContain('Defeat')
    const given = render(RunSummary, { props: { summary: summary(null), names, darts: [0, 0] } }).body
    expect(given).toContain('Given up')
    expect(given).toContain('–')
  })
})
