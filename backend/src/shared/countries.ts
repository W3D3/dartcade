import { countries } from 'country-flag-icons'

// country-flag-icons lists every flag it draws: also subdivisions (GB-ENG, BQ-BO, ES-CT) and codes
// that are not an ISO 3166-1 country (EU, XK, ...). A new one of those fails the count in countries.test.ts.
const NOT_A_COUNTRY = new Set(['AC', 'EU', 'IC', 'TA', 'XA', 'XC', 'XK', 'XO'])

/** ISO 3166-1 alpha-2 codes a player may show next to their name (user.country). Names come from Intl.DisplayNames. */
export const COUNTRY_CODES: string[] = countries.filter(code => /^[A-Z]{2}$/.test(code) && !NOT_A_COUNTRY.has(code))

const KNOWN = new Set(COUNTRY_CODES)

export const isCountryCode = (code: string): boolean => KNOWN.has(code)
