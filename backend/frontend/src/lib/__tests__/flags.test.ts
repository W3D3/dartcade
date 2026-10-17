import { describe, it, expect, afterEach } from 'vitest'
import { get } from 'svelte/store'
import { OpenFeature, TypedInMemoryProvider, type EvaluationContext, type Provider } from '@openfeature/web-sdk'
import { flag, numberFlag, refreshFlags, setFlagUser } from '$lib/flags'

const config = (on: boolean) => ({
  'gamemode.minigolf.enabled': {
    variants: { on: true, off: false },
    defaultVariant: on ? ('on' as const) : ('off' as const),
    disabled: false,
  },
})

describe('flag()', () => {
  afterEach(() => OpenFeature.clearProviders())

  it('is the fallback (off) until the provider has loaded', () => {
    expect(get(flag('gamemode.minigolf.enabled'))).toBe(false)
  })

  it('follows the provider when its flags change', async () => {
    const provider = new TypedInMemoryProvider(config(false))
    await OpenFeature.setProviderAndWait(provider)
    const values: boolean[] = []
    const stop = flag('gamemode.minigolf.enabled').subscribe(v => values.push(v))
    await provider.putConfiguration(config(true))
    stop()
    expect(values).toEqual([false, true])
  })
})

describe('refreshFlags()', () => {
  afterEach(() => OpenFeature.clearProviders())

  it("re-sets the context so the provider re-evaluates, even though the user hasn't changed", async () => {
    const seen: (EvaluationContext | undefined)[] = []
    class RecordingProvider extends TypedInMemoryProvider implements Pick<Provider, 'onContextChange'> {
      onContextChange(_oldContext: EvaluationContext, newContext: EvaluationContext) {
        seen.push(newContext)
      }
    }
    await OpenFeature.setProviderAndWait(new RecordingProvider({}))
    await setFlagUser('alice')
    await refreshFlags()
    const last = seen.slice(-2)
    expect(last).toHaveLength(2)
    expect(last.every(c => c?.targetingKey === 'alice')).toBe(true)
  })
})

describe('numberFlag()', () => {
  afterEach(() => OpenFeature.clearProviders())

  it("is the fallback until loaded, then the provider's number", async () => {
    expect(get(numberFlag('matchmaking.visitSeconds', 60))).toBe(60)
    await OpenFeature.setProviderAndWait(
      new TypedInMemoryProvider({ 'matchmaking.visitSeconds': { variants: { default: 45 }, defaultVariant: 'default', disabled: false } }),
    )
    expect(get(numberFlag('matchmaking.visitSeconds', 60))).toBe(45)
  })
})
