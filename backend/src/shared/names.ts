// Names are handles: unique ignoring case, 2–20 letters, digits, '.', '_' and '-'; no spaces.
// Spec: docs/superpowers/specs/2026-10-04-friends-design.md ("Names are unique"). The server and
// the SPA (lib/names.ts, for instant hints) share these rules; the server decides.

export const NAME_MIN = 2
export const NAME_MAX = 20
/** The rules as screens and errors say them. */
export const NAME_RULE = `${NAME_MIN}–${NAME_MAX} letters, digits, . _ or -, no spaces`

/** The characters a name is made of. */
export const NAME_ALLOWED = /^[\p{L}\p{Nd}._-]+$/u

/** As names are compared and stored: trimmed, Unicode NFC (a decomposed "ü" is the same name). */
export function normalizeName(raw: string): string {
  return raw.trim().normalize('NFC')
}

/** Whether a normalized name follows the rules; length counts characters, not UTF-16 units. */
export function isValidName(name: string): boolean {
  const length = Array.from(name).length
  return length >= NAME_MIN && length <= NAME_MAX && NAME_ALLOWED.test(name)
}

/** Characters no text shown to other players may hold (names, course and tournament texts). */
// oxlint-disable-next-line no-control-regex -- the point is to refuse them
export const CONTROL_CHARS = /[\u0000-\u001f\u007f]/
