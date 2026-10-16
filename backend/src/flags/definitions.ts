// The feature flags, as OpenFeature's in-memory provider takes them: variants, the default, and the
// targeting rule (contextEvaluator), which gets the context contextFor() builds from the session.
// On/off flags are turned on per deployment by FLAGS_ON, number flags set by FLAG_VALUES.
import type { EvaluationContext } from '@openfeature/server-sdk'
import { RESERVE_SECONDS, VISIT_SECONDS } from '../shared/ranked.js'

const isAdmin = (ctx: EvaluationContext) => ctx.admin === true

export function flagDefinitions(flagsOn: ReadonlySet<string>, values: ReadonlyMap<string, number> = new Map()) {
  const on = (key: string, rule: (ctx: EvaluationContext) => boolean) => (ctx: EvaluationContext) =>
    flagsOn.has(key) || rule(ctx) ? ('on' as const) : ('off' as const)
  // A number that is the same for everyone: its default, or what FLAG_VALUES sets it to
  const number = (key: string, fallback: number) => {
    const set = values.get(key)
    return {
      variants: { default: fallback, deployment: set ?? fallback },
      defaultVariant: set === undefined ? ('default' as const) : ('deployment' as const),
      disabled: false,
    }
  }
  return {
    // Minigolf is played by admins until it ships (FLAGS_ON=gamemode.minigolf.enabled for everyone)
    'gamemode.minigolf.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('gamemode.minigolf.enabled', isAdmin),
    },
    // The 2D Minigolf (physics and view), kept behind 3D: off for everyone, admins too
    'gamemode.minigolf.flat': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('gamemode.minigolf.flat', () => false),
    },
    // Ranked matchmaking is tried by admins until it ships (FLAGS_ON=matchmaking.enabled for everyone)
    'matchmaking.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('matchmaking.enabled', isAdmin),
    },
    // Importing Autodarts' caller voices is tried by admins until it ships (FLAGS_ON=caller.autodartsImport for everyone)
    'caller.autodartsImport': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('caller.autodartsImport', isAdmin),
    },
    // The ranked time limit, in seconds: per visit, and the reserve each player gets on top
    'matchmaking.visitSeconds': number('matchmaking.visitSeconds', VISIT_SECONDS),
    'matchmaking.reserveSeconds': number('matchmaking.reserveSeconds', RESERVE_SECONDS),
  } as const
}
