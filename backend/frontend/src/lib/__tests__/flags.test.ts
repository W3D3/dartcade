import { describe, it, expect, afterEach } from 'vitest'
import { get } from 'svelte/store'
import { OpenFeature, TypedInMemoryProvider } from '@openfeature/web-sdk'
import { flag } from '$lib/flags'

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
