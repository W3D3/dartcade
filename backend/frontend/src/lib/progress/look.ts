// How a player's equipped perks look: the card colours, the banner and the title's name.
// The perks themselves (and what unlocks them) are shared: $shared/progression.js.
import { CARD_COLORS, DEFAULT_EQUIPPED, perk, type Equipped } from '$shared/progression.js'

export type CardColors = { bg: string; fg: string }

export function cardColors(id: string): CardColors {
  return CARD_COLORS[id.replace(/^colors\./, '')] ?? CARD_COLORS.dartcade
}

/** The banner's CSS background: its pattern in the card's accent over the dark card (Profile-Popup board). */
export function bannerStyle(id: string, c: CardColors): string {
  const accent = accentOf(c)
  const mix = (pct: number) => `color-mix(in srgb, ${accent} ${pct}%, ${CARD_SURFACE})`
  switch (id) {
    case 'banner.chalk':
      return `background: repeating-linear-gradient(135deg, color-mix(in srgb, ${accent} 12%, transparent) 0 2px, transparent 2px 16px), ${mix(12)}`
    case 'banner.treble':
      return `background: repeating-conic-gradient(from -9deg at 88% 150%, ${mix(26)} 0 9deg, ${mix(10)} 9deg 18deg)`
    case 'banner.bullseye':
      return `background: repeating-radial-gradient(circle at 86% 75%, ${mix(34)} 0 9px, ${mix(10)} 9px 18px)`
    case 'banner.gold':
      return 'background: linear-gradient(120deg, #3a2f12, #6a5518 50%, #3a2f12)'
    default:
      return `background: ${mix(10)}`
  }
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
