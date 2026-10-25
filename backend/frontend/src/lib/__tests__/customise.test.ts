import { describe, it, expect, vi, afterEach } from 'vitest'
import { equipChanges, gridItems, loadHideLocked, pictureChanged, saveHideLocked, tabOf, unlockedCount } from '../progress/customise.js'
import { DEFAULT_EQUIPPED } from '$shared/progression.js'

describe('customise', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('opens Picture without a tab, or with one it does not know', () => {
    expect(tabOf(undefined)).toBe('picture')
    expect(tabOf('nonsense')).toBe('picture')
    expect(tabOf('frame')).toBe('frame')
  })

  it('saves only the kinds the draft changed', () => {
    expect(equipChanges(DEFAULT_EQUIPPED, { ...DEFAULT_EQUIPPED })).toEqual({})
    expect(equipChanges(DEFAULT_EQUIPPED, { ...DEFAULT_EQUIPPED, frame: 'frame.gold', name: 'name.gold' })).toEqual({
      frame: 'frame.gold',
      name: 'name.gold',
    })
  })

  it('wears the picture only when a layer changed, or a photo is replaced', () => {
    const worn = { foreground: 'classic', background: 'chalk' }
    expect(pictureChanged(worn, { ...worn })).toBe(false)
    expect(pictureChanged(worn, { ...worn, background: 'gold' })).toBe(true)
    // A photo stays unless you picked a layer
    expect(pictureChanged(null, null)).toBe(false)
    expect(pictureChanged(null, worn)).toBe(true)
  })

  it('lists unlocked options first and hides the locked ones on request', () => {
    const items = [
      { id: 'a', open: false },
      { id: 'b', open: true },
      { id: 'c', open: false },
      { id: 'd', open: true },
    ]
    expect(gridItems(items, false).map(i => i.id)).toEqual(['b', 'd', 'a', 'c'])
    expect(gridItems(items, true).map(i => i.id)).toEqual(['b', 'd'])
  })

  it('counts unlocked options, leaving out "nothing"', () => {
    expect(
      unlockedCount([
        { id: 'frame.none', open: true },
        { id: 'frame.bronze', open: true },
        { id: 'frame.gold', open: false },
      ]),
    ).toBe('1 of 2 unlocked')
  })

  it('keeps Hide locked across visits, off by default and without storage', () => {
    expect(loadHideLocked()).toBe(false)
    saveHideLocked(true)
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) })
    expect(loadHideLocked()).toBe(false)
    saveHideLocked(true)
    expect(loadHideLocked()).toBe(true)
  })
})
