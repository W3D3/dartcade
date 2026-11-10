// What the admin flags page shows for each flag, and the type of a flag key. Plain data, so the SPA
// imports FlagKey too; the evaluation rules are in flags/definitions.ts.
import { ACCEPT_SECONDS, RESERVE_SECONDS, VISIT_SECONDS } from './ranked.js'

/** The defaults of the lobby.idleMinutes.* flags: minutes of inactivity before a lobby closes. */
export const LOBBY_IDLE_SOLO_MINUTES = 10
export const LOBBY_IDLE_SHARED_MINUTES = 20

/** What the admin flags page shows for one flag (schema/api-v1.yaml, api/adminFlags.ts): who an
 *  on/off flag is on for by default, or a number flag's range and code default. */
export type FlagMeta =
  | { kind: 'boolean'; description: string; defaultRule: 'admins' | 'nobody' | 'everyone' }
  | { kind: 'number'; description: string; range: [number, number]; defaultNumber: number }

export const FLAG_META = {
  'home.enabled': {
    kind: 'boolean',
    description: 'Makes Home the landing page. Off shows the Play page at the root instead.',
    defaultRule: 'everyone',
  },
  'gamemode.minigolf.enabled': {
    kind: 'boolean',
    description: 'Shows Minigolf on the Play page, so players can start Minigolf games.',
    defaultRule: 'admins',
  },
  'minigolf.userCourses.enabled': {
    kind: 'boolean',
    description: 'Lets players make, publish and play their own Minigolf courses (on top of the Minigolf game mode).',
    defaultRule: 'admins',
  },
  'gamemode.p121.enabled': {
    kind: 'boolean',
    description: 'Shows 121, the checkout drill, on the Play page.',
    defaultRule: 'admins',
  },
  'gamemode.hilo.enabled': {
    kind: 'boolean',
    description: 'Shows Higher Lower on the Play page.',
    defaultRule: 'admins',
  },
  'gamemode.cricket.enabled': {
    kind: 'boolean',
    description: 'Shows Cricket on the Play page.',
    defaultRule: 'admins',
  },
  'auth.passkeys.enabled': {
    kind: 'boolean',
    description: 'Lets players add passkeys to their account, sign in with one and confirm account deletion with one.',
    defaultRule: 'admins',
  },
  'matchmaking.enabled': {
    kind: 'boolean',
    description: 'Turns on ranked play: the Matchmaking page, ratings and ranks.',
    defaultRule: 'admins',
  },
  'achievements.enabled': {
    kind: 'boolean',
    description:
      'Turns on achievements: badges with tiers counted from finished games, their XP, the unlock push, the showcase and the profile tab. Counting runs for everyone; this gates what is paid and shown.',
    defaultRule: 'admins',
  },
  'progression.enabled': {
    kind: 'boolean',
    description:
      'Turns on progression: XP and levels, the Progress page, the XP chip on the win screen, day streaks, challenges and profile cosmetics.',
    defaultRule: 'admins',
  },
  'progression.manualDarts': {
    kind: 'boolean',
    description:
      'Lets typed-in darts count towards dart challenges (doubles, trebles, checkouts) for testing without a board. Dart XP still ignores them.',
    defaultRule: 'nobody',
  },
  'sounds.anyPack': {
    kind: 'boolean',
    description: 'Lets a player pick any sound pack in Settings → Sounds to play for every dart, not only the ones they unlocked.',
    defaultRule: 'admins',
  },
  'lights.enabled': {
    kind: 'boolean',
    description: 'Shows Settings → Lights, so players can pair WLED devices and drive them from games.',
    defaultRule: 'admins',
  },
  'detection.collect.enabled': {
    kind: 'boolean',
    description:
      "Keeps each camera dart's before and after stills as training data for the dart detection model, on boards whose owner has it on; shows that setting on their Boards page. Off stops collecting at once.",
    defaultRule: 'everyone',
  },
  'coach.enabled': {
    kind: 'boolean',
    description:
      "Shows the Coach: a review of a finished X01 game's darts on its details page, and the Coach page listing the games it can review.",
    defaultRule: 'admins',
  },
  'coach.live.enabled': {
    kind: 'boolean',
    description:
      'Shows the live coach beside a solo X01 game (double out): the best aims for the next dart, how each dart of the visit is classed, and the grade of the last visit.',
    defaultRule: 'nobody',
  },
  'coach.debug.enabled': {
    kind: 'boolean',
    description: "Shows the coach's probabilities and model numbers on the leg review and live panel, for checking the model.",
    defaultRule: 'nobody',
  },
  'stats.enabled': {
    kind: 'boolean',
    description:
      'Shows the Stats page: your X01 averages, scoring and checkouts over your last legs or days, compared with the same range before.',
    defaultRule: 'admins',
  },
  'bigscreen.enabled': {
    kind: 'boolean',
    description: "Big screen: a view-only game display that follows a board, optionally on the bridge machine's screen",
    defaultRule: 'admins',
  },
  'watch.enabled': {
    kind: 'boolean',
    description: "Watch: friends can watch each other's running games, view only, from the Friends page or Home.",
    defaultRule: 'admins',
  },
  'caller.autodartsImport': {
    kind: 'boolean',
    description: "Lets players import Autodarts' caller voices in Settings → Caller.",
    defaultRule: 'admins',
  },
  'caller.packDetails': {
    kind: 'boolean',
    description:
      'Adds a Details button to each imported voice pack in Settings → Caller: every sound the caller can use, with a preview of each one the pack has.',
    defaultRule: 'admins',
  },
  'avatar.upload.enabled': {
    kind: 'boolean',
    description: 'Lets players upload a photo as their avatar through the API. There is no UI for it for now.',
    defaultRule: 'admins',
  },
  'matchmaking.manualEntry': {
    kind: 'boolean',
    description: 'Lets ranked players enter darts by hand. Off: the server rejects hand-entered darts in ranked games.',
    defaultRule: 'everyone',
  },
  'matchmaking.visitSeconds': {
    kind: 'number',
    description: 'How long a ranked player has for each visit, in seconds.',
    range: [10, 300],
    defaultNumber: VISIT_SECONDS,
  },
  'matchmaking.acceptSeconds': {
    kind: 'number',
    description: 'How long both sides of a found ranked match have to accept it, in seconds.',
    range: [10, 300],
    defaultNumber: ACCEPT_SECONDS,
  },
  'matchmaking.reserveSeconds': {
    kind: 'number',
    description: 'Extra time each ranked player can use up across a match when visits run over, in seconds.',
    range: [0, 900],
    defaultNumber: RESERVE_SECONDS,
  },
  'lobby.idleMinutes.solo': {
    kind: 'number',
    description:
      'Minutes without activity after which a lobby with one real player (guests and bots do not count) closes by itself. A running game counts as idle only once it has had no dart, correction or bull-off step for this long (the game is then aborted); ranked games are never closed this way.',
    range: [1, 1440],
    defaultNumber: LOBBY_IDLE_SOLO_MINUTES,
  },
  'lobby.idleMinutes.shared': {
    kind: 'number',
    description:
      'Minutes without activity after which a lobby with more than one real player (guests and bots do not count) closes by itself. A running game counts as idle only once it has had no dart, correction or bull-off step for this long (the game is then aborted); ranked games are never closed this way.',
    range: [1, 1440],
    defaultNumber: LOBBY_IDLE_SHARED_MINUTES,
  },
} satisfies Record<string, FlagMeta>

/** Every flag key; the flag lookups take only these. */
export type FlagKey = keyof typeof FLAG_META
