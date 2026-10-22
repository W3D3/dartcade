// How a player's equipped perks look: the card colours, the banner and the title's name.
// The perks themselves (and what unlocks them) are shared: $shared/progression.js.
import { CARD_COLORS, DEFAULT_EQUIPPED, perk, type Equipped, type PerkKind } from '$shared/progression.js'

export type CardColors = (typeof CARD_COLORS)[string]

export function cardColors(id: string): CardColors {
  return CARD_COLORS[id.replace(/^colors\./, '')] ?? CARD_COLORS.dartcade
}

/** A banner's CSS motion over its background (classes in app.css; off under reduced motion). */
type Motion = 'sweep' | 'shimmer'
type Banner = {
  /** The CSS background, from the card's accent and `mix(pct)`: the accent mixed into the dark card. */
  bg: (accent: string, mix: (pct: number) => string) => string
  motion?: Motion
}
const tint = (accent: string, pct: number) => `color-mix(in srgb, ${accent} ${pct}%, transparent)`

/** Every banner's look, by perk id: its pattern in the card's accent over the dark card (Profile-Popup board). */
export const BANNERS: Record<string, Banner> = {
  'banner.plain': { bg: (_, mix) => mix(10) },
  'banner.chalk-scribbles': {
    bg: (a, mix) =>
      `repeating-linear-gradient(115deg, ${tint(a, 14)} 0 1px, transparent 1px 9px), repeating-linear-gradient(28deg, ${tint(a, 10)} 0 1px, transparent 1px 13px), ${mix(10)}`,
  },
  'banner.oche-tape': {
    bg: (a, mix) =>
      `linear-gradient(180deg, transparent 0 64%, ${tint(a, 60)} 64% 74%, transparent 74%), repeating-linear-gradient(90deg, ${mix(8)} 0 42px, ${mix(12)} 42px 84px)`,
  },
  'banner.cork': {
    bg: a =>
      `radial-gradient(#c79a62 0.8px, transparent 1.4px) 0 0 / 7px 7px, radial-gradient(#6e4a26 0.8px, transparent 1.4px) 3px 4px / 9px 9px, color-mix(in srgb, ${a} 10%, #3a2a1a)`,
  },
  'banner.neon': {
    bg: a =>
      `linear-gradient(180deg, transparent 44%, ${a} 44% 47%, transparent 47%), radial-gradient(ellipse 70% 45% at 50% 46%, ${tint(a, 35)}, transparent 70%), #101210`,
  },
  'banner.floodlights': {
    bg: (a, mix) =>
      `radial-gradient(ellipse 40% 60% at 20% 0, ${tint(a, 30)}, transparent), radial-gradient(ellipse 40% 60% at 80% 0, ${tint(a, 30)}, transparent), ${mix(8)}`,
    motion: 'sweep',
  },
  'banner.scoreboard': {
    bg: (a, mix) =>
      `repeating-linear-gradient(90deg, ${tint(a, 18)} 0 2px, transparent 2px 22px), repeating-linear-gradient(0deg, ${tint(a, 18)} 0 2px, transparent 2px 22px), ${mix(6)}`,
  },
  'banner.stage': {
    bg: (a, mix) =>
      `radial-gradient(ellipse 28% 95% at 50% 0, ${tint(a, 42)}, transparent 75%), linear-gradient(180deg, ${mix(5)}, ${mix(18)})`,
  },
  'banner.smoke': {
    bg: (a, mix) =>
      `radial-gradient(ellipse 35% 60% at 20% 70%, ${tint(a, 18)}, transparent), radial-gradient(ellipse 40% 55% at 60% 40%, ${tint(a, 14)}, transparent), radial-gradient(ellipse 30% 50% at 90% 80%, ${tint(a, 16)}, transparent), ${mix(8)}`,
  },
  'banner.arena': {
    bg: (a, mix) =>
      `radial-gradient(circle at 12% 0, ${a} 0 3px, ${tint(a, 30)} 4px, transparent 34px), radial-gradient(circle at 37% 0, ${a} 0 3px, ${tint(a, 30)} 4px, transparent 34px), radial-gradient(circle at 63% 0, ${a} 0 3px, ${tint(a, 30)} 4px, transparent 34px), radial-gradient(circle at 88% 0, ${a} 0 3px, ${tint(a, 30)} 4px, transparent 34px), ${mix(10)}`,
  },
  'banner.fireworks': {
    bg: (a, mix) =>
      `radial-gradient(circle at 30% 80%, ${a} 0 2px, transparent 3px), radial-gradient(circle at 88% 30%, ${a} 0 2px, transparent 3px), radial-gradient(circle at 70% 45%, transparent 0 30px, ${mix(10)} 44px), repeating-conic-gradient(from 0deg at 70% 45%, ${tint(a, 60)} 0 3deg, transparent 3deg 18deg), ${mix(10)}`,
  },
  'banner.golden-hour': { bg: a => `linear-gradient(172deg, color-mix(in srgb, ${a} 12%, #2a1a10), #7a4a1e 62%, #d89a40)` },
  'banner.legend': { bg: () => 'linear-gradient(120deg, #3a2f12, #8a6a1c 40%, #f2c14e 50%, #8a6a1c 60%, #3a2f12)', motion: 'shimmer' },
  'banner.gold': { bg: () => 'linear-gradient(120deg, #3a2f12, #6a5518 50%, #3a2f12)' },
}

/** The banner's inline CSS: its background, and the accent its motion is drawn in. */
export function bannerStyle(id: string, c: CardColors): string {
  const accent = accentOf(c)
  const mix = (pct: number) => `color-mix(in srgb, ${accent} ${pct}%, ${CARD_SURFACE})`
  return `background: ${(BANNERS[id] ?? BANNERS['banner.plain']).bg(accent, mix)}; --cos-accent: ${accent}`
}

/** The banner's motion class (`cos-sweep`), or '' for a still one. */
export const bannerClass = (id: string): string => {
  const motion = id in BANNERS ? BANNERS[id].motion : undefined
  return motion ? `cos-${motion}` : ''
}

/** The class laying a card colour's special effect over the card (`cos-holo`), or ''. */
export const colorsClass = (id: string): string => {
  const effect = cardColors(id).effect
  return effect ? `cos-${effect}` : ''
}

/** What a kind is called: one of it (a tab, a chip) and the lot (the collection). */
export const KIND_LABEL: Record<PerkKind, { one: string; many: string }> = {
  title: { one: 'Title', many: 'Titles' },
  banner: { one: 'Banner', many: 'Banners' },
  colors: { one: 'Colours', many: 'Card colours' },
  picture: { one: 'Picture', many: 'Pictures' },
  frame: { one: 'Frame', many: 'Frames' },
  name: { one: 'Name', many: 'Name styles' },
  sound: { one: 'Sounds', many: 'Sound packs' },
  celebration: { one: 'Celebration', many: 'Celebrations' },
}

/** 'Oche Regular' */
export const titleName = (look: Pick<Equipped, 'title'>): string => perk(look.title)?.name ?? perk(DEFAULT_EQUIPPED.title)?.name ?? ''

// WCAG relative luminance of a #rrggbb colour
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * The pair's light tone: the card itself stays the app's dark surface (Profile-Popup board), so
 * the name, the banner's tint and the picture take whichever of the two colours reads on it.
 */
export const accentOf = (c: CardColors): string => (luminance(c.fg) >= luminance(c.bg) ? c.fg : c.bg)

/** The dark surface the profile card sits on. */
export const CARD_SURFACE = '#1f221c'
