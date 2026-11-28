// A two-hero Dungeon fight for the battle screen's tests: Lena and Max, a slime and a skeleton, and a
// real trace (S19, D20, a miss by a Brawler with the Whetstone Rune on 19)
import type { DungeonEnemy, DungeonGame } from '$lib/api/game-ws'
import type { Segment } from '$lib/api'
import { resolveVisit } from '$shared/dungeon/resolve'
import type { Enemy, Hero } from '$shared/dungeon/state'

export const names = ['Lena', 'Max']
export const hero = (seat: number, over: Partial<Hero> = {}): Hero => ({
  seat,
  classId: 'brawler',
  healSegment: null,
  hp: 70,
  maxHp: 80,
  block: 0,
  artifacts: [],
  ...over,
})
export const slime: Enemy = { uid: 'e0', kind: 'slime', hp: 40, maxHp: 40, burn: 0, chilled: false }
export const skeleton: Enemy = { uid: 'e1', kind: 'skeleton', hp: 30, maxHp: 30, burn: 0, chilled: false }
export const view = (e: Enemy): DungeonEnemy => ({
  ...e,
  intent: { kind: 'attack', name: 'Slime Slam', value: 6, pierce: false },
  weak: [{ ring: 'double' }],
  resist: [],
  immune: [{ number: 7 }],
})
export const dart = (name: string, number: number, multiplier: 0 | 1 | 2 | 3, score: number): { segment: Segment; score: number } => ({
  segment: {
    name,
    number,
    multiplier,
    bed: multiplier === 0 ? 'Outside' : multiplier === 3 ? 'Triple' : multiplier === 2 ? 'Double' : 'SingleOuter',
  },
  score,
})

export const resolved = resolveVisit({
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

export const game = (over: Partial<DungeonGame> = {}): DungeonGame => ({
  phase: 'battle',
  difficulty: 'medium',
  floors: 9,
  floor: 2,
  room: 0,
  path: [0],
  cleared: 1,
  map: { lanes: 1, floors: [] },
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
  lastReward: null,
  summary: null,
  currentVisitDarts: [],
  totalDarts: [0, 0],
  totalVisits: [0, 0],
  ...over,
})

export const controls = {
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
export const send = () => {}
export const fight = (g: DungeonGame) => {
  if (!g.battle) throw new Error('not a fight')
  return { game: g, battle: g.battle, names, ...controls }
}
