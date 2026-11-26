import type { components } from '$lib/api/schema'

export type ModeStatsBlock = components['schemas']['ProfileModeStats']
type Tile = ModeStatsBlock['tiles'][number]

/** A tile's value as shown: whole numbers, one decimal, or a rounded percentage. */
export function tileValue(t: Pick<Tile, 'value' | 'format'>): string {
  if (t.format === 'percent') return `${Math.round(t.value * 100)}%`
  return t.format === 'decimal' ? t.value.toFixed(1) : String(t.value)
}

/** Only the Stats page's own X01 numbers can be opened from here, and only for yourself. */
export const seeAllStats = (mode: string, self: boolean, statsOn: boolean) => self && statsOn && mode === 'x01'

export type ProfileTab = 'overview' | 'stats' | 'achievements'

/** The tab a profile URL names; no tab, or one we don't know, is the overview. */
export const tabOf = (tab: string | undefined): ProfileTab => (tab === 'stats' || tab === 'achievements' ? tab : 'overview')
