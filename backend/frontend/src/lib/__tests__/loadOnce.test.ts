import { describe, it, expect, vi } from 'vitest'
import { get } from 'svelte/store'
import { loadOnce } from '../loadOnce.js'

const tick = () => new Promise(r => setTimeout(r, 0))

describe('loadOnce', () => {
  it('loads on first use and keeps the value across unsubscribes (navigations)', async () => {
    const fetch = vi.fn().mockResolvedValue('Mia')
    const store = loadOnce(fetch, null)
    const unsub = store.subscribe(() => undefined)
    await tick()
    unsub()
    expect(get(store)).toBe('Mia')
    store.subscribe(() => undefined)()
    await tick()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('refresh() loads again, set() replaces the value', async () => {
    const fetch = vi.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b')
    const store = loadOnce(fetch, null)
    store.subscribe(() => undefined)
    await tick()
    await store.refresh()
    expect(get(store)).toBe('b')
    store.set(null)
    expect(get(store)).toBeNull()
  })

  it('keeps the initial value when loading fails', async () => {
    const store = loadOnce(() => Promise.reject(new Error('offline')), 'x')
    store.subscribe(() => undefined)
    await tick()
    expect(get(store)).toBe('x')
  })

  it('loads again on the next use after a failed load', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('Mia')
    const store = loadOnce(fetch, null)
    store.subscribe(() => undefined)()
    await tick()
    expect(get(store)).toBeNull()
    store.subscribe(() => undefined)
    await tick()
    expect(get(store)).toBe('Mia')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not load twice while a load is in flight', async () => {
    let resolve: (v: string) => void = () => undefined
    const fetch = vi.fn(() => new Promise<string>(r => { resolve = r }))
    const store = loadOnce(fetch, null)
    store.subscribe(() => undefined)
    store.subscribe(() => undefined)
    resolve('Mia')
    await tick()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(get(store)).toBe('Mia')
  })

  it('does not load again on first use after an explicit refresh', async () => {
    const fetch = vi.fn().mockResolvedValue('Mia')
    const store = loadOnce(fetch, null)
    await store.refresh()
    store.subscribe(() => undefined)
    await tick()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
