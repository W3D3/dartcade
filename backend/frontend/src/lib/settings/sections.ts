/** Settings' sections, in the section nav's order (Settings board); each is `#/settings/<id>`. */
export const SETTINGS_SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'game', label: 'Game preferences' },
  { id: 'boards', label: 'Boards' },
  // Lights is #135: listed, not built
  { id: 'lights', label: 'Lights', soon: true },
  { id: 'caller', label: 'Caller' },
] as const

type Section = (typeof SETTINGS_SECTIONS)[number]
export type SettingsSection = Exclude<Section, { soon: true }>['id']

const isOpen = (s: Section): s is Exclude<Section, { soon: true }> => !('soon' in s)

/** The section a `#/settings/:section` route shows; null for the bare `#/settings` or an unknown one. */
export function sectionOf(param: string | undefined): SettingsSection | null {
  return SETTINGS_SECTIONS.filter(isOpen).find(s => s.id === param)?.id ?? null
}

/** Where the old `#/boards` route goes: the Boards section, keeping its query (`?pair` opens pairing). */
export function boardsRedirect(querystring: string | undefined): string {
  return `/settings/boards${querystring ? `?${querystring}` : ''}`
}
