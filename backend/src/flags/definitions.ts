// The feature flags, as OpenFeature's in-memory provider takes them: variants, the default, and the
// targeting rule (contextEvaluator), which gets the context contextFor() builds from the session.
// On/off flags are turned on per deployment by FLAGS_ON, number flags set by FLAG_VALUES; both are
// overridden by a stored FlagOverride (db/flagOverrides.ts, applied by flags/index.ts's setOverrides).
import type { EvaluationContext, TypedInMemoryProvider } from '@openfeature/server-sdk'
import { FLAG_META } from '../shared/flags.js'
import type { FlagOverride } from '../db/flagOverrides.js'

const isAdmin = (ctx: EvaluationContext) => ctx.admin === true
// contextFor sets `moderator` for admins too
const isModerator = (ctx: EvaluationContext) => ctx.moderator === true

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

/** Who a boolean flag is on for when neither FLAGS_ON nor an override says otherwise. */
const DEFAULT_RULES = {
  admins: isAdmin,
  moderators: isModerator,
  nobody: () => false,
  everyone: () => true,
} satisfies Record<'admins' | 'moderators' | 'nobody' | 'everyone', (ctx: EvaluationContext) => boolean>

export function flagDefinitions(
  flagsOn: ReadonlySet<string>,
  values: ReadonlyMap<string, number> = new Map(),
  overrides: ReadonlyMap<string, FlagOverride> = new Map(),
): NonNullable<ConstructorParameters<typeof TypedInMemoryProvider>[0]> {
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
  return Object.fromEntries(
    Object.entries(FLAG_META).map(([key, meta]) => [
      key,
      meta.kind === 'number'
        ? number(key, meta.defaultNumber)
        : {
            variants: { on: true, off: false },
            defaultVariant: 'off',
            disabled: false,
            contextEvaluator: on(key, DEFAULT_RULES[meta.defaultRule]),
          },
    ]),
  )
}
