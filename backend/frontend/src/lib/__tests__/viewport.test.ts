import { describe, it, expect } from 'vitest'
import { get } from 'svelte/store'
import { mediaStore, PHONE_QUERY, TABLET_QUERY, WIDE_QUERY, type MatchMediaFn } from '../viewport.js'
import { matchesAt } from './fixtures/widthQuery.js'

function fakeMatchMedia(initial: boolean) {
  let matches = initial
  let listener: ((e: { matches: boolean }) => void) | null = null
  const mm: MatchMediaFn = () => ({
    get matches() { return matches },
    addEventListener: (_t, cb) => { listener = cb },
    removeEventListener: () => { listener = null },
  })
  return {
    mm,
    fire: (m: boolean) => { matches = m; listener?.({ matches: m }) },
    /** The viewport changes while nobody listens (no event reaches the store). */
    setSilently: (m: boolean) => { matches = m },
    attached: () => listener !== null,
  }
}

describe('mediaStore', () => {
  it('starts with the query result and follows changes', () => {
    const f = fakeMatchMedia(true)
    const store = mediaStore(PHONE_QUERY, f.mm)
    const seen: boolean[] = []
    const unsub = store.subscribe(v => seen.push(v))
    f.fire(false)
    f.fire(true)
    expect(seen).toEqual([true, false, true])
    unsub()
    expect(f.attached()).toBe(false)
  })

  it('reads the current result when subscribed again after a change it did not hear', () => {
    const f = fakeMatchMedia(false)
    const store = mediaStore(PHONE_QUERY, f.mm)
    store.subscribe(() => undefined)()
    f.setSilently(true)
    expect(get(store)).toBe(true)
  })

  it('is false without matchMedia (tests, server)', () => {
    expect(get(mediaStore(PHONE_QUERY, null))).toBe(false)
  })
})

describe('the layout bands', () => {
  const widths = [390, 767, 768, 820, 1180, 1279, 1280, 1440]
  it('phones below 768, the tablet band from 768 to 1279, desktops from 1280', () => {
    expect(widths.map(w => matchesAt(PHONE_QUERY, w))).toEqual([true, true, false, false, false, false, false, false])
    expect(widths.map(w => matchesAt(TABLET_QUERY, w))).toEqual([false, false, true, true, true, true, false, false])
    expect(widths.map(w => matchesAt(WIDE_QUERY, w))).toEqual([false, false, false, false, false, false, true, true])
  })
})
