// Every sound the caller can ask a voice for, grouped for the voice pack details page. A pack may
// hold any of them; what it lacks is skipped when called (`pickClips`).
import type { Clips } from './voices.js'

export type CatalogueKey = { key: string; label: string }
export type CatalogueGroup = { id: string; title: string; hint: string; keys: CatalogueKey[] }

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

/** The scores above 162 that no three darts can make (so a pack never needs a clip for them) */
const UNREACHABLE = new Set([163, 166, 169, 172, 173, 175, 176, 178, 179])
const reachable = (from: number, to: number) => range(from, to).filter(n => !UNREACHABLE.has(n))

/** The leg numbers the caller says after a leg win; a longer match has its legs called by the voice if it has them. */
export const LEG_KEYS = 20

export const CATALOGUE: CatalogueGroup[] = [
  {
    id: 'calls',
    title: 'Calls',
    hint: 'The start of a game, a won leg or match, a bust, and the words in between',
    keys: [
      { key: 'gameon', label: 'Game on' },
      { key: 'bulling_start', label: 'Bull up' },
      { key: 'busted', label: 'Busted' },
      { key: 'gameshot', label: 'Game shot' },
      { key: 'matchshot', label: 'Match shot' },
      { key: 'and', label: 'And' },
      { key: 'you_require', label: 'You require' },
    ],
  },
  {
    id: 'scores',
    title: 'Scores',
    hint: 'What a visit scored. 0 is also said on a bust when the voice has no “Busted”',
    keys: reachable(0, 180).map(n => ({ key: String(n), label: String(n) })),
  },
  {
    id: 'checkouts',
    title: 'Checkouts',
    hint: '“You require N”, as one clip; a voice without it says “You require” and the score',
    keys: reachable(1, 180).map(n => ({ key: `require_${n}`, label: String(n) })),
  },
  {
    id: 'legs',
    title: 'Legs',
    hint: 'The leg just won, after “Game shot and”',
    keys: range(1, LEG_KEYS).map(n => ({ key: `leg_${n}`, label: `Leg ${n}` })),
  },
]

/** The keys a pack holds that no group lists (sets, longer matches), in order. */
export function otherKeys(clips: Clips): string[] {
  const listed = new Set(CATALOGUE.flatMap(g => g.keys.map(k => k.key)))
  return Object.keys(clips)
    .filter(k => clips[k].length > 0 && !listed.has(k))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
}

/** How many of a group's sounds a pack has, and how many the group lists. */
export function haveOf(group: CatalogueGroup, clips: Clips): { have: number; total: number } {
  return { have: group.keys.filter(k => k.key in clips && clips[k.key].length > 0).length, total: group.keys.length }
}
