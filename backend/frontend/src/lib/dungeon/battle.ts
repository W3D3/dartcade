// What the battle and room screens show, worked out from the snapshot: the trace and the enemy turn
// as readable lines, the board spots the open visit's darts lit, and who may choose for a seat.
// The animated damage popup will replay the same trace; until then these lines explain it.
import type { DungeonEnemy, DungeonGame, DungeonTrace, DungeonTraceStep } from '$lib/api/game-ws'
import { HALF, R, SEGS, sectorPath, segAngle } from '$shared/board'
import { ARTIFACTS, isArtifactId } from '$shared/dungeon/content/artifacts'
import { CLASSES, isClassId } from '$shared/dungeon/content/classes'
import { ENEMIES, isEnemyId } from '$shared/dungeon/content/enemies'
import { EVENTS, isEventId } from '$shared/dungeon/content/events'
import { SEGMENT_ITEMS, isSegmentItemId } from '$shared/dungeon/content/segmentItems'
import type { Ring } from '$shared/dungeon/hit'

/** A dart as the log writes it: S19, D20, T5, 25, Bull, Miss. */
export function dartName(number: number, ring: Ring): string {
  switch (ring) {
    case 'single':
      return `S${number}`
    case 'double':
      return `D${number}`
    case 'treble':
      return `T${number}`
    case 'bull':
      return '25'
    case 'bullseye':
      return 'Bull'
    case 'miss':
      return 'Miss'
  }
}

export const enemyName = (kind: string): string => (isEnemyId(kind) ? ENEMIES[kind].name : kind)

/** The name of whatever fired a trace step: a segment item, an artifact or a class (an after-visit step names any of them). */
export function contentName(id: string | null): string {
  if (id === null) return ''
  if (isArtifactId(id)) return ARTIFACTS[id].name
  if (isSegmentItemId(id)) return SEGMENT_ITEMS[id].name
  if (isClassId(id)) return CLASSES[id].name
  if (isEnemyId(id)) return ENEMIES[id].name
  return id
}

const SOURCE_LABEL: Partial<Record<DungeonTraceStep['source'], string>> = { weakness: 'Weak', resist: 'Resists', immune: 'Immune' }

function stepText(step: DungeonTraceStep, target: (uid: string | null) => string): string {
  const who = SOURCE_LABEL[step.source] ?? contentName(step.id)
  switch (step.effect) {
    case 'base_add':
      return `${who} +${step.value}`
    case 'mult_add':
      return `${who} +${step.value} Mult`
    case 'mult_mul':
      return `${who} x${step.value}`
    case 'block':
      return `${who}: ${step.value} block`
    case 'heal':
      return `${who}: heals ${step.value}`
    case 'gold':
      return `${who}: +${step.value} gold`
    case 'burn':
      return `${who}: ${step.value} Burn on ${target(step.target)}`
    case 'chill':
      return `${who}: Chills ${target(step.target)}`
    case 'damage':
      return `${who}: ${step.value} damage to ${target(step.target)}`
  }
}

/**
 * The visit, one line per dart then one per after-visit effect and the total, as in the
 * Dungeon-Pixel-Battle log: "Lena throws S19. Whetstone Rune +10, Brawler x1.5: 44 damage to Slime."
 */
export function traceLines(trace: DungeonTrace, thrower: string, enemies: readonly Pick<DungeonEnemy, 'uid' | 'kind'>[]): string[] {
  const target = (uid: string | null) => enemyName(enemies.find(e => e.uid === uid)?.kind ?? '') || 'the enemy'
  const darts = trace.darts.map(d => {
    const effects = d.steps.filter(s => s.source !== 'dart').map(s => stepText(s, target))
    const hit = d.target === null ? 'nothing is left to hit' : `${d.damage} damage to ${target(d.target)}${d.killed ? ', killed' : ''}`
    return `${thrower} throws ${dartName(d.number, d.ring)}.${effects.length ? ` ${effects.join(', ')}:` : ''} ${hit}.`
  })
  const after = trace.afterVisit.map(s => `After the visit, ${stepText(s, target)}.`)
  return [...darts, ...after, `Visit: ${trace.total} damage.`]
}

/** The enemies' last turn: who hit whom, what block took, what Burn did. */
export function enemyTurnLines(
  log: NonNullable<NonNullable<DungeonGame['battle']>['lastEnemyTurn']>,
  names: readonly string[],
  enemies: readonly Pick<DungeonEnemy, 'uid' | 'kind'>[],
): string[] {
  const nameOf = (uid: string) => enemyName(enemies.find(e => e.uid === uid)?.kind ?? '')
  const attacks = log.attacks.map(a => {
    const hits = a.hits.map(h => `${names[h.seat] ?? `Hero ${h.seat + 1}`} takes ${h.damage}${h.blocked ? ` (${h.blocked} blocked)` : ''}`)
    return `${nameOf(a.uid)} uses ${a.name}: ${hits.length ? hits.join(', ') : 'nobody is hit'}.`
  })
  const burns = log.burns.map(b => `${nameOf(b.uid)} burns for ${b.damage}.`)
  return [...attacks, ...burns]
}

const circle = (r: number) => `M${-r} 0 A${r} ${r} 0 1 0 ${r} 0 A${r} ${r} 0 1 0 ${-r} 0Z`

/** The board area a dart lit, in board units (r = 1 at the outer double wire): a single lights both single beds. */
export function litPath(number: number, ring: Ring): string | null {
  if (ring === 'miss') return null
  if (ring === 'bullseye') return circle(R.bull50)
  if (ring === 'bull') return circle(R.bull25)
  const i = SEGS.indexOf(number)
  if (i < 0) return null
  const a = segAngle(i)
  const wedge = (r1: number, r2: number) => sectorPath(r1, r2, a + HALF, a - HALF)
  if (ring === 'treble') return wedge(R.si, R.tr)
  if (ring === 'double') return wedge(R.so, R.db)
  return `${wedge(R.bull25, R.si)} ${wedge(R.tr, R.so)}`
}

/** Where a number's segment item marker sits: just inside the double ring, at the number's angle. */
export function itemSpot(number: number, k: number): { x: number; y: number } | null {
  const i = SEGS.indexOf(number)
  if (i < 0) return null
  const a = segAngle(i) + (k - 0.5) * HALF * 0.9
  return { x: 0.88 * Math.cos(a), y: -0.88 * Math.sin(a) }
}

/** An event's outcome or a fight's gold while no room has been cleared since (the map after it, or the boss walked into straight after). */
export const fresh = <T extends { cleared: number }>(news: T | null, game: Pick<DungeonGame, 'cleared'>): T | null =>
  news?.cleared === game.cleared ? news : null

/** What the last event did: the decision taken, the items placed, the artifacts found. */
export function eventOutcomeLines(last: NonNullable<DungeonGame['lastEvent']>, names: readonly string[]): string[] {
  const decision = isEventId(last.id) ? EVENTS[last.id].decisions.at(last.decision)?.label : null
  return [
    `The party chose: ${decision ?? `option ${last.decision + 1}`}.`,
    ...last.items.map(p => `${contentName(p.item)} is now on ${p.number}.`),
    ...last.artifacts.map(a => `${names[a.seat] ?? `Hero ${a.seat + 1}`} found ${contentName(a.artifact)}.`),
  ]
}

/** Whether this viewer may make a seat's choice (treasure pick, event vote): the host, or whoever controls the seat. */
export const choosesFor = (seat: number, o: { mySeats: readonly number[]; host: boolean; viewOnly: boolean }): boolean =>
  !o.viewOnly && (o.host || o.mySeats.includes(seat))

/** The front enemy's HP: what the open visit still has to deal to kill it. */
export const toKill = (battle: NonNullable<DungeonGame['battle']>): number | null =>
  battle.enemies.find(e => e.uid === battle.target)?.hp ?? null

/** A spot list as text: "doubles", "7, 3", "bull". */
export const spotsText = (spots: DungeonEnemy['weak']): string =>
  spots.map(s => ('number' in s ? String(s.number) : s.ring === 'treble' ? 'trebles' : s.ring === 'double' ? 'doubles' : s.ring)).join(', ')
