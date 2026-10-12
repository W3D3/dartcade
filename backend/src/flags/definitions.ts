// The feature flags, as OpenFeature's in-memory provider takes them: variants, the default, and the
// targeting rule (contextEvaluator), which gets the context contextFor() builds from the session.
import type { EvaluationContext } from '@openfeature/server-sdk'

const isAdmin = (ctx: EvaluationContext) => ctx.admin === true

export function flagDefinitions(flagsOn: ReadonlySet<string>) {
  const on = (key: string, rule: (ctx: EvaluationContext) => boolean) => (ctx: EvaluationContext) =>
    flagsOn.has(key) || rule(ctx) ? ('on' as const) : ('off' as const)
  return {
    // Minigolf is played by admins until it ships (FLAGS_ON=gamemode.minigolf.enabled for everyone)
    'gamemode.minigolf.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('gamemode.minigolf.enabled', isAdmin),
    },
  } as const
}
