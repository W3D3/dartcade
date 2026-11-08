// The feature flags, as OpenFeature's in-memory provider takes them: variants, the default, and the
// targeting rule (contextEvaluator), which gets the context contextFor() builds from the session.
// On/off flags are turned on per deployment by FLAGS_ON, number flags set by FLAG_VALUES; both are
// overridden by a stored FlagOverride (db/flagOverrides.ts, applied by flags/index.ts's setOverrides).
import type { EvaluationContext } from '@openfeature/server-sdk'
import { ACCEPT_SECONDS, RESERVE_SECONDS, VISIT_SECONDS } from '../shared/ranked.js'
import type { FlagOverride } from '../db/flagOverrides.js'

/** The defaults of the lobby.idleMinutes.* flags: minutes of inactivity before a lobby closes. */
export const LOBBY_IDLE_SOLO_MINUTES = 10
export const LOBBY_IDLE_SHARED_MINUTES = 20

const isAdmin = (ctx: EvaluationContext) => ctx.admin === true

/** What an override's mode means for who the flag is on for. */
function modeRule(o: { mode: 'off' | 'admins' | 'users' | 'on'; userIds: string[] }): (ctx: EvaluationContext) => boolean {
  switch (o.mode) {
    case 'off':
      return () => false
    case 'admins':
      return isAdmin
    case 'users':
      return ctx => isAdmin(ctx) || (ctx.targetingKey !== undefined && o.userIds.includes(ctx.targetingKey))
    case 'on':
      return () => true
  }
}

/** What the admin flags page shows for one flag (schema/api-v1.yaml, api/adminFlags.ts): who an
 *  on/off flag is on for by default, or a number flag's range and code default. */
export type FlagMeta =
  | { kind: 'boolean'; description: string; defaultRule: 'admins' | 'nobody' | 'everyone' }
  | { kind: 'number'; description: string; range: [number, number]; defaultNumber: number }

export const FLAG_META: Record<string, FlagMeta> = {
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
}

export function flagDefinitions(
  flagsOn: ReadonlySet<string>,
  values: ReadonlyMap<string, number> = new Map(),
  overrides: ReadonlyMap<string, FlagOverride> = new Map(),
) {
  const on = (key: string, rule: (ctx: EvaluationContext) => boolean) => {
    const o = overrides.get(key)
    const effectiveRule = o && 'mode' in o ? modeRule(o) : rule
    const effectiveFlagsOn = o && 'mode' in o ? false : flagsOn.has(key)
    return (ctx: EvaluationContext) => (effectiveFlagsOn || effectiveRule(ctx) ? ('on' as const) : ('off' as const))
  }
  // A number that is the same for everyone: an override, else FLAG_VALUES, else its default
  const number = (key: string, fallback: number) => {
    const o = overrides.get(key)
    const override = o && 'number' in o ? o.number : undefined
    const deployment = values.get(key)
    return {
      variants: { default: fallback, deployment: deployment ?? fallback, override: override ?? fallback },
      defaultVariant:
        override !== undefined ? ('override' as const) : deployment === undefined ? ('default' as const) : ('deployment' as const),
      disabled: false,
    }
  }
  return {
    // Descriptions: FLAG_META above, the single source (shown on the admin flags page).
    'home.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('home.enabled', () => true),
    },
    'gamemode.minigolf.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('gamemode.minigolf.enabled', isAdmin),
    },
    'minigolf.userCourses.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('minigolf.userCourses.enabled', isAdmin),
    },
    'gamemode.p121.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('gamemode.p121.enabled', isAdmin),
    },
    'gamemode.hilo.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('gamemode.hilo.enabled', isAdmin),
    },
    'gamemode.cricket.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('gamemode.cricket.enabled', isAdmin),
    },
    'auth.passkeys.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('auth.passkeys.enabled', isAdmin),
    },
    'matchmaking.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('matchmaking.enabled', isAdmin),
    },
    'achievements.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('achievements.enabled', isAdmin),
    },
    'progression.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('progression.enabled', isAdmin),
    },
    'progression.manualDarts': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('progression.manualDarts', () => false),
    },
    'sounds.anyPack': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('sounds.anyPack', isAdmin),
    },
    'lights.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('lights.enabled', isAdmin),
    },
    'detection.collect.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('detection.collect.enabled', () => true),
    },
    'coach.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('coach.enabled', isAdmin),
    },
    'coach.live.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('coach.live.enabled', () => false),
    },
    'coach.debug.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('coach.debug.enabled', () => false),
    },
    'stats.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('stats.enabled', isAdmin),
    },
    'bigscreen.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('bigscreen.enabled', isAdmin),
    },
    'watch.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('watch.enabled', isAdmin),
    },
    'caller.autodartsImport': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('caller.autodartsImport', isAdmin),
    },
    'caller.packDetails': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('caller.packDetails', isAdmin),
    },
    'avatar.upload.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('avatar.upload.enabled', isAdmin),
    },
    'matchmaking.manualEntry': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('matchmaking.manualEntry', () => true),
    },
    'matchmaking.visitSeconds': number('matchmaking.visitSeconds', VISIT_SECONDS),
    'matchmaking.acceptSeconds': number('matchmaking.acceptSeconds', ACCEPT_SECONDS),
    'matchmaking.reserveSeconds': number('matchmaking.reserveSeconds', RESERVE_SECONDS),
    'lobby.idleMinutes.solo': number('lobby.idleMinutes.solo', LOBBY_IDLE_SOLO_MINUTES),
    'lobby.idleMinutes.shared': number('lobby.idleMinutes.shared', LOBBY_IDLE_SHARED_MINUTES),
  } as const
}
