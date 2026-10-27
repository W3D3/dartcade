// Home's What's new: hand-edited, newest first. Like the Featured banners, an item about a feature
// behind a flag shows only to players who have it.
import { visibleFeatured } from './featured'

export type NewsItem = { id: string; date: string; title: string; text: string; href: string; flag?: string }

export const NEWS: NewsItem[] = [
  {
    id: 'home',
    date: '2026-10-27',
    title: 'Home',
    text: 'Your form, your rank and what your friends are up to, all on one page.',
    href: '#/',
  },
  {
    id: 'lights',
    date: '2026-10-14',
    title: 'Lights for your board',
    text: 'Pair WLED strips in Settings › Lights and let them follow the game.',
    href: '#/settings/lights',
    flag: 'lights.enabled',
  },
  {
    id: 'ranks',
    date: '2026-10-02',
    title: 'Ranked tiers and reserve timer',
    text: 'Wood to Elite, five stages each. A reserve timer per player.',
    href: '#/matchmaking/ranks',
    flag: 'matchmaking.enabled',
  },
]

/** The newest three that the player has. */
export function visibleNews(items: readonly NewsItem[], isOn: (flag: string) => boolean): NewsItem[] {
  return visibleFeatured(items, isOn).slice(0, 3)
}
