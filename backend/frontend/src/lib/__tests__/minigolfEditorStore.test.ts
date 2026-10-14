import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCourseStore, createHoleStore, HttpError, type CourseContent } from '$lib/minigolf/editor/store.svelte'
import { testCourse } from '$shared/minigolf/courses/test'
import type { Hole } from '$shared/minigolf/types'

const hole0 = testCourse.holes[0] as Hole
const edited = (name: string): Hole => ({ ...hole0, name })

const fakeLoad = (value: Hole | CourseContent, version = 1, updatedAt = '2026-01-01T00:00:00.000Z') =>
  vi.fn().mockResolvedValue({ value, version, updatedAt })

afterEach(() => {
  vi.useRealTimers()
})

describe('createHoleStore', () => {
  it("load() populates the hole, saved, with the row's time", async () => {
    const store = createHoleStore('h1', vi.fn(), fakeLoad(hole0, 3))
    await store.load()
    expect(store.value).toEqual(hole0)
    expect(store.status).toBe('saved')
    expect(store.savedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'))
  })

  it('load() sets missing on a 404', async () => {
    const store = createHoleStore('h1', vi.fn(), vi.fn().mockRejectedValue(new HttpError(404)))
    await store.load()
    expect(store.status).toBe('missing')
    expect(store.value).toBeNull()
  })

  it('edit() shows unsaved at once, then two edits within the delay make one save with the latest hole', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue({ version: 2, updatedAt: 't2' })
    const store = createHoleStore('h1', save, fakeLoad(hole0, 1), 800)
    await store.load()

    store.edit(edited('A'))
    expect(store.status).toBe('unsaved')
    await vi.advanceTimersByTimeAsync(400)
    store.edit(edited('B'))
    expect(save).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('h1', 1, expect.objectContaining({ name: 'B' }))
    expect(store.status).toBe('saved')
  })

  it('uses the version a save returned for the next save', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValueOnce({ version: 5, updatedAt: 't1' }).mockResolvedValueOnce({ version: 6, updatedAt: 't2' })
    const store = createHoleStore('h1', save, fakeLoad(hole0, 1), 800)
    await store.load()

    store.edit(edited('A'))
    await vi.advanceTimersByTimeAsync(800)
    store.edit(edited('B'))
    await vi.advanceTimersByTimeAsync(800)

    expect(save).toHaveBeenNthCalledWith(1, 'h1', 1, expect.anything())
    expect(save).toHaveBeenNthCalledWith(2, 'h1', 5, expect.anything())
  })

  it('a 409 sets conflict and stops saving; further edits are refused until a reload', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockRejectedValue(new HttpError(409))
    const store = createHoleStore('h1', save, fakeLoad(hole0, 1), 800)
    await store.load()

    store.edit(edited('A'))
    await vi.advanceTimersByTimeAsync(800)
    expect(store.status).toBe('conflict')

    store.edit(edited('B'))
    expect(store.value?.name).toBe('A')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(save).toHaveBeenCalledTimes(1)
    expect(store.status).toBe('conflict')
  })

  it('a failed reload after a conflict drops the stale hole (the page offers Try again), with no retry pending', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockRejectedValue(new HttpError(409))
    const load = vi.fn().mockResolvedValueOnce({ value: hole0, version: 1, updatedAt: 't1' }).mockRejectedValueOnce(new Error('offline'))
    const store = createHoleStore('h1', save, load, 800)
    await store.load()
    store.edit(edited('A'))
    await vi.advanceTimersByTimeAsync(800)

    await store.load()
    expect(store.status).toBe('error')
    expect(store.value).toBeNull()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it.each([400, 403, 422])('a %i on save stops with rejected instead of retrying; the next edit tries again', async code => {
    vi.useFakeTimers()
    const save = vi.fn().mockRejectedValueOnce(new HttpError(code)).mockResolvedValueOnce({ version: 2, updatedAt: 't2' })
    const store = createHoleStore('h1', save, fakeLoad(hole0, 1), 800)
    await store.load()

    store.edit(edited('A'))
    await vi.advanceTimersByTimeAsync(800)
    expect(store.status).toBe('rejected')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(save).toHaveBeenCalledTimes(1)
    await store.flush()
    expect(save).toHaveBeenCalledTimes(1)

    store.edit(edited('B'))
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledTimes(2)
    expect(store.status).toBe('saved')
  })

  it.each([500, 503, 408, 429])('a %i on save keeps retrying', async code => {
    vi.useFakeTimers()
    const save = vi.fn().mockRejectedValueOnce(new HttpError(code)).mockResolvedValueOnce({ version: 2, updatedAt: 't2' })
    const store = createHoleStore('h1', save, fakeLoad(hole0, 1), 800)
    await store.load()

    store.edit(edited('A'))
    await vi.advanceTimersByTimeAsync(800)
    expect(store.status).toBe('error')
    await vi.advanceTimersByTimeAsync(1000)
    expect(store.status).toBe('saved')
  })

  it('a 404 on save sets missing', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockRejectedValue(new HttpError(404))
    const store = createHoleStore('h1', save, fakeLoad(hole0, 1), 800)
    await store.load()

    store.edit(edited('A'))
    await vi.advanceTimersByTimeAsync(800)
    expect(store.status).toBe('missing')
  })

  it('a thrown error sets error; a later success sets saved', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ version: 2, updatedAt: 't2' })
    const store = createHoleStore('h1', save, fakeLoad(hole0, 1), 800)
    await store.load()

    store.edit(edited('A'))
    await vi.advanceTimersByTimeAsync(800)
    expect(store.status).toBe('error')
    expect(save).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000) // first retry, 1s
    expect(save).toHaveBeenCalledTimes(2)
    expect(store.status).toBe('saved')
  })

  it('retries at 1s, 2s, 5s, then every 10s, saving the latest hole each time', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockRejectedValue(new Error('still down'))
    const store = createHoleStore('h1', save, fakeLoad(hole0, 1), 800)
    await store.load()

    store.edit(edited('A'))
    await vi.advanceTimersByTimeAsync(800) // first attempt
    expect(save).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000) // retry 1
    expect(save).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2000) // retry 2
    expect(save).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(5000) // retry 3
    expect(save).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(10_000) // retry 4, now every 10s
    expect(save).toHaveBeenCalledTimes(5)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(save).toHaveBeenCalledTimes(6)
    expect(save.mock.calls.every(c => (c[2] as Hole).name === 'A')).toBe(true)
  })

  it('an edit while a save is in flight saves the new value right after, with the new version', async () => {
    let resolveFirst!: (r: { version: number; updatedAt: string }) => void
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise(r => (resolveFirst = r)))
      .mockResolvedValueOnce({ version: 9, updatedAt: 't2' })
    const store = createHoleStore('h1', save, fakeLoad(hole0, 1), 5)
    await store.load()

    store.edit(edited('A'))
    await new Promise(r => setTimeout(r, 20))
    expect(store.status).toBe('saving')

    store.edit(edited('B'))
    resolveFirst({ version: 5, updatedAt: 't1' })
    await new Promise(r => setTimeout(r, 20))

    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenNthCalledWith(2, 'h1', 5, expect.objectContaining({ name: 'B' }))
    expect(store.status).toBe('saved')
  })

  it('flush() saves now, skipping the debounce', async () => {
    const save = vi.fn().mockResolvedValue({ version: 2, updatedAt: 't2' })
    const store = createHoleStore('h1', save, fakeLoad(hole0, 1), 60_000)
    await store.load()

    store.edit(edited('A'))
    await store.flush()

    expect(save).toHaveBeenCalledTimes(1)
    expect(store.status).toBe('saved')
  })

  it('flush() is a no-op once already saved', async () => {
    const save = vi.fn().mockResolvedValue({ version: 2, updatedAt: 't2' })
    const store = createHoleStore('h1', save, fakeLoad(hole0, 1), 60_000)
    await store.load()
    await store.flush()
    expect(save).not.toHaveBeenCalled()
  })
})

describe('createCourseStore', () => {
  const content0: CourseContent = { name: 'Course', description: 'd', difficulty: 1, holeIds: ['a'] }

  it('publish() flushes a pending save, publishes, then reloads on success', async () => {
    const save = vi.fn().mockResolvedValue({ version: 2, updatedAt: 't2' })
    const load = fakeLoad(content0, 1)
    const publish = vi.fn().mockResolvedValue(null)
    const discard = vi.fn()
    const store = createCourseStore('c1', save, load, 60_000, publish, discard)
    await store.load()
    store.edit({ ...content0, name: 'Renamed' })

    const problems = await store.publish()

    expect(save).toHaveBeenCalledTimes(1) // the pending edit was flushed first
    expect(publish).toHaveBeenCalledWith('c1')
    expect(load).toHaveBeenCalledTimes(2) // once up front, once after publishing
    expect(problems).toBeNull()
    // The flushed save must complete before publishing, not just be kicked off
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(publish.mock.invocationCallOrder[0])
  })

  it("publish() doesn't publish or reload when the flushed save fails", async () => {
    const save = vi.fn().mockRejectedValue(new Error('offline'))
    const load = fakeLoad(content0, 1)
    const publish = vi.fn()
    const store = createCourseStore('c1', save, load, 60_000, publish, vi.fn())
    await store.load()
    const edited = { ...content0, name: 'Renamed' }
    store.edit(edited)

    const result = await store.publish()

    expect(result).toEqual({ notSaved: 'error' })
    expect(publish).not.toHaveBeenCalled()
    expect(load).toHaveBeenCalledTimes(1) // not reloaded
    expect(store.content).toEqual(edited) // the local edit survives, untouched
  })

  it('publish() returns the problems without reloading when refused', async () => {
    const save = vi.fn()
    const load = fakeLoad(content0, 1)
    const problems = [{ holeId: 'a', checks: [] }]
    const publish = vi.fn().mockResolvedValue(problems)
    const store = createCourseStore('c1', save, load, 60_000, publish, vi.fn())
    await store.load()

    const result = await store.publish()

    expect(result).toEqual(problems)
    expect(load).toHaveBeenCalledTimes(1) // not reloaded
  })

  it('publish() keeps what was typed while it ran, saving it on top of the published version', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue({ version: 4, updatedAt: 't4' })
    const load = vi
      .fn()
      .mockResolvedValueOnce({ value: content0, version: 1, updatedAt: 't1' })
      .mockResolvedValueOnce({ value: content0, version: 3, updatedAt: 't3' })
    let resolvePublish!: (r: null) => void
    const publish = vi.fn().mockImplementation(() => new Promise(r => (resolvePublish = r)))
    const store = createCourseStore('c1', save, load, 800, publish, vi.fn())
    await store.load()

    const publishing = store.publish()
    await vi.advanceTimersByTimeAsync(0)
    store.edit({ ...content0, name: 'Typed meanwhile' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(save).not.toHaveBeenCalled() // no save races the publish
    resolvePublish(null)
    expect(await publishing).toBeNull()

    expect(store.content?.name).toBe('Typed meanwhile')
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledWith('c1', 3, expect.objectContaining({ name: 'Typed meanwhile' }))
    expect(store.status).toBe('saved')
  })

  it('publish() refused: what was typed while it ran saves as usual', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue({ version: 2, updatedAt: 't2' })
    let resolvePublish!: (r: unknown) => void
    const publish = vi.fn().mockImplementation(() => new Promise(r => (resolvePublish = r)))
    const store = createCourseStore('c1', save, fakeLoad(content0, 1), 800, publish, vi.fn())
    await store.load()

    const publishing = store.publish()
    await vi.advanceTimersByTimeAsync(0)
    store.edit({ ...content0, name: 'Typed meanwhile' })
    resolvePublish([{ holeId: 'a', checks: [] }])
    await publishing
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledWith('c1', 1, expect.objectContaining({ name: 'Typed meanwhile' }))
  })

  it('discard() clears the draft through the network call, then reloads', async () => {
    const load = fakeLoad(content0, 1)
    const discard = vi.fn().mockResolvedValue(undefined)
    const store = createCourseStore('c1', vi.fn(), load, 60_000, vi.fn(), discard)
    await store.load()

    await store.discard()

    expect(discard).toHaveBeenCalledWith('c1')
    expect(load).toHaveBeenCalledTimes(2)
  })
})
