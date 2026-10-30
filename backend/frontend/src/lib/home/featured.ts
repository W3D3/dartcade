// Home's Featured banners: new things worth a look. Hand-edited, newest first; a slide shows only
// to players who have what it advertises (its flag is on for them), so nobody is sent to a page
// they can't open. Slides for Cricket and Stats from the design are left out: neither has a page yet.
import minigolfImg from '$lib/assets/games/minigolf-featured.webp'

export type FeaturedSlide = {
  id: string
  badge: 'NEW' | 'NEW GAME MODE'
  title: string
  text: string
  primary: { label: string; href: string }
  /** The feature flag that has to be on; none: everyone. */
  flag?: string
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
    primary: { label: 'Play minigolf', href: '#/play' },
    flag: 'gamemode.minigolf.enabled',
    img: minigolfImg,
  },
  {
    id: 'lights',
    badge: 'NEW',
    title: 'Board lights',
    text: 'Connect WLED lights around your board. They follow whose turn it is, flash on a 180 and count down your checkout.',
    primary: { label: 'Set up lights', href: '#/settings/lights' },
    flag: 'lights.enabled',
    icon: 'lights',
  },
]

/** The items whose flag is on (or that have none), in their order. */
export function visibleFeatured<T extends { flag?: string }>(items: readonly T[], isOn: (flag: string) => boolean): T[] {
  return items.filter(i => i.flag === undefined || isOn(i.flag))
}
