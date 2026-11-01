// The country a player shows (Settings → Profile): names from the browser's region names, flags
// from country-flag-icons' SVGs, served as files (not inlined) and fetched only when drawn.
import { COUNTRY_CODES } from '$shared/countries.js'

const flags = import.meta.glob<string>('/node_modules/country-flag-icons/3x2/*.svg', {
  query: '?url&no-inline',
  import: 'default',
  eager: true,
})
const names = new Intl.DisplayNames(['en'], { type: 'region' })

/** The flag's image URL; null for a code without one. */
export const flagUrl = (code: string): string | null => flags[`/node_modules/country-flag-icons/3x2/${code}.svg`] ?? null

/** "Austria" for AT; the code itself if the browser doesn't know it. */
export const countryName = (code: string): string => names.of(code) ?? code

/** Every country by name, for the picker. */
export const COUNTRY_OPTIONS = COUNTRY_CODES.map(code => ({ value: code, label: countryName(code) })).sort((a, b) =>
  a.label.localeCompare(b.label, 'en'),
)

const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** The countries whose name contains the query (accents and case ignored) or whose code is it; all of them for a blank one. */
export function searchCountries(query: string): typeof COUNTRY_OPTIONS {
  const q = plain(query.trim())
  if (!q) return COUNTRY_OPTIONS
  return COUNTRY_OPTIONS.filter(o => plain(o.label).includes(q) || o.value.toLowerCase() === q)
}
