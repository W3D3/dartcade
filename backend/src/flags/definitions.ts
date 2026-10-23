// The feature flags, as OpenFeature's in-memory provider takes them: variants, the default, and the
// targeting rule (contextEvaluator), which gets the context contextFor() builds from the session.
// On/off flags are turned on per deployment by FLAGS_ON, number flags set by FLAG_VALUES; both are
// overridden by a stored FlagOverride (db/flagOverrides.ts, applied by flags/index.ts's setOverrides).
import type { EvaluationContext } from '@openfeature/server-sdk'
import { RESERVE_SECONDS, VISIT_SECONDS } from '../shared/ranked.js'
import type { FlagOverride } from '../db/flagOverrides.js'

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
  | { kind: 'boolean'; description: string; defaultRule: 'admins' | 'nobody' }
  | { kind: 'number'; description: string; range: [number, number]; defaultNumber: number }

export const FLAG_META: Record<string, FlagMeta> = {
  'gamemode.minigolf.enabled': {
    kind: 'boolean',
    description: 'Shows Minigolf on the Play page, so players can start Minigolf games.',
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
  'matchmaking.enabled': {
    kind: 'boolean',
    description: 'Turns on ranked play: the Matchmaking page, ratings and ranks.',
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
  'lights.enabled': {
    kind: 'boolean',
    description: 'Shows Settings → Lights, so players can pair WLED devices and drive them from games.',
    defaultRule: 'admins',
  },
  'caller.autodartsImport': {
    kind: 'boolean',
    description: "Lets players import Autodarts' caller voices in Settings → Caller.",
    defaultRule: 'admins',
  },
  'avatar.upload.enabled': {
    kind: 'boolean',
    description: 'Lets players upload a photo as their avatar in Settings → Profile (presets stay available either way).',
    defaultRule: 'admins',
  },
  'matchmaking.visitSeconds': {
    kind: 'number',
    description: 'How long a ranked player has for each visit, in seconds.',
    range: [10, 300],
    defaultNumber: VISIT_SECONDS,
  },
  'matchmaking.reserveSeconds': {
    kind: 'number',
    description: 'Extra time each ranked player can use up across a match when visits run over, in seconds.',
    range: [0, 900],
    defaultNumber: RESERVE_SECONDS,
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
    'gamemode.minigolf.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('gamemode.minigolf.enabled', isAdmin),
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
    'matchmaking.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('matchmaking.enabled', isAdmin),
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
    'lights.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('lights.enabled', isAdmin),
    },
    'caller.autodartsImport': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('caller.autodartsImport', isAdmin),
    },
    'avatar.upload.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('avatar.upload.enabled', isAdmin),
    },
    'matchmaking.visitSeconds': number('matchmaking.visitSeconds', VISIT_SECONDS),
    'matchmaking.reserveSeconds': number('matchmaking.reserveSeconds', RESERVE_SECONDS),
  } as const
}
