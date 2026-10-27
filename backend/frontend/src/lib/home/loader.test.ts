import { describe, it, expect, vi } from 'vitest'
import { Loader } from './loader.svelte'

describe('Loader', () => {
  it('starts loading, then holds the data', async () => {
    const loader = new Loader(() => Promise.resolve({ data: { n: 1 } }))
    expect(loader.loading).toBe(true)
    await vi.waitFor(() => expect(loader.loading).toBe(false))
    expect(loader.data).toEqual({ n: 1 })
    expect(loader.error).toBe('')
  })

  it('holds the refusal the server gave', async () => {
    const loader = new Loader<{ n: number }>(() => Promise.resolve({ error: { error: 'Nope' } }))
    await loader.load()
    expect(loader.loading).toBe(false)
    expect(loader.error).toBe('Nope')
    expect(loader.data).toBeNull()
  })

  it('holds an error when the request itself fails, and recovers on the next load', async () => {
    let fail = true
    const loader = new Loader<{ n: number }>(() => (fail ? Promise.reject(new Error('offline')) : Promise.resolve({ data: { n: 2 } })))
    await loader.load()
    expect(loader.error).toBe('Something went wrong')
    fail = false
    await loader.load()
    expect(loader.error).toBe('')
    expect(loader.data).toEqual({ n: 2 })
  })

  it('keeps the old data while a refresh fails', async () => {
    let fail = false
    const loader = new Loader<{ n: number }>(() =>
      fail ? Promise.resolve({ error: { error: 'Down' } }) : Promise.resolve({ data: { n: 3 } }),
    )
    await loader.load()
    fail = true
    await loader.load()
    expect(loader.data).toEqual({ n: 3 })
    expect(loader.error).toBe('Down')
  })
})
