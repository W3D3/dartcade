import { hrefs } from '$lib/routes'
// Home's Featured banners: new things worth a look. Hand-edited, newest first; a slide shows only
// to players who have what it advertises (its flag is on for them), so nobody is sent to a page
// they can't open. Slides for Cricket and Stats from the design are left out: neither has a page yet.
import minigolfImg from '$lib/assets/games/minigolf-featured.webp'
import type { FlagKey } from '$shared/flags'

export type FeaturedSlide = {
  id: string
  badge: 'NEW' | 'NEW GAME MODE'
  title: string
  text: string
  primary: { label: string; href: string }
  /** The feature flag that has to be on; none: everyone. */
  flag?: FlagKey
  /** An illustration; without one the banner shows `icon`. */
  img?: string
  icon?: 'lights'
}

export const FEATURED: FeaturedSlide[] = [
  {
    id: 'minigolf',
    badge: 'NEW GAME MODE',
    title: 'Minigolf',
    text: 'Your dart is the putter: angle aims, distance is power. Play the courses with your friends, one hole at a time.',
    primary: { label: 'Play minigolf', href: hrefs.play() },
    flag: 'gamemode.minigolf.enabled',
    img: minigolfImg,
  },
  {
    id: 'lights',
    badge: 'NEW',
    title: 'Board lights',
    text: 'Connect WLED lights around your board. They follow whose turn it is, flash on a 180 and count down your checkout.',
    primary: { label: 'Set up lights', href: hrefs.settings('lights') },
    flag: 'lights.enabled',
    icon: 'lights',
  },
]

/** The items whose flag is on (or that have none), in their order. */
export function visibleFeatured<T extends { flag?: FlagKey }>(items: readonly T[], isOn: (flag: FlagKey) => boolean): T[] {
  return items.filter(i => i.flag === undefined || isOn(i.flag))
}
