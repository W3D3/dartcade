// Small formatting helpers shared across the app.

// Fixed 3-letter abbreviations: Intl's "short" month can render "Sept" depending on ICU data/locale.
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Midnight of the date's day, local time, in ms. */
export const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** "24 Sep". */
export const dayMonth = (d: Date): string => `${d.getDate()} ${MONTHS[d.getMonth()]}`

/** "07". */
export const pad2 = (n: number): string => String(n).padStart(2, '0')

/** "1st", "2nd", "3rd", "4th", "11th". */
export function ordinal(n: number): string {
  const tens = n % 100,
    ones = n % 10
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th'
  return `${n}${suffix}`
}

/** "1 leg", "3 legs", "2 people". */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

/** A name's initial for its avatar: "C", or "?" for a blank name. */
export const initial = (name: string): string => name.trim().charAt(0).toUpperCase() || '?'
