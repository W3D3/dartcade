// What a piece of content is: an entry of data plus hooks the visit's resolution calls. A hook only
// reads its context and returns effects; resolveVisit applies them in a fixed order and writes one
// trace step per effect, so a new artifact, item or class never touches the engine.
import type { Hit, Spot } from '../hit.js'

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

/** The catalogue's status: `accepted` is wanted, `draft` not reviewed yet (rejected entries are not built). */
export type Status = 'accepted' | 'draft' | 'new'

/** What an effect changes. `base_add`, `mult_add` and `mult_mul` change the dart's damage; the rest act beside it. */
export type EffectKind = 'base_add' | 'mult_add' | 'mult_mul' | 'block' | 'heal' | 'burn' | 'chill' | 'gold' | 'damage'

/**
 * One change a hook makes. `party`: a block or heal for every living hero, not only the thrower.
 * `damage` hits the front enemy, or with `second` the next living enemy after the dart's target.
 */
export type Effect = { effect: EffectKind; value: number; party?: true; second?: true }

/** The thrower as a hook sees them. */
export type HeroContext = { seat: number; block: number; healSegment: number | null }

/** What a dart's hooks see: the dart, the whole visit (it is resolved when it ends) and the thrower. */
export type DartContext = {
  hit: Hit
  /** 0-based position in the visit. */
  index: number
  /** Every dart of the visit, in throwing order. */
  visit: readonly Hit[]
  /** The dart before this one in the visit, or null for the first. */
  previous: Hit | null
  hero: HeroContext
}

/** A dart's context once its damage is known. */
export type DamageContext = DartContext & { damage: number }

/** What an after-visit hook sees. */
export type VisitContext = { visit: readonly Hit[]; hero: HeroContext }

/** When a hook fires, for the artifact popup's trigger line. */
export type Trigger = 'On each dart' | 'After your visit' | 'On a treble' | 'On a double' | 'After a hit'

export type Hooks = {
  /** Every dart: Base, Mult and the effects beside the damage. */
  onDart?(ctx: DartContext): Effect[]
  /** Every dart, after its damage is dealt (a chain to a second enemy). */
  afterDart?(ctx: DamageContext): Effect[]
  /** Once, after the visit's last dart. */
  afterVisit?(ctx: VisitContext): Effect[]
}

/** Lasting changes to the owner, read outside a visit. */
export type Modifiers = {
  /** Max HP multiplier at the start of the run. */
  maxHp?: number
  /** Share of the unused block kept at the end of a round (0 = all of it resets). */
  blockCarry?: number
}

/** An artifact, a segment item or a class. */
export type ContentEntry = {
  name: string
  rarity: Rarity
  status: Status
  /** The effect as the player reads it (the catalogue's text). */
  description: string
  trigger: Trigger
  hooks: Hooks
  modifiers?: Modifiers
}

/** An enemy's defences: what doubles, halves or stops a dart. */
export type Defences = { weak: Spot[]; resist: Spot[]; immune: Spot[] }

/** An enemy's action for one round, with the name the screen and the log give it. `pierce`: the attack ignores block. */
export type Intent = { kind: 'attack'; name: string; value: number; pierce?: true } | { kind: 'none'; name: string }

export type EnemyEntry = {
  name: string
  rarity: Rarity
  /** Base HP for 1 player on Medium (see balance.ts). */
  hp: number
  /** The intents it cycles through, one per round from round 1. */
  pattern: Intent[]
  defences: Defences
  /** Defences that replace the base ones once HP falls to `below` (a share of max HP), last match wins. */
  phases?: (Defences & { below: number })[]
  note: string
}
