import { describe, expect, it } from 'vitest'
import { render } from 'svelte/server'
import type { DungeonEnemy, DungeonGame } from '$lib/api/game-ws'
import BattleScreen from '$lib/components/dungeon/BattleScreen.svelte'
import EventScreen from '$lib/components/dungeon/EventScreen.svelte'
import RestScreen from '$lib/components/dungeon/RestScreen.svelte'
import RunEndScreen from '$lib/components/dungeon/RunEndScreen.svelte'
import TreasureScreen from '$lib/components/dungeon/TreasureScreen.svelte'
import { dungeonSlots } from '$lib/dartSlots'
import { choosesFor, enemyTurnLines, eventOutcomeLines, freshEvent, litPath, traceLines } from '$lib/dungeon/battle'
import { resolveVisit } from '$shared/dungeon/resolve'
import type { Segment } from '$lib/api'
import type { Enemy, Hero } from '$shared/dungeon/state'

const names = ['Lena', 'Max']
const hero = (seat: number, over: Partial<Hero> = {}): Hero => ({
  seat,
  classId: 'brawler',
  healSegment: null,
  hp: 70,
  maxHp: 80,
  block: 0,
  artifacts: [],
  ...over,
})
const slime: Enemy = { uid: 'e0', kind: 'slime', hp: 40, maxHp: 40, burn: 0, chilled: false }
const skeleton: Enemy = { uid: 'e1', kind: 'skeleton', hp: 30, maxHp: 30, burn: 0, chilled: false }
const view = (e: Enemy): DungeonEnemy => ({
  ...e,
  intent: { kind: 'attack', value: 6, pierce: false },
  weak: [{ ring: 'double' }],
  resist: [],
  immune: [{ number: 7 }],
})
const dart = (name: string, number: number, multiplier: 0 | 1 | 2 | 3, score: number): { segment: Segment; score: number } => ({
  segment: {
    name,
    number,
    multiplier,
    bed: multiplier === 0 ? 'Outside' : multiplier === 3 ? 'Triple' : multiplier === 2 ? 'Double' : 'SingleOuter',
  },
  score,
})

// A real trace: S19 then D20 then a miss by a Brawler with the Whetstone Rune on 19
const resolved = resolveVisit({
  seat: 0,
  visit: [
    { number: 19, ring: 'single', score: 19 },
    { number: 20, ring: 'double', score: 40 },
    { number: 0, ring: 'miss', score: 0 },
  ],
  heroes: [hero(0), hero(1)],
  enemies: [slime, skeleton],
  items: [{ number: 19, item: 'whetstoneRune' }],
  gold: 0,
})

const game = (over: Partial<DungeonGame> = {}): DungeonGame => ({
  phase: 'battle',
  difficulty: 'medium',
  floors: 9,
  floor: 2,
  room: 'left',
  cleared: 1,
  map: [],
  votes: [null, null],
  currentPlayer: 0,
  nextPlayer: 1,
  winner: null,
  outcome: null,
  visitLocked: false,
  gold: 12,
  heroes: [hero(0, { block: 5, artifacts: ['pinCushion'] }), hero(1)],
  items: [{ number: 19, item: 'whetstoneRune' }],
  battle: { room: 'fight', round: 2, target: 'e0', enemies: [view(slime), view(skeleton)], lastEnemyTurn: null },
  trace: null,
  offers: null,
  event: null,
  lastEvent: null,
  lastHeal: null,
  damage: [0, 0],
  bestVisit: [0, 0],
  currentVisitDarts: [],
  totalDarts: [0, 0],
  totalVisits: [0, 0],
  ...over,
})

const controls = {
  canThrow: true,
  locked: false,
  canUndo: true,
  next: { label: 'Next player', prominent: true, enabled: true },
  onUndo: () => {},
  onNext: () => {},
  onBoardClick: () => {},
  onCorrect: () => {},
  layout: 'duel' as const,
}
const send = () => {}
const fight = (g: DungeonGame) => {
  if (!g.battle) throw new Error('not a fight')
  return { game: g, battle: g.battle, names, ...controls }
}

describe('the battle log', () => {
  it('writes each dart with what fired, the damage and the kill, then the total', () => {
    const lines = traceLines(resolved.trace, 'Lena', [slime, skeleton])
    expect(lines[0]).toBe('Lena throws S19. Whetstone Rune +10, Brawler x1.5, Weak x2: 87 damage to Slime, killed.')
    expect(lines.some(l => l.includes('killed'))).toBe(true)
    expect(lines.at(-1)).toBe(`Visit: ${resolved.trace.total} damage.`)
  })
  it('says who the enemies hit and what block took', () => {
    const log = {
      attacks: [
        {
          uid: 'e0',
          hits: [
            { seat: 0, blocked: 4, damage: 2 },
            { seat: 1, blocked: 0, damage: 6 },
          ],
        },
      ],
      burns: [{ uid: 'e1', damage: 3 }],
    }
    expect(enemyTurnLines(log, names, [slime, skeleton])).toEqual([
      'Slime attacks: Lena takes 2 (4 blocked), Max takes 6.',
      'Skeleton burns for 3.',
    ])
  })
  it("names an event's decision and what it placed", () => {
    expect(
      eventOutcomeLines(
        { id: 'placeholderForge', decision: 1, cleared: 3, items: [{ number: 5, item: 'stoneWall' }], artifacts: [] },
        names,
      ),
    ).toEqual(['The party chose: Take the Stone Wall.', 'Stone Wall is now on 5.'])
  })
})

describe('the last event', () => {
  it('is news until the party clears another room', () => {
    const lastEvent = { id: 'placeholderShrine', decision: 0, cleared: 2, items: [], artifacts: [] }
    expect(freshEvent({ lastEvent, cleared: 2 })).toBe(lastEvent)
    expect(freshEvent({ lastEvent, cleared: 3 })).toBeNull()
  })
})

describe('board and slots', () => {
  it('lights the ring a dart hit: one wedge for a treble, both single beds for a single, nothing for a miss', () => {
    expect(litPath(20, 'treble')?.match(/Z/g)).toHaveLength(1)
    expect(litPath(20, 'single')?.match(/Z/g)).toHaveLength(2)
    expect(litPath(0, 'miss')).toBeNull()
  })
  it('shows the score until the visit resolved, then the damage', () => {
    const darts = [dart('S19', 19, 1, 19)]
    expect(dungeonSlots({ darts, damage: null })[0].points).toBe('19')
    expect(dungeonSlots({ darts, damage: [44] })[0].points).toBe('44 dmg')
    expect(dungeonSlots({ darts, damage: null })).toHaveLength(3)
  })
  it('lets the host or the seat’s controller choose, never the big screen', () => {
    expect(choosesFor(1, { mySeats: [1], host: false, viewOnly: false })).toBe(true)
    expect(choosesFor(1, { mySeats: [0], host: true, viewOnly: false })).toBe(true)
    expect(choosesFor(1, { mySeats: [0], host: false, viewOnly: false })).toBe(false)
    expect(choosesFor(1, { mySeats: [1], host: true, viewOnly: true })).toBe(false)
  })
})

describe('BattleScreen', () => {
  it('shows whose visit it is, the enemies with intent, status and defences, and what is left to kill', () => {
    const out = render(BattleScreen, {
      props: { ...fight(game({ battle: { ...game().battle!, enemies: [{ ...view(slime), burn: 4, chilled: true }, view(skeleton)] } })) },
    }).body
    expect(out).toContain('Lena throws')
    expect(out).toContain('Round 2')
    expect(out).toContain('Next: attacks 6')
    expect(out).toContain('Burn 4')
    expect(out).toContain('Chilled')
    expect(out).toContain('Weak: doubles · Immune: 7')
    expect(out).toContain('40 to kill')
    expect(out).toContain('5 block')
  })
  it('lights each thrown dart and, once resolved, lists the visit and its damage per dart', () => {
    const darts = [dart('S19', 19, 1, 19), dart('D20', 20, 2, 40), dart('Miss', 0, 0, 0)]
    const out = render(BattleScreen, {
      props: { ...fight(game({ visitLocked: true, trace: resolved.trace, currentVisitDarts: darts })) },
    }).body
    expect(out.match(/data-testid="lit-segment"/g)).toHaveLength(2)
    expect(out).toContain('This visit')
    expect(out).toContain(`Lena: ${resolved.trace.total} damage`)
    expect(out).toContain(`${resolved.trace.darts[0].damage} dmg`)
    expect(out).not.toContain('to kill')
  })
  it('marks the boss and shows the last enemy turn', () => {
    const lastEnemyTurn = { attacks: [{ uid: 'e0', hits: [{ seat: 1, blocked: 0, damage: 9 }] }], burns: [] }
    const out = render(BattleScreen, { props: { ...fight(game({ battle: { ...game().battle!, room: 'boss', lastEnemyTurn } })) } }).body
    expect(out).toContain('Boss')
    expect(out).toContain('Slime attacks: Max takes 9.')
  })
  it('hides Undo and Next on the big screen', () => {
    const out = render(BattleScreen, { props: { ...fight(game()), viewOnly: true } }).body
    expect(out).not.toContain('Next player')
  })
})

describe('room screens', () => {
  const offers = [['pinCushion', 'twinBuckler'], ['pinCushion']]
  it('treasure: my seat gets Take, another seat waits', () => {
    const out = render(TreasureScreen, {
      props: { game: game({ phase: 'treasure', battle: null, offers }), names, mySeats: [0], host: false, viewOnly: false, send },
    }).body
    expect(out).toContain('Lena picks')
    expect(out).toContain('Max is choosing…')
    expect(out.match(/>Take</g)).toHaveLength(2)
    expect(out).toContain('Pin Cushion')
  })
  it('rest: the hero up heals by the visit so far, capped at max HP', () => {
    const out = render(RestScreen, {
      props: {
        game: game({ phase: 'rest', battle: null, currentVisitDarts: [dart('T20', 20, 3, 60)], lastHeal: { seat: 1, amount: 7 } }),
        names,
        ...controls,
      },
    }).body
    expect(out).toContain('Lena rests · heals 10')
    expect(out).toContain('Max healed 7.')
  })
  it('event: the text, the decisions with their voters, and Vote for my seat that has not voted', () => {
    const g = game({ phase: 'event', battle: null, event: { id: 'placeholderShrine', votes: [null, 2] } })
    const out = render(EventScreen, { props: { game: g, names, mySeats: [0], host: false, viewOnly: false, send } }).body
    expect(out).toContain('A cracked shrine hums')
    expect(out).toContain('1 of 2 voted · Lena votes')
    expect(out.match(/>Vote</g)).toHaveLength(3)
    const watching = render(EventScreen, { props: { game: g, names, mySeats: [], host: false, viewOnly: false, send } }).body
    expect(watching).toContain('waiting for the party')
    expect(watching).not.toContain('>Vote<')
  })
  it('victory waits for Finish, then links Back to Play and the summary', () => {
    const won = game({ phase: 'ended', outcome: 'victory', winner: 0, battle: null, trace: resolved.trace })
    const props = { game: won, names, sessionId: 's1', ...controls, next: { label: 'Finish', prominent: true, enabled: true } }
    const waiting = render(RunEndScreen, { props: { ...props, status: 'active' as const } }).body
    expect(waiting).toContain('Victory')
    expect(waiting).toContain('Finish')
    expect(waiting).toContain('Lena throws S19')
    const done = render(RunEndScreen, { props: { ...props, status: 'finished' as const } }).body
    expect(done).toContain('href="#/play"')
    expect(done).toContain('href="#/stats/history/s1"')
  })
  it('defeat says the party fell', () => {
    const out = render(RunEndScreen, {
      props: { game: game({ phase: 'ended', outcome: 'defeat', battle: null }), names, sessionId: 's1', status: 'finished', ...controls },
    }).body
    expect(out).toContain('Defeat')
    expect(out).toContain('The party has fallen.')
  })
})
