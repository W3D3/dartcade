/** Settings' sections, in the section nav's order (Settings board); each is `#/settings/<id>`. */
export const SETTINGS_SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'game', label: 'Game preferences' },
  { id: 'boards', label: 'Boards' },
  { id: 'lights', label: 'Lights', flag: 'lights.enabled' },
  { id: 'caller', label: 'Caller' },
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id']

/** The section a `#/settings/:section` route shows; null for the bare `#/settings` or an unknown one. */
export function sectionOf(param: string | undefined): SettingsSection | null {
  return SETTINGS_SECTIONS.find(s => s.id === param)?.id ?? null
}

/** Where the old `#/boards` route goes: the Boards section, keeping its query (`?pair` opens pairing). */
export function boardsRedirect(querystring: string | undefined): string {
  return `/settings/boards${querystring ? `?${querystring}` : ''}`
}
