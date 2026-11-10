/** A code as typed: case, dashes and spaces don't matter. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}
