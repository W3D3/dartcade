// The pieces of a run's state that the rules pass around.
import type { ArtifactId } from './content/artifacts.js'
import type { ClassId } from './content/classes.js'
import type { EnemyId } from './content/enemies.js'
import type { SegmentItemId } from './content/segmentItems.js'

export type Hero = {
  seat: number
  /** Null until the hero picked one (setup). */
  classId: ClassId | null
  /** The Healer's number; null for every other class. */
  healSegment: number | null
  hp: number
  maxHp: number
  block: number
  /** In the order the hero got them: their hooks fire in this order. */
  artifacts: ArtifactId[]
}

export type Enemy = {
  /** Unique within the fight (`e0`, `e1`, …): the trace and the target refer to it. */
  uid: string
  kind: EnemyId
  hp: number
  maxHp: number
  /** Damage it takes at the end of each round. */
  burn: number
  /** Its next attack does less (rules.chill); cleared once it acts. */
  chilled: boolean
}

export type PlacedItem = { number: number; item: SegmentItemId }

export const alive = (x: { hp: number }): boolean => x.hp > 0
