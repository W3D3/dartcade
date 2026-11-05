// A bot's avatar chip colour: a 20-step ramp by level, calm green (easiest) to intense red
// (hardest) — unlike avatarColor's name-hash palette, this is meaningful, not arbitrary, so a
// player can read a bot's rough difficulty at a glance before ever seeing its name.
const RAMP = [
  'bg-[#3d6b4a]', // 1
  'bg-[#3d6f5e]', // 2
  'bg-[#3d7373]', // 3
  'bg-[#3d6b73]', // 4
  'bg-[#3d6373]', // 5
  'bg-[#3d5e73]', // 6
  'bg-[#3d5a73]', // 7
  'bg-[#445273]', // 8
  'bg-[#4a4a73]', // 9
  'bg-[#544473]', // 10
  'bg-[#5e3d73]', // 11
  'bg-[#683d6f]', // 12
  'bg-[#733d6b]', // 13
  'bg-[#733d5e]', // 14
  'bg-[#733d50]', // 15
  'bg-[#733d46]', // 16
  'bg-[#733d3d]', // 17
  'bg-[#7e3636]', // 18
  'bg-[#8a3030]', // 19
  'bg-[#9a2a2a]', // 20
] as const

/** The Tailwind background class for a bot's avatar chip at this level (1-20). */
export const botAvatarColor = (level: number): string => RAMP[Math.min(Math.max(Math.round(level), 1), RAMP.length) - 1]
