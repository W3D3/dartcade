import { describe, it, expect } from 'vitest'
import { KeyedQueue } from './keyedQueue.js'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(r => {
    resolve = r
  })
  return { promise, resolve }
}

describe('KeyedQueue', () => {
  it('runs one key strictly in order, and other keys alongside', async () => {
    const q = new KeyedQueue()
    const log: string[] = []
    const gate = deferred()
    const a1 = q.run('a', async () => {
      await gate.promise
      log.push('a1')
    })
    const a2 = q.run('a', () => {
      log.push('a2')
      return Promise.resolve(2)
    })
    const b1 = q.run('b', () => {
      log.push('b1')
      return Promise.resolve()
    })
    await b1
    expect(log).toEqual(['b1'])
    gate.resolve()
    await a1
    expect(await a2).toBe(2)
    expect(log).toEqual(['b1', 'a1', 'a2'])
  })

  it('a failed task fails only its own run; the next one still runs', async () => {
    const q = new KeyedQueue()
    const failed = q.run('a', () => Promise.reject(new Error('boom')))
    const next = q.run('a', () => Promise.resolve('ok'))
    await expect(failed).rejects.toThrow('boom')
    expect(await next).toBe('ok')
  })

  it('forgets a key once its last task settled', async () => {
    const q = new KeyedQueue()
    const gate = deferred()
    const first = q.run('a', () => gate.promise)
    const second = q.run('a', () => Promise.reject(new Error('boom')))
    expect(q.size).toBe(1)
    gate.resolve()
    await first
    // The first one settling doesn't drop the key while the second is still queued
    expect(q.size).toBe(1)
    await expect(second).rejects.toThrow('boom')
    await q.idle('a')
    await Promise.resolve()
    expect(q.size).toBe(0)
  })

  it('idle waits for everything queued so far', async () => {
    const q = new KeyedQueue()
    const gate = deferred()
    let done = false
    void q.run('a', async () => {
      await gate.promise
      done = true
    })
    const idle = q.idle('a')
    gate.resolve()
    await idle
    expect(done).toBe(true)
    // Nothing queued: resolves right away
    await q.idle('nothing')
  })
})
