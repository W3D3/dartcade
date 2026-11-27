// A trace step in words: who made it (by its registry entry) and what the effect did.
import type { TraceStep } from '$shared/dungeon/resolve.js'
import type { Catalogue } from './catalogue.js'

const EFFECT_WORDS: Record<TraceStep['effect'], string> = {
  base_add: 'Base',
  mult_add: 'Mult +',
  mult_mul: 'Mult ×',
  block: 'Block',
  heal: 'Heal',
  burn: 'Burn',
  chill: 'Chill',
  gold: 'Gold',
  damage: 'Damage',
}

type Words = { name: string; description: string }

// What each step source reads from the registries: the entry of a segment item, artifact or class, or of the enemy
function whoMade(step: TraceStep, cat: Catalogue): Words {
  const id = step.id ?? ''
  const enemy = cat.enemies[id]?.name ?? id
  switch (step.source) {
    case 'dart':
      return { name: 'The dart', description: 'Its board score is the Base.' }
    case 'weakness':
      return { name: `${enemy}'s weakness`, description: 'The enemy takes double damage here.' }
    case 'resist':
      return { name: `${enemy}'s resistance`, description: 'The enemy takes half damage here.' }
    case 'immune':
      return { name: `${enemy} is immune`, description: 'The enemy takes no damage here.' }
    case 'segment':
      return entryWords(cat.items[id], id)
    case 'class':
      return entryWords(cat.classes[id], id)
    case 'artifact':
    case 'afterVisit':
      return entryWords(cat.artifacts[id] ?? cat.items[id] ?? cat.classes[id], id)
  }
}

const entryWords = (e: { name: string; description: string } | undefined, id: string): Words => ({
  name: e?.name ?? id,
  description: e?.description ?? '',
})

export function stepWords(step: TraceStep, cat: Catalogue): Words & { effect: string } {
  const sign = step.effect === 'base_add' || step.effect === 'mult_add' ? (step.value >= 0 ? '+' : '') : ''
  return {
    ...whoMade(step, cat),
    effect: step.source === 'dart' ? `Base ${step.value}` : `${EFFECT_WORDS[step.effect]} ${sign}${step.value}`,
  }
}
