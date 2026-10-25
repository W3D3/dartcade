// The rewards track (Rewards board): every level up to the top one and what it unlocks, and the
// rewards off the track (day streak, ranked). Read from the catalogue, $shared/progression.js.
import { PERKS, listed, unlockText, type EquipKind, type Equipped, type Perk, type PerkKind } from '$shared/progression.js'
import type { components } from '$lib/api/schema'
import { KIND_LABEL } from './look'

type Avatar = components['schemas']['Avatar']

// The level 1 "nothing" picks (no frame, plain name, no sounds, the standard win screen) aren't rewards
const NOTHING = new Set(['frame.none', 'name.plain', 'sound.none', 'celebration.standard'])
// A level's rewards in the order the track names them: the showiest first, titles last
const ORDER: readonly PerkKind[] = ['name', 'celebration', 'banner', 'frame', 'picture', 'sound', 'colors', 'title']

export type TrackLevel = {
  level: number
  perks: Perk[]
  /** 'Flight + Pub green', 'Starter set' */
  label: string
  /** 'Picture + Colours', '4 rewards' */
  kinds: string
}

const levelOf = (p: Perk): number | null => ('level' in p.unlock ? p.unlock.level : null)
// 'Bronze frame', 'Pub sounds'
const trackName = (p: Perk): string => (p.kind === 'frame' ? `${p.name} frame` : p.kind === 'sound' ? `${p.name} sounds` : p.name)

/** The top level: the last one that unlocks something. */
export const TOP_LEVEL = Math.max(...PERKS.map(p => levelOf(p) ?? 0))

/** Every level from 1 to the top, with what it unlocks. */
export const TRACK: readonly TrackLevel[] = Array.from({ length: TOP_LEVEL }, (_, i) => {
  const level = i + 1
  const perks = PERKS.filter(p => levelOf(p) === level && !NOTHING.has(p.id)).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
  // Three or more with a title is a set, named by it: level 1's and the top level's
  const title = perks.length > 2 ? perks.find(p => p.kind === 'title') : undefined
  const set = title !== undefined
  const label = level === 1 ? 'Starter set' : title ? title.name : perks.map(trackName).join(' + ')
  const kinds = set ? `${perks.length} rewards` : [...new Set(perks.map(p => KIND_LABEL[p.kind].one))].join(' + ')
  return { level, perks, label, kinds }
})

/** Every fifth level brings something bigger, every tenth more so, and the top one most. */
export function levelTier(level: number): 'top' | 'ten' | 'five' | null {
  if (level === TOP_LEVEL) return 'top'
  if (level % 10 === 0) return 'ten'
  return level % 5 === 0 ? 'five' : null
}

/** The next fifth level after `level` (the next big one), up to the top. */
export const nextBigLevel = (level: number): number => Math.min(TOP_LEVEL, Math.ceil((level + 1) / 5) * 5)

export type OffTrack = { perks: Perk[]; name: string; when: string }

/**
 * The rewards earned with the day streak, in ranked and by challenges, one entry per way to earn them:
 * a challenge one only when you hold it (`held`: perk ids), as nothing unlocks those yet.
 */
export function offTrack(held: readonly string[]): OffTrack[] {
  const groups = new Map<string, Perk[]>()
  for (const p of PERKS) {
    if (levelOf(p) !== null || !listed(p, held)) continue
    const when = unlockText(p.unlock)
    groups.set(when, [...(groups.get(when) ?? []), p])
  }
  // Streaks by length, then ranked (ten wins before reaching Gold), then the challenges
  const order = (ps: Perk[]) => {
    const u = ps[0].unlock
    if ('streak' in u) return u.streak
    if ('event' in u) return u.event === 'rankedWins' ? 1e6 : 1e6 + 1
    return 1e6 + 2
  }
  return [...groups]
    .map(([when, perks]) => ({ perks, when, name: perks.map(p => p.name).join(' + ') }))
    .sort((a, b) => order(a.perks) - order(b.perks))
}

/** What you wear: your card's look and your picture. */
export type Worn = { equipped: Equipped; avatar: Avatar | undefined }

/** Whether `p` is what you wear: a picture when both layers are its finish. */
export function isWorn(p: Perk, { equipped, avatar }: Worn): boolean {
  if (p.kind !== 'picture') return equipped[p.kind] === p.id
  const finish = p.id.slice('picture.'.length)
  return avatar?.kind === 'preset' && avatar.foreground === finish && avatar.background === finish
}

/** What Apply all writes for a reward: its unlocked items not worn yet, the picture's finish apart (PATCH /api/me). */
export function applyAllPlan(perks: readonly Perk[], unlocked: readonly string[], worn: Worn) {
  const todo = perks.filter(p => unlocked.includes(p.id) && !isWorn(p, worn))
  const picture = todo.find(p => p.kind === 'picture')?.id.slice('picture.'.length) ?? null
  const equip: Partial<Record<EquipKind, string>> = {}
  for (const p of todo) if (p.kind !== 'picture') equip[p.kind] = p.id
  return { equip, picture, empty: todo.length === 0 }
}
