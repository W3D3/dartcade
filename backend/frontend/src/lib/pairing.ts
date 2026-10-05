// Pairing-code helpers shared by the pair-board modal.
// The canonical code is 8 characters from a confusable-free charset,
// displayed to the user in a 4-4 group (e.g. "7KQ4-M2XD").

export const CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 8

const CHARSET_CLASS = `[${CODE_CHARSET}]`

// Uppercase and drop everything that is not a code character, then cap at
// CODE_LENGTH. Used while typing into the segmented input.
export function normalizePairingCode(raw: string): string {
  const chars = raw
    .toUpperCase()
    .split('')
    .filter(c => CODE_CHARSET.includes(c))
  return chars.slice(0, CODE_LENGTH).join('')
}

// Insert a dash between the two 4-character groups for display.
export function formatPairingCode(clean: string): string {
  const c = normalizePairingCode(clean)
  if (c.length <= 4) return c
  return `${c.slice(0, 4)}-${c.slice(4)}`
}

// Pull a code out of arbitrary pasted text — a bare code, a dashed code,
// or a whole log line like "Pairing code 7KQ4-M2XD · new code every 10 min".
export function extractPairingCode(pasted: string): string {
  const up = pasted.toUpperCase()
  // 1) a dashed/spaced 4-4 group
  const grouped = up.match(new RegExp(`${CHARSET_CLASS}{4}[-\\s]${CHARSET_CLASS}{4}`))
  if (grouped) return normalizePairingCode(grouped[0])
  // 2) a standalone run of exactly 8 code characters
  const solid = up.match(new RegExp(`(?<!${CHARSET_CLASS})${CHARSET_CLASS}{8}(?!${CHARSET_CLASS})`))
  if (solid) return solid[0]
  // 3) best effort: strip to code characters and take the first 8
  return normalizePairingCode(up)
}
