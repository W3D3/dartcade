// The playground's machine: a setup plus a log of actions folds into one state, with the engine's own
// `resolveVisit` and `enemyTurn`. The state holds no function and no clock, so the same setup and log
// always give the same state (the seed only feeds the random throws, one draw each).
import { drawFrom, pick } from '$shared/rng.js'
import type { Hit } from '$shared/dungeon/hit.js'
import { enemyTurn, type EnemyTurnLog } from '$shared/dungeon/enemyTurn.js'
import { resolveVisit, type Trace } from '$shared/dungeon/resolve.js'
import { DUNGEON_RULES, rulesOf } from '$shared/dungeon/rules.js'
import { alive, type Enemy, type Hero, type PlacedItem } from '$shared/dungeon/state.js'
import { BULLSEYE, OUTER_BULL, onNumber } from './script.js'
import { enemiesOf, heroesOf, itemsOf, type Setup } from './setup.js'

export type Action =
  | { t: 'dart'; hit: Hit }
  | { t: 'random' }
  | { t: 'undo' }
  | { t: 'clear' }
  | { t: 'end' }
  | { t: 'enemyTurn' }
  | { t: 'seat'; seat: number }

export type Snapshot = { heroes: Hero[]; enemies: Enemy[]; gold: number; items: PlacedItem[] }

export type PState = Snapshot & {
  round: number
  /** The hero throwing. */
  seat: number
  /** The open visit's darts. */
  visit: Hit[]
  /** Draws the seed's generator made so far (a position, so a replay draws the same darts). */
  rng: number
  /** The last visit's trace and the state before it, for the diff. */
  trace: Trace | null
  traceSeat: number | null
  before: Snapshot | null
  /** The last enemy turn and the state before it. */
  turn: EnemyTurnLog | null
  turnBefore: Snapshot | null
}

const snap = (s: Snapshot): Snapshot => structuredClone({ heroes: s.heroes, enemies: s.enemies, gold: s.gold, items: s.items })

export function initial(setup: Setup): PState {
  const heroes = heroesOf(setup)
  return {
    heroes,
    enemies: enemiesOf(setup),
    gold: setup.gold,
    items: itemsOf(setup),
    round: setup.round,
    seat: Math.max(0, heroes.findIndex(alive)),
    visit: [],
    rng: setup.seed,
    trace: null,
    traceSeat: null,
    before: null,
    turn: null,
    turnBefore: null,
  }
}

/** A random dart: a number or a bull or a miss, and a ring, from the generator at `position`. */
export function randomHit(position: number): { hit: Hit; position: number } {
  const g = drawFrom(position)
  const slot = pick(g.rng, 22)
  const ring = pick(g.rng, 10)
  const hit =
    slot === 20
      ? ring < 7
        ? OUTER_BULL
        : BULLSEYE
      : slot === 21
        ? { number: 0, ring: 'miss' as const, score: 0 }
        : onNumber(slot + 1, ring < 6 ? 1 : ring < 8 ? 2 : 3)
  return { hit, position: g.position() }
}

const firstLiving = (heroes: Hero[], after = -1): number => {
  const later = heroes.find(h => alive(h) && h.seat > after)
  return later ? later.seat : Math.max(0, heroes.findIndex(alive))
}

export function step(setup: Setup, s: PState, a: Action): PState {
  const rules = rulesOf(setup.cfg)
  switch (a.t) {
    case 'seat':
      return s.heroes[a.seat] ? { ...s, seat: a.seat, visit: [] } : s
    case 'dart':
      return s.visit.length < rules.dartsPerVisit ? { ...s, visit: [...s.visit, a.hit] } : s
    case 'random': {
      if (s.visit.length >= rules.dartsPerVisit) return s
      const r = randomHit(s.rng)
      return { ...s, rng: r.position, visit: [...s.visit, r.hit] }
    }
    case 'undo':
      return s.visit.length ? { ...s, visit: s.visit.slice(0, -1) } : s
    case 'clear':
      return s.visit.length ? { ...s, visit: [] } : s
    case 'end': {
      if (!s.visit.length || !s.heroes[s.seat]) return s
      const before = snap(s)
      const r = resolveVisit({ seat: s.seat, visit: s.visit, heroes: s.heroes, enemies: s.enemies, items: s.items, gold: s.gold })
      return {
        ...s,
        heroes: r.heroes,
        enemies: r.enemies,
        gold: r.gold,
        visit: [],
        trace: r.trace,
        traceSeat: s.seat,
        before,
        seat: firstLiving(r.heroes, s.seat),
      }
    }
    case 'enemyTurn': {
      const turnBefore = snap(s)
      const r = enemyTurn(s.heroes, s.enemies, s.round, setup.cfg.difficulty, rules)
      return {
        ...s,
        heroes: r.heroes,
        enemies: r.enemies,
        round: s.round + 1,
        visit: [],
        turn: r.log,
        turnBefore,
        seat: firstLiving(r.heroes),
      }
    }
  }
}

export const replay = (setup: Setup, log: readonly Action[]): PState => log.reduce((s, a) => step(setup, s, a), initial(setup))

/** Replays the log twice from the seed and compares the whole state: a hook that reads a clock or `Math.random` fails it. */
export function determinism(setup: Setup, log: readonly Action[]): { ok: boolean; detail: string } {
  const a = JSON.stringify(replay(setup, log))
  const b = JSON.stringify(replay(setup, log))
  return a === b
    ? { ok: true, detail: `Two replays of ${log.length} actions gave the same state (${a.length} characters).` }
    : { ok: false, detail: 'The two replays differ: some hook is not a pure function of its context.' }
}

export type Change = { what: string; before: string; after: string }

/** What a step changed: HP, block, burn, chill, gold and the board's items. */
export function diff(before: Snapshot, after: Snapshot): Change[] {
  const out: Change[] = []
  const add = (what: string, b: unknown, a: unknown) => {
    if (String(b) !== String(a)) out.push({ what, before: String(b), after: String(a) })
  }
  after.heroes.forEach((h, i) => {
    const b = before.heroes.at(i)
    if (!b) return
    add(`Hero ${i + 1} HP`, b.hp, h.hp)
    add(`Hero ${i + 1} block`, b.block, h.block)
  })
  after.enemies.forEach((e, i) => {
    const b = before.enemies.at(i)
    if (!b) return
    add(`Enemy ${i + 1} HP`, b.hp, e.hp)
    add(`Enemy ${i + 1} burn`, b.burn, e.burn)
    add(`Enemy ${i + 1} chilled`, b.chilled, e.chilled)
  })
  add('Gold', before.gold, after.gold)
  const key = (it: PlacedItem) => `${it.item}@${it.number}`
  add('Board items', before.items.map(key).join(' ') || 'none', after.items.map(key).join(' ') || 'none')
  return out
}

export const DARTS_PER_VISIT = DUNGEON_RULES.dartsPerVisit
