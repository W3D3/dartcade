import { describe, it, expect, vi } from 'vitest'
import { AverageCache } from './averageCache.js'

const setup = (options = {}) => {
  let now = 0
  const load = vi.fn((ids: string[]) => Promise.resolve(new Map(ids.filter(id => id !== 'nogames').map(id => [id, 60] as const))))
  const cache = new AverageCache(load, { ttlMs: 1000, max: 3, now: () => now, ...options })
  return { cache, load, advance: (ms: number) => (now += ms) }
}

describe('AverageCache', () => {
  it('loads only the ids it lacks, in one call, and serves the rest from memory', async () => {
    const { cache, load } = setup()
    await cache.get(['a', 'b'])
    expect(load).toHaveBeenCalledTimes(1)
    expect(await cache.get(['a', 'b', 'c'])).toEqual(
      new Map([
        ['a', 60],
        ['b', 60],
        ['c', 60],
      ]),
    )
    expect(load).toHaveBeenLastCalledWith(['c'])
    await cache.get(['a', 'b', 'c'])
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('remembers a player without a game too', async () => {
    const { cache, load } = setup()
    expect((await cache.get(['nogames'])).size).toBe(0)
    await cache.get(['nogames'])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('reloads after the TTL', async () => {
    const { cache, load, advance } = setup()
    await cache.get(['a'])
    advance(999)
    await cache.get(['a'])
    expect(load).toHaveBeenCalledTimes(1)
    advance(1)
    await cache.get(['a'])
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('reloads an invalidated player only', async () => {
    const { cache, load } = setup()
    await cache.get(['a', 'b'])
    cache.invalidate(['a'])
    await cache.get(['a', 'b'])
    expect(load).toHaveBeenLastCalledWith(['a'])
  })

  it('does not store what a load that began before an invalidation read', async () => {
    let release: () => void = () => undefined
    const load = vi.fn(async (ids: string[]) => {
      await new Promise<void>(r => (release = r))
      return new Map(ids.map(id => [id, 50] as const))
    })
    const cache = new AverageCache(load)
    const pending = cache.get(['a'])
    cache.invalidate(['a'])
    release()
    expect(await pending).toEqual(new Map([['a', 50]]))
    const second = cache.get(['a'])
    release()
    await second
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('keeps at most `max` entries, the oldest dropped first', async () => {
    const { cache, load } = setup()
    await cache.get(['a', 'b', 'c', 'd'])
    load.mockClear()
    await cache.get(['b', 'c', 'd'])
    expect(load).not.toHaveBeenCalled()
    await cache.get(['a'])
    expect(load).toHaveBeenCalledWith(['a'])
  })
})
