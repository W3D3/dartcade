// Admin Cosmetics page (`#/admin/cosmetics`): every cosmetic in the shared catalogue
// ($shared/progression.js PERKS), grouped by kind, with where it comes from.
import { PERKS, PERK_KINDS, obtainable, unlockText, type Perk, type PerkKind } from '$shared/progression.js'
import { KIND_LABEL } from '$lib/progress/look'

export type Source = 'Level track' | 'Streak' | 'Ranked' | 'Not unlockable yet'

/** Where a cosmetic comes from: a challenge one can't be earned yet. */
export function sourceOf(p: Perk): Source {
  if (!obtainable(p)) return 'Not unlockable yet'
  if ('level' in p.unlock) return 'Level track'
  return 'streak' in p.unlock ? 'Streak' : 'Ranked'
}

export type CosmeticGroup = { kind: PerkKind; label: string; perks: Perk[] }

/** The cosmetics matching `query` (name, id, unlock or source; any case), one group per kind in catalogue order. */
export function cosmeticGroups(query: string): CosmeticGroup[] {
  const q = query.trim().toLowerCase()
  const hit = (p: Perk) => !q || [p.name, p.id, unlockText(p.unlock), sourceOf(p)].some(s => s.toLowerCase().includes(q))
  return PERK_KINDS.map(kind => ({ kind, label: KIND_LABEL[kind].many, perks: PERKS.filter(p => p.kind === kind && hit(p)) }))
}
