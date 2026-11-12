/** "1st", "2nd", "3rd", "4th", "11th". */
export function ordinal(n: number): string {
  const tens = n % 100,
    ones = n % 10
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th'
  return `${n}${suffix}`
}
