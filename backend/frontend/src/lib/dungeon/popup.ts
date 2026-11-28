// The visit damage popup (Dungeon-Pixel-Damage) as a timeline over the resolution trace: a list of
// beats (a dart lands, each of its steps pops in as a chip, its damage lands, the after-visit steps,
// the end) and what the popup shows after the first n of them. Pure, so the component only counts
// beats and the rules stay testable; the result is the server's trace, never recomputed here.
import type { DungeonTrace, DungeonTraceStep } from '$lib/api/game-ws'
import { ARTIFACTS, isArtifactId } from '$shared/dungeon/content/artifacts'
import { CLASSES, isClassId } from '$shared/dungeon/content/classes'
import { SEGMENT_ITEMS, isSegmentItemId } from '$shared/dungeon/content/segmentItems'
import { dartName } from './battle'
import type { FxCue } from './fx/effects'
import { RARITY_COLOR } from './view'

/** The enemy the visit started on (the front one then): the popup's and the stage's target while it plays, as the view's has moved on to the next once it died. */
export const visitTarget = (trace: DungeonTrace): string | null => trace.darts.find(d => d.target !== null)?.target ?? null

export type Beat =
  | { kind: 'dart'; dart: number }
  | { kind: 'step'; dart: number; step: DungeonTraceStep }
  | { kind: 'damage'; dart: number }
  | { kind: 'after'; step: DungeonTraceStep }
  | { kind: 'end' }

/** How long each beat holds before the next, in ms: slow enough to read a chip, quick enough for three darts. */
export const BEAT_MS: Record<Beat['kind'], number> = { dart: 450, step: 600, damage: 650, after: 600, end: 0 }

const chipSteps = (d: DungeonTrace['darts'][number]) => d.steps.filter(s => s.source !== 'dart')

export function beatsOf(trace: DungeonTrace): Beat[] {
  return [
    ...trace.darts.flatMap((d, dart): Beat[] => [
      { kind: 'dart', dart },
      ...chipSteps(d).map((step): Beat => ({ kind: 'step', dart, step })),
      { kind: 'damage', dart },
    ]),
    ...trace.afterVisit.map((step): Beat => ({ kind: 'after', step })),
    { kind: 'end' },
  ]
}

export type PopupRow = {
  /** S19, D20, Miss. */
  label: string
  /** Null until the dart lands. */
  base: number | null
  mult: number | null
  damage: number | null
  chips: DungeonTraceStep[]
}

export type FireLevel = 0 | 1 | 2 | 3

export type Popup = {
  rows: PopupRow[]
  after: DungeonTraceStep[]
  total: number
  /** Each enemy's HP as the popup has it so far. */
  hp: Record<string, number>
  /** The damage each enemy took so far, one number per landed dart, in order. */
  hits: Record<string, number[]>
  fire: FireLevel
  done: boolean
}

/** The Visit card burns past 50%, 75% and 100% of the front enemy's HP at the start of the visit. */
export function fireLevel(total: number, targetHp: number): FireLevel {
  if (targetHp <= 0 || total < targetHp / 2) return 0
  return total >= targetHp ? 3 : total >= (targetHp * 3) / 4 ? 2 : 1
}

/** A box rumbles once its number passes `over`: 1 to 3, harder the further past it is. */
export const rumble = (value: number | null, over: number): 0 | 1 | 2 | 3 =>
  value === null || value <= over ? 0 : value > over * 4 ? 3 : value > over * 2 ? 2 : 1

/** Where each box starts rumbling (spec, The damage popup). */
export const RUMBLE_OVER = { base: 100, mult: 5, damage: 200 } as const

/** What the popup shows once the first `n` beats played (n past the end is the end). */
export function popupAt(trace: DungeonTrace, n: number): Popup {
  const beats = beatsOf(trace).slice(0, Math.max(0, n))
  const rows: PopupRow[] = trace.darts.map(d => ({ label: dartName(d.number, d.ring), base: null, mult: null, damage: null, chips: [] }))
  const hp = Object.fromEntries(trace.enemies.map(e => [e.uid, e.hpBefore]))
  const hits: Record<string, number[]> = {}
  const after: DungeonTraceStep[] = []
  let total = 0
  let done = false
  for (const beat of beats) {
    switch (beat.kind) {
      case 'dart': {
        const first = trace.darts[beat.dart]?.steps.find(s => s.source === 'dart')
        Object.assign(rows[beat.dart], { base: first?.base ?? 0, mult: first?.mult ?? 1 })
        break
      }
      case 'step': {
        const row = rows[beat.dart]
        Object.assign(row, { base: beat.step.base, mult: beat.step.mult, chips: [...row.chips, beat.step] })
        break
      }
      case 'damage': {
        const d = trace.darts[beat.dart]
        rows[beat.dart].damage = d.damage
        total += d.damage
        if (d.target !== null) {
          hp[d.target] = d.hpAfter
          hits[d.target] = [...(hits[d.target] ?? []), d.damage]
        }
        break
      }
      case 'after':
        after.push(beat.step)
        if (beat.step.effect === 'damage') total += beat.step.value
        break
      case 'end':
        done = true
        total = trace.total
        for (const e of trace.enemies) hp[e.uid] = e.hpAfter
        break
    }
  }
  return { rows, after, total, hp, hits, fire: fireLevel(total, trace.targetHp), done }
}

export type Chip = {
  name: string
  /** +10, ×1.5, 12. */
  change: string
  /** Block, Burn: the change isn't Base or Mult. */
  unit: string
  /** The change's colour: Base blue, Mult red, the rest by what it does. */
  tone: string
  /** The chip's outline: an artifact's rarity, a segment item's orange, the class's gold. */
  colour: string
  artifact: keyof typeof ARTIFACTS | null
}

const TONE = {
  base_add: '#5aa0e8',
  mult_add: '#ff6a5e',
  mult_mul: '#ff6a5e',
  block: '#5aa0e8',
  heal: '#5bd37a',
  gold: '#f2c14e',
  burn: '#ff8a4c',
  chill: '#9ec8ff',
  damage: '#f2c14e',
} as const satisfies Record<DungeonTraceStep['effect'], string>

const UNIT: Partial<Record<DungeonTraceStep['effect'], string>> = {
  block: 'Block',
  heal: 'Heal',
  gold: 'Gold',
  burn: 'Burn',
  chill: 'Chill',
  damage: 'Damage',
}

const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

/** A step as the popup's chip shows it: who fired it and what it changed. */
export function chipOf(step: DungeonTraceStep): Chip {
  const id = step.id
  const artifact = id !== null && isArtifactId(id) ? id : null
  const name =
    step.source === 'weakness'
      ? 'Weak'
      : step.source === 'resist'
        ? 'Resists'
        : step.source === 'immune'
          ? 'Immune'
          : artifact
            ? ARTIFACTS[artifact].name
            : id !== null && isSegmentItemId(id)
              ? SEGMENT_ITEMS[id].name
              : id !== null && isClassId(id)
                ? CLASSES[id].name
                : (id ?? '')
  const colour = artifact
    ? RARITY_COLOR[ARTIFACTS[artifact].rarity]
    : step.source === 'weakness'
      ? '#5bd37a'
      : step.source === 'resist'
        ? '#f2a33a'
        : step.source === 'immune'
          ? '#c9bfd8'
          : step.source === 'segment'
            ? '#f2a33a'
            : '#f2c14e'
  const change =
    step.effect === 'mult_mul'
      ? `×${num(step.value)}`
      : step.effect === 'chill'
        ? ''
        : `${step.effect === 'damage' ? '' : '+'}${num(step.value)}`
  return { name, change, unit: UNIT[step.effect] ?? '', tone: TONE[step.effect], colour, artifact }
}

/** The pixel effect a beat plays: a dart's hit (a killing or big one harder), Chill and Burn on their target, block on the thrower. */
export function fxOf(beat: Beat, trace: DungeonTrace): Omit<FxCue, 'id'> | null {
  if (beat.kind === 'damage') {
    const d = trace.darts[beat.dart]
    return d.target && d.damage > 0 ? { kind: d.killed || d.damage > RUMBLE_OVER.damage ? 'crit' : 'hit', at: { enemy: d.target } } : null
  }
  if (beat.kind !== 'step' && beat.kind !== 'after') return null
  const { effect, target } = beat.step
  if (effect === 'block') return { kind: 'block', at: { hero: trace.seat } }
  if (!target) return null
  if (effect === 'chill' || effect === 'burn') return { kind: effect, at: { enemy: target } }
  return effect === 'damage' ? { kind: 'hit', at: { enemy: target } } : null
}
