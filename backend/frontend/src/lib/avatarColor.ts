// A player's avatar chip, when there's no photo: a colour picked from a fixed palette, so the
// same name always gets the same colour (not random, not role-based like accent/guest/quiet).

// Muted, dark hues that read well with white text and stay clear of the semantic colours
// (accent lime, live red, warn amber). Order doesn't matter — it's a lookup table, not a scale.
const PALETTE = [
  'bg-[#4a6b3a]', // green
  'bg-[#3d5a73]', // blue
  'bg-[#5e3d73]', // purple
  'bg-[#73503d]', // brown
  'bg-[#3d7373]', // teal
  'bg-[#733d55]', // rose
  'bg-[#6b6b3a]', // olive
  'bg-[#3d4a73]', // indigo
] as const

/** FNV-1a: small, deterministic, good enough spread for a handful of buckets. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** The Tailwind background class for `name`'s avatar chip. Stable for the same name. */
export const avatarColor = (name: string): string => PALETTE[hash(name) % PALETTE.length]
