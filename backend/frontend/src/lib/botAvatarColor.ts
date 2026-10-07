// A bot's avatar chip colour: a 10-step ramp by level, calm green (easiest) to intense red
// (hardest) — unlike avatarColor's name-hash palette, this is meaningful, not arbitrary, so a
// player can read a bot's rough difficulty at a glance before ever seeing its name.
const RAMP = [
  'bg-[#3d6b4a]', // 1 — calm green
  'bg-[#3d7373]', // 2 — teal
  'bg-[#3d6373]', // 3
  'bg-[#3d5a73]', // 4 — blue
  'bg-[#4a4a73]', // 5
  'bg-[#5e3d73]', // 6 — purple
  'bg-[#733d6b]', // 7
  'bg-[#733d50]', // 8
  'bg-[#733d3d]', // 9
  'bg-[#8a3030]', // 10 — intense red
] as const

/** The Tailwind background class for a bot's avatar chip at this level (1-10). */
export const botAvatarColor = (level: number): string => RAMP[Math.min(Math.max(Math.round(level), 1), 10) - 1]
