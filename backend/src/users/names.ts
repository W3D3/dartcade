// Names are handles: unique ignoring case, 2–20 letters, digits, '.', '_' and '-'; no spaces.
// Spec: docs/superpowers/specs/2026-10-04-friends-design.md ("Names are unique"). The frontend
// mirrors the rules for instant hints (backend/frontend/src/lib/names.ts); the server decides.

export const NAME_MIN = 2
export const NAME_MAX = 20
/** The rules as screens and errors say them. */
export const NAME_RULE = '2–20 letters, digits, . _ or -, no spaces'

const ALLOWED = /^[\p{L}\p{Nd}._-]+$/u

/** As names are compared and stored: trimmed, Unicode NFC (a decomposed "ü" is the same name). */
export function normalizeName(raw: string): string {
  return raw.trim().normalize('NFC')
}

/** Whether a normalized name follows the rules; length counts characters, not UTF-16 units. */
export function isValidName(name: string): boolean {
  const length = Array.from(name).length
  return length >= NAME_MIN && length <= NAME_MAX && ALLOWED.test(name)
}

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
