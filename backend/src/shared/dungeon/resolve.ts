// Resolving a visit (spec: "Resolving a visit"). The darts resolve in throwing order against the
// front living enemy; each dart's triggers fire in a fixed order (segment items, the thrower's
// artifacts in the order owned, the class, then the target's weakness, resistance and immunity), and
// every effect becomes one trace step, so the damage popup can replay and explain the visit.
import { ARTIFACTS } from './content/artifacts.js'
import { CLASSES } from './content/classes.js'
import { defencesAt } from './content/enemies.js'
import { SEGMENT_ITEMS } from './content/segmentItems.js'
import type { ContentEntry, DamageContext, DartContext, Effect, EffectKind, HeroContext, VisitContext } from './content/types.js'
import { onSpot, type Hit, type Ring } from './hit.js'
import { alive, type Enemy, type Hero, type PlacedItem } from './state.js'

export type TraceSource = 'dart' | 'segment' | 'artifact' | 'class' | 'weakness' | 'resist' | 'immune' | 'afterVisit'

/** One effect as it fired: `base` and `mult` are the dart's running values after it; `target` the enemy a `damage`, `burn` or `chill` went to. */
export type TraceStep = {
  source: TraceSource
  id: string | null
  effect: EffectKind
  value: number
  base: number
  mult: number
  target: string | null
}

export type TraceDart = {
  number: number
  ring: Ring
  /** The enemy the dart hit; null when every enemy was already dead. */
  target: string | null
  steps: TraceStep[]
  /** Base x Mult, rounded down; the target loses at most its HP (overkill is wasted). */
  damage: number
  hpBefore: number
  hpAfter: number
  killed: boolean
}

export type Trace = {
  seat: number
  darts: TraceDart[]
  afterVisit: TraceStep[]
  /** The visit's damage as the popup counts it: every dart's and every extra hit's, overkill included. */
  total: number
  /** The front enemy's HP when the visit started (the popup's fire thresholds). */
  targetHp: number
  enemies: { uid: string; hpBefore: number; hpAfter: number }[]
}

export type VisitInput = { seat: number; visit: readonly Hit[]; heroes: Hero[]; enemies: Enemy[]; items: PlacedItem[]; gold: number }
/** `healed` and `blocked`: the HP the thrower's effects restored and the block they gave, across the party. */
export type VisitResult = { trace: Trace; heroes: Hero[]; enemies: Enemy[]; gold: number; healed: number; blocked: number }

type Source = { source: TraceSource; id: string; entry: ContentEntry }

// Who fires for this dart, in trigger order: the items on the number hit, the artifacts, the class
function sourcesFor(hero: Hero, hit: Hit | null, items: PlacedItem[]): Source[] {
  const onNumber = hit ? items.filter(p => hit.ring !== 'miss' && p.number === hit.number) : []
  return [
    ...onNumber.map(p => ({ source: 'segment' as const, id: p.item, entry: SEGMENT_ITEMS[p.item] })),
    ...hero.artifacts.map(id => ({ source: 'artifact' as const, id, entry: ARTIFACTS[id] })),
    ...(hero.classId ? [{ source: 'class' as const, id: hero.classId, entry: CLASSES[hero.classId] }] : []),
  ]
}

const roundMult = (m: number) => Math.round(m * 1000) / 1000

export function resolveVisit(input: VisitInput): VisitResult {
  const heroes = input.heroes.map(h => ({ ...h }))
  const enemies = input.enemies.map(e => ({ ...e }))
  const hero = heroes.find(h => h.seat === input.seat)
  if (!hero) throw new Error(`no hero in seat ${input.seat}`)
  let gold = input.gold
  let healed = 0
  let blocked = 0
  const before = enemies.map(e => ({ uid: e.uid, hpBefore: e.hp }))
  const front = () => enemies.find(alive) ?? null
  const targetHp = front()?.hp ?? 0
  const ctxHero = (): HeroContext => ({ seat: hero.seat, block: hero.block, healSegment: hero.healSegment })

  const hurt = (enemy: Enemy, amount: number) => {
    enemy.hp = Math.max(0, enemy.hp - amount)
  }

  // Applies an effect that acts beside the dart's damage; returns the enemy it went to
  const applySide = (e: Effect, target: Enemy | null): Enemy | null => {
    switch (e.effect) {
      case 'block':
        for (const h of e.party ? heroes.filter(alive) : [hero]) {
          h.block += e.value
          blocked += e.value
        }
        return null
      case 'heal':
        for (const h of e.party ? heroes.filter(alive) : [hero]) {
          const hp = Math.min(h.maxHp, h.hp + e.value)
          healed += hp - h.hp
          h.hp = hp
        }
        return null
      case 'gold':
        gold += e.value
        return null
      case 'burn':
        if (target) target.burn += e.value
        return target
      case 'chill':
        if (target) target.chilled = true
        return target
      case 'damage': {
        const to = e.second ? (enemies.find(x => alive(x) && x !== target) ?? null) : front()
        if (to) hurt(to, e.value)
        return to
      }
      default:
        return null
    }
  }

  const darts: TraceDart[] = input.visit.map((hit, index) => {
    const target = front()
    let base = hit.score
    let mult = 1
    const steps: TraceStep[] = [{ source: 'dart', id: null, effect: 'base_add', value: base, base, mult, target: target?.uid ?? null }]
    const fire = (source: TraceSource, id: string | null, e: Effect, against: Enemy | null) => {
      if (e.effect === 'base_add') base += e.value
      else if (e.effect === 'mult_add') mult = roundMult(mult + e.value)
      else if (e.effect === 'mult_mul') mult = roundMult(mult * e.value)
      const modifies = e.effect === 'base_add' || e.effect === 'mult_add' || e.effect === 'mult_mul'
      const to = modifies ? target : applySide(e, against)
      steps.push({ source, id, effect: e.effect, value: e.value, base, mult, target: to?.uid ?? null })
    }

    const ctx: DartContext = { hit, index, visit: input.visit, previous: index > 0 ? input.visit[index - 1] : null, hero: ctxHero() }
    const sources = sourcesFor(hero, hit, input.items)
    for (const s of sources) for (const e of s.entry.hooks.onDart?.({ ...ctx, hero: ctxHero() }) ?? []) fire(s.source, s.id, e, target)

    if (target) {
      const d = defencesAt(target.kind, target.hp, target.maxHp)
      if (d.weak.some(spot => onSpot(hit, spot))) fire('weakness', target.kind, { effect: 'mult_mul', value: 2 }, target)
      if (d.resist.some(spot => onSpot(hit, spot))) fire('resist', target.kind, { effect: 'mult_mul', value: 0.5 }, target)
      if (d.immune.some(spot => onSpot(hit, spot))) fire('immune', target.kind, { effect: 'mult_mul', value: 0 }, target)
    }

    const hpBefore = target?.hp ?? 0
    const damage = target ? Math.floor(base * mult) : 0
    if (target) hurt(target, damage)
    const hpAfter = target?.hp ?? 0
    const after: DamageContext = { ...ctx, hero: ctxHero(), damage }
    for (const s of sources) for (const e of s.entry.hooks.afterDart?.({ ...after, hero: ctxHero() }) ?? []) fire(s.source, s.id, e, target)
    return {
      number: hit.number,
      ring: hit.ring,
      target: target?.uid ?? null,
      steps,
      damage,
      hpBefore,
      hpAfter,
      killed: hpBefore > 0 && hpAfter === 0,
    }
  })

  const afterVisit: TraceStep[] = []
  const visitCtx = (): VisitContext => ({ visit: input.visit, hero: ctxHero() })
  for (const s of sourcesFor(hero, null, input.items)) {
    for (const e of s.entry.hooks.afterVisit?.(visitCtx()) ?? []) {
      const to = applySide(e, front())
      afterVisit.push({ source: 'afterVisit', id: s.id, effect: e.effect, value: e.value, base: 0, mult: 1, target: to?.uid ?? null })
    }
  }

  const summary = before.map((b, i) => ({ ...b, hpAfter: enemies[i].hp }))
  const extra = [...darts.flatMap(d => d.steps), ...afterVisit].filter(st => st.effect === 'damage' && st.target !== null)
  const total = darts.reduce((n, d) => n + d.damage, 0) + extra.reduce((n, st) => n + st.value, 0)
  return { trace: { seat: input.seat, darts, afterVisit, total, targetHp, enemies: summary }, heroes, enemies, gold, healed, blocked }
}
