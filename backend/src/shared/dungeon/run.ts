// A run as a pure state machine. Its scene says where the party is (setup, map, battle, treasure, rest,
// event, ended) and holds only that scene's data. Darts arrive one by one and a visit ends with the
// takeout; choices (class, treasure pick, event vote) arrive between visits. All randomness comes from
// the generator position stored in `rng`.
import { ARTIFACT_IDS, type ArtifactId } from './content/artifacts.js'
import { CLASSES, isClassId, modifiersOf } from './content/classes.js'
import { ENEMIES, type EnemyId } from './content/enemies.js'
import { EVENTS, EVENT_IDS, type EventId, type Outcome } from './content/events.js'
import { encounterPool, isBattleRoom, type BattleRoom } from './content/rooms.js'
import { enemyTurn, type EnemyTurnLog } from './enemyTurn.js'
import { sideOf, type Hit, type Ring, type Side } from './hit.js'
import { generateMap, roomsAbove, tally, type DungeonMap, type MapRoom } from './map.js'
import { resolveVisit, type Trace, type TraceDart, type VisitResult } from './resolve.js'
import { enemyHp, rulesOf, type DungeonConfig } from './rules.js'
import { alive, type Enemy, type Hero, type PlacedItem } from './state.js'
import { drawFrom, pick, type Rng } from '../rng.js'

export type Battle = {
  room: BattleRoom
  enemies: Enemy[]
  round: number
  /** The open visit was resolved at its last dart; the takeout only passes the turn. */
  resolved: boolean
  lastEnemyTurn: EnemyTurnLog | null
}

export type Scene =
  | { phase: 'setup' }
  | { phase: 'map'; votes: (Side | null)[] }
  | { phase: 'battle'; battle: Battle }
  /** Each seat's artifacts to pick from; null once picked (or for a downed hero). */
  | { phase: 'treasure'; offers: (ArtifactId[] | null)[] }
  | { phase: 'rest' }
  | { phase: 'event'; event: EventId; votes: (number | null)[] }
  | { phase: 'ended'; outcome: 'victory' | 'defeat' }

export type Phase = Scene['phase']

/** A hero's numbers for the run summary. */
export type SeatStats = {
  damage: number
  bestVisit: number
  /** HP their effects (and their rest) restored, across the party. */
  healed: number
  /** Block their effects gave, across the party. */
  blocked: number
  bestDart: { number: number; ring: Ring; damage: number } | null
  /** Damage per floor, from floor 1. */
  damageByFloor: number[]
}

/** The run's best visit, for the summary. */
export type BestVisit = { seat: number; darts: { number: number; ring: Ring }[]; damage: number; enemy: EnemyId | null }

/** What the last event did, for the screen; `cleared` is the run's rooms cleared once it was over, so it is news until another room is. */
export type EventResult = {
  id: EventId
  decision: number
  cleared: number
  items: PlacedItem[]
  artifacts: { seat: number; artifact: ArtifactId }[]
}

export type RunState = {
  cfg: DungeonConfig
  /** The generator's position (`drawFrom` in shared/rng.ts). */
  rng: number
  map: DungeonMap
  /** The floor the party is on (1-based); 0 before the first room. */
  floor: number
  /** The lane of the room the party is in; null before the first room. */
  room: number | null
  /** The lane of the room taken on each floor, from floor 1. */
  path: number[]
  /** Rooms finished. */
  cleared: number
  scene: Scene
  /** The seat that is up (in setup, treasure and event: the first who still has to choose). */
  turn: number
  heroes: Hero[]
  /** Shared by the party. */
  gold: number
  items: PlacedItem[]
  /** The open visit's darts. */
  visit: Hit[]
  trace: Trace | null
  lastEvent: EventResult | null
  lastHeal: { seat: number; amount: number } | null
  stats: SeatStats[]
  best: BestVisit | null
}

// Runs `fn` with the state's generator; returns its result and where the generator stopped
function withRng<T>(s: RunState, fn: (rng: Rng) => T): [T, number] {
  const g = drawFrom(s.rng)
  const value = fn(g.rng)
  return [value, g.position()]
}

const living = (s: RunState) => s.heroes.filter(alive)
const firstLiving = (s: RunState) => living(s)[0]?.seat ?? 0

/** The next living seat after `seat`; `wrapped` when the round is over. */
function nextLiving(s: RunState, seat: number): { seat: number; wrapped: boolean } {
  const later = living(s).find(h => h.seat > seat)
  return later ? { seat: later.seat, wrapped: false } : { seat: firstLiving(s), wrapped: true }
}

/** A new run in setup: the heroes pick classes, then the host starts it (`beginRun`). Difficulty and length are the lobby's config. */
export function startRun(cfg: DungeonConfig, seats: number, seed: number): RunState {
  const startHp = rulesOf(cfg).startHp
  const perSeat = <T>(value: () => T) => Array.from({ length: seats }, value)
  return {
    cfg,
    rng: seed >>> 0,
    map: { lanes: rulesOf(cfg).map.lanes, floors: [] },
    floor: 0,
    room: null,
    path: [],
    cleared: 0,
    scene: { phase: 'setup' },
    turn: 0,
    heroes: perSeat(() => null).map((_, seat) => ({
      seat,
      classId: null,
      healSegment: null,
      hp: startHp,
      maxHp: startHp,
      block: 0,
      artifacts: [],
    })),
    gold: 0,
    items: [],
    visit: [],
    trace: null,
    lastEvent: null,
    lastHeal: null,
    stats: perSeat(() => ({ damage: 0, bestVisit: 0, healed: 0, blocked: 0, bestDart: null, damageByFloor: [] })),
    best: null,
  }
}

/** The host starts the run once every hero has a class: the map is drawn and the party stands below floor 1. */
export function beginRun(s: RunState): RunState {
  if (s.scene.phase !== 'setup' || s.heroes.some(h => h.classId === null)) return s
  const startHp = rulesOf(s.cfg).startHp
  const heroes = s.heroes.map(h => {
    const maxHp = Math.round(startHp * (modifiersOf(h.classId).maxHp ?? 1))
    return { ...h, hp: maxHp, maxHp }
  })
  const [map, rng] = withRng(s, r => generateMap(s.cfg.floors, r, rulesOf(s.cfg)))
  return toMap({ ...s, rng, map, heroes })
}

/** A hero picks a class nobody else has (again, until the run starts) and gets its starting artifact; the Healer names its number. */
export function pickClass(s: RunState, seat: number, classId: string, healSegment: number | null): RunState {
  if (s.scene.phase !== 'setup' || !s.heroes[seat] || !isClassId(classId)) return s
  const heals = classId === 'healer'
  if (heals && !(healSegment !== null && Number.isInteger(healSegment) && healSegment >= 1 && healSegment <= 20)) return s
  if (s.heroes.some(h => h.seat !== seat && h.classId === classId)) return s
  const picked = (h: Hero): Hero => ({
    ...h,
    classId,
    healSegment: heals ? healSegment : null,
    artifacts: [CLASSES[classId].startingArtifact],
  })
  const heroes = s.heroes.map(h => (h.seat === seat ? picked(h) : h))
  const waiting = heroes.find(h => h.classId === null)
  return { ...s, heroes, turn: waiting?.seat ?? s.turn }
}

// To the map: with only one way up (floor 1, the boss, a room on the edge) the party goes there without a vote
function toMap(s: RunState): RunState {
  const base: RunState = { ...s, scene: { phase: 'map', votes: s.heroes.map(() => null) }, turn: firstLiving(s), visit: [] }
  const ways = Object.values(roomsAbove(s.map, s.floor, s.room))
  return ways.length === 1 ? enterRoom(base, ways[0]) : base
}

const finishRoom = (s: RunState): RunState => toMap({ ...s, cleared: s.cleared + 1 })

function enterRoom(s: RunState, room: MapRoom): RunState {
  const floor = s.floor + 1
  const at: RunState = { ...s, floor, room: room.lane, path: [...s.path, room.lane], turn: firstLiving(s), visit: [], lastHeal: null }
  const type = room.type
  if (isBattleRoom(type)) {
    const [kinds, rng] = withRng(at, r => {
      const pool = encounterPool(type, floor)
      return pool[pick(r, pool.length)]
    })
    const enemies = kinds.map((kind, i) => {
      const hp = enemyHp(ENEMIES[kind].hp, s.heroes.length, s.cfg.difficulty)
      return { uid: `e${i}`, kind, hp, maxHp: hp, burn: 0, chilled: false }
    })
    return {
      ...at,
      rng,
      trace: null,
      scene: { phase: 'battle', battle: { room: type, enemies, round: 1, resolved: false, lastEnemyTurn: null } },
    }
  }
  switch (type) {
    case 'treasure': {
      const size = rulesOf(s.cfg).offerSize
      const [offers, rng] = withRng(at, r => at.heroes.map(h => (alive(h) ? drawArtifacts(r, h.artifacts, size) : [])))
      const open = offers.map(o => (o.length > 0 ? o : null))
      const first = open.findIndex(o => o !== null)
      return first < 0 ? finishRoom({ ...at, rng }) : { ...at, rng, turn: first, scene: { phase: 'treasure', offers: open } }
    }
    case 'rest':
      return { ...at, scene: { phase: 'rest' } }
    case 'event': {
      const [event, rng] = withRng(at, r => EVENT_IDS[pick(r, EVENT_IDS.length)])
      return { ...at, rng, scene: { phase: 'event', event, votes: at.heroes.map(() => null) } }
    }
    // shortcut: a shop has no screen yet (map weight 0); one that appears is passed through
    case 'shop':
      return finishRoom(at)
  }
}

// Up to n artifacts the hero doesn't own yet, without repeats
function drawArtifacts(rng: Rng, owned: readonly ArtifactId[], n: number): ArtifactId[] {
  const pool = ARTIFACT_IDS.filter(id => !owned.includes(id))
  const out: ArtifactId[] = []
  while (out.length < n && pool.length > 0) out.push(...pool.splice(pick(rng, pool.length), 1))
  return out
}

/** A dart of the open visit. */
export function throwDart(s: RunState, hit: Hit): RunState {
  const darts = rulesOf(s.cfg).dartsPerVisit
  if (s.visit.length >= darts) return s
  const scene = s.scene
  const visit = [...s.visit, hit]
  switch (scene.phase) {
    // The first dart on a half is the hero's vote; the visit's other darts don't count
    case 'map': {
      if (scene.votes[s.turn] !== null) return s
      const side = sideOf(hit)
      return { ...s, visit, scene: side ? { ...scene, votes: scene.votes.map((v, i) => (i === s.turn ? side : v)) } : scene }
    }
    case 'rest':
      return { ...s, visit }
    case 'battle':
      if (scene.battle.resolved) return s
      return visit.length === darts ? resolve({ ...s, visit }, scene.battle) : { ...s, visit }
    default:
      return s
  }
}

/** A new visit opens (the board's visit.opened). */
export function openVisit(s: RunState): RunState {
  const scene =
    s.scene.phase === 'battle' && s.scene.battle.resolved ? { ...s.scene, battle: { ...s.scene.battle, resolved: false } } : s.scene
  return s.visit.length === 0 && scene === s.scene ? s : { ...s, visit: [], scene }
}

// The open visit's damage, block and heals; a battle stays in its scene with the visit resolved
function resolve(s: RunState, battle: Battle): RunState {
  const r = resolveVisit({ seat: s.turn, visit: s.visit, heroes: s.heroes, enemies: battle.enemies, items: s.items, gold: s.gold })
  const resolved: RunState = {
    ...s,
    heroes: r.heroes,
    gold: r.gold,
    trace: r.trace,
    stats: s.stats.map((st, i) => (i === s.turn ? credit(st, r, s.floor) : st)),
    best: r.trace.total > (s.best?.damage ?? 0) ? bestOf(r.trace, battle) : s.best,
    scene: { phase: 'battle', battle: { ...battle, enemies: r.enemies, resolved: true } },
  }
  // The boss's death ends the run at once: the deciding visit waits for Finish, not the takeout
  return battle.room === 'boss' && !r.enemies.some(alive) ? winFight(resolved, 'boss') : resolved
}

// The thrower's stats after a resolved visit
function credit(st: SeatStats, r: VisitResult, floor: number): SeatStats {
  const top = r.trace.darts.reduce<TraceDart | null>((best, d) => (d.damage > (best?.damage ?? 0) ? d : best), null)
  const byFloor = Array.from({ length: Math.max(st.damageByFloor.length, floor) }, (_, i) => st.damageByFloor[i] ?? 0)
  byFloor[floor - 1] += r.trace.total
  return {
    damage: st.damage + r.trace.total,
    bestVisit: Math.max(st.bestVisit, r.trace.total),
    healed: st.healed + r.healed,
    blocked: st.blocked + r.blocked,
    bestDart: top && top.damage > (st.bestDart?.damage ?? 0) ? { number: top.number, ring: top.ring, damage: top.damage } : st.bestDart,
    damageByFloor: byFloor,
  }
}

const bestOf = (trace: Trace, battle: Battle): BestVisit => ({
  seat: trace.seat,
  darts: trace.darts.map(d => ({ number: d.number, ring: d.ring })),
  damage: trace.total,
  enemy: battle.enemies.find(e => e.uid === trace.darts[0]?.target)?.kind ?? null,
})

/** The open visit ends (the takeout, or Next). */
export function endVisit(s: RunState): RunState {
  const done: RunState = { ...s, visit: [] }
  const scene = s.scene
  switch (scene.phase) {
    case 'map': {
      if (scene.votes[s.turn] === null) return done
      const waiting = living(s).find(h => scene.votes[h.seat] === null)
      if (waiting) return { ...done, turn: waiting.seat }
      const [side, rng] = withRng(s, r =>
        tally(
          living(s).flatMap(h => scene.votes[h.seat] ?? []),
          r,
        ),
      )
      const room = roomsAbove(s.map, s.floor, s.room)[side]
      return room ? enterRoom({ ...done, rng }, room) : done
    }
    case 'rest': {
      const hero = s.heroes[s.turn]
      const amount = Math.min(
        hero.maxHp - hero.hp,
        s.visit.reduce((n, h) => n + h.score, 0),
      )
      const heroes = s.heroes.map(h => (h.seat === s.turn ? { ...h, hp: h.hp + amount } : h))
      const stats = s.stats.map((st, i) => (i === s.turn ? { ...st, healed: st.healed + amount } : st))
      const rested: RunState = { ...done, heroes, stats, lastHeal: { seat: s.turn, amount } }
      const next = nextLiving(rested, s.turn)
      return next.wrapped ? finishRoom(rested) : { ...rested, turn: next.seat }
    }
    case 'battle': {
      const resolved = scene.battle.resolved ? s : resolve(s, scene.battle)
      return resolved.scene.phase === 'battle'
        ? afterVisit({ ...resolved, visit: [] }, { ...resolved.scene.battle, resolved: false })
        : resolved
    }
    default:
      return done
  }
}

// After a hero's visit: the fight may be won, else the next hero throws or the enemies act
function afterVisit(s: RunState, battle: Battle): RunState {
  if (!battle.enemies.some(alive)) return winFight(s, battle.room)
  const next = nextLiving(s, s.turn)
  if (!next.wrapped) return { ...s, turn: next.seat, scene: { phase: 'battle', battle } }
  const turn = enemyTurn(s.heroes, battle.enemies, battle.round, s.cfg.difficulty, rulesOf(s.cfg))
  const acted: RunState = { ...s, heroes: turn.heroes }
  if (!turn.enemies.some(alive)) return winFight(acted, battle.room)
  if (!turn.heroes.some(alive)) return { ...acted, scene: { phase: 'ended', outcome: 'defeat' } }
  const round: Battle = { ...battle, enemies: turn.enemies, round: battle.round + 1, lastEnemyTurn: turn.log }
  return { ...acted, turn: firstLiving(acted), scene: { phase: 'battle', battle: round } }
}

function winFight(s: RunState, room: BattleRoom): RunState {
  if (room === 'boss') return { ...s, cleared: s.cleared + 1, scene: { phase: 'ended', outcome: 'victory' } }
  const pay = rulesOf(s.cfg).gold[room]
  return finishRoom({ ...s, gold: s.gold + pay.base + pay.perFloor * s.floor })
}

/** A hero takes one artifact of their treasure offer. */
export function pickTreasure(s: RunState, seat: number, index: number): RunState {
  const scene = s.scene
  if (scene.phase !== 'treasure') return s
  const artifact = scene.offers.at(seat)?.at(index)
  if (!artifact) return s
  const heroes = s.heroes.map(h => (h.seat === seat ? { ...h, artifacts: [...h.artifacts, artifact] } : h))
  const offers = scene.offers.map((o, i) => (i === seat ? null : o))
  const waiting = offers.findIndex(o => o !== null)
  return waiting < 0 ? finishRoom({ ...s, heroes }) : { ...s, heroes, turn: waiting, scene: { phase: 'treasure', offers } }
}

/**
 * DEV, until every room has its screen: the room is over as if the party got through it. A fight is
 * won (gold paid, the boss ends the run in victory); treasure, rest and event are skipped.
 */
export function devResolveRoom(s: RunState): RunState {
  switch (s.scene.phase) {
    case 'battle': {
      const battle: Battle = { ...s.scene.battle, enemies: s.scene.battle.enemies.map(e => ({ ...e, hp: 0 })) }
      return winFight({ ...s, visit: [], scene: { phase: 'battle', battle } }, battle.room)
    }
    case 'treasure':
    case 'rest':
    case 'event':
      return finishRoom({ ...s, visit: [] })
    default:
      return s
  }
}

/** A hero votes for one of the event's decisions; once every living hero voted, the winner applies. */
export function voteEvent(s: RunState, seat: number, decision: number): RunState {
  const scene = s.scene
  if (scene.phase !== 'event' || !s.heroes.at(seat) || !alive(s.heroes[seat])) return s
  if (!Number.isInteger(decision) || decision < 0 || decision >= EVENTS[scene.event].decisions.length) return s
  const votes = scene.votes.map((v, i) => (i === seat ? decision : v))
  const waiting = living(s).find(h => votes[h.seat] === null)
  if (waiting) return { ...s, turn: waiting.seat, scene: { ...scene, votes } }
  const [result, rng] = withRng(s, r =>
    applyOutcomes(
      s,
      scene.event,
      tally(
        living(s).flatMap(h => votes[h.seat] ?? []),
        r,
      ),
      r,
    ),
  )
  return finishRoom({ ...result, rng })
}

function applyOutcomes(s: RunState, id: EventId, decision: number, rng: Rng): RunState {
  const outcomes: readonly Outcome[] = EVENTS[id].decisions[decision].outcomes
  const result: EventResult = { id, decision, cleared: s.cleared + 1, items: [], artifacts: [] }
  const slots = rulesOf(s.cfg).slotsPerNumber
  let next: RunState = s
  for (const o of outcomes) {
    switch (o.kind) {
      case 'gold':
        next = { ...next, gold: Math.max(0, next.gold + o.value) }
        break
      // An event never downs a hero
      case 'hp':
        next = { ...next, heroes: next.heroes.map(h => (alive(h) ? { ...h, hp: Math.max(1, Math.min(h.maxHp, h.hp + o.value)) } : h)) }
        break
      case 'artifact':
        next = {
          ...next,
          heroes: next.heroes.map(h => {
            const artifact = alive(h) ? drawArtifacts(rng, h.artifacts, 1).at(0) : undefined
            if (!artifact) return h
            result.artifacts.push({ seat: h.seat, artifact })
            return { ...h, artifacts: [...h.artifacts, artifact] }
          }),
        }
        break
      case 'item': {
        const free = Array.from({ length: 20 }, (_, i) => i + 1).filter(n => next.items.filter(p => p.number === n).length < slots)
        if (free.length === 0) break
        const placed = { number: free[pick(rng, free.length)], item: o.item }
        result.items.push(placed)
        next = { ...next, items: [...next.items, placed] }
      }
    }
  }
  return { ...next, lastEvent: result }
}
