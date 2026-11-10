// Server-side name clean-up; the rules themselves are in shared/names.ts.
import { NAME_MAX, NAME_MIN, normalizeName } from '../shared/names.js'

/** An old name cut down to the rules: spaces become '.', other characters go; "player" if too little is left. */
export function cleanName(raw: string): string {
  const kept = normalizeName(raw)
    .replace(/\s+/gu, '.')
    .replace(/[^\p{L}\p{Nd}._-]/gu, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
  const cut = Array.from(kept).slice(0, NAME_MAX).join('')
  return Array.from(cut).length >= NAME_MIN ? cut : 'player'
}

/** `base` with a number on the end; the base is cut so the whole stays within NAME_MAX. */
export function numbered(base: string, n: number): string {
  const suffix = String(n)
  return (
    Array.from(base)
      .slice(0, NAME_MAX - suffix.length)
      .join('') + suffix
  )
}
