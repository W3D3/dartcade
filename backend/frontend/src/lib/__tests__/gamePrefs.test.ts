import { describe, it, expect } from 'vitest'
import { loadPrefs, savePrefs, PREFS_KEY } from '../gamePrefs.js'

const storage = (v: string | null) => ({ getItem: () => v })

describe('loadPrefs', () => {
  it('is null without storage, a stored value, or valid JSON', () => {
    expect(loadPrefs(null)).toBeNull()
    expect(loadPrefs(storage(null))).toBeNull()
    expect(loadPrefs(storage('{oops'))).toBeNull()
  })

  it('reads prefs saved before this change', () => {
    const saved = { mode: 'x01', configs: { x01: { startScore: 301 } }, boardId: 'b1' }
    expect(loadPrefs(storage(JSON.stringify(saved)))).toEqual(saved)
  })

  it('drops a broken field instead of the whole prefs', () => {
    expect(loadPrefs(storage(JSON.stringify({ mode: 'atc', configs: 'nope', boardId: 7 })))).toEqual({ mode: 'atc', configs: {} })
  })

  it('drops one broken game config, keeping the others', () => {
    expect(loadPrefs(storage(JSON.stringify({ mode: 'atc', configs: { x01: 'bad', atc: { order: 'asc' } } })))).toEqual({
      mode: 'atc',
      configs: { atc: { order: 'asc' } },
    })
  })

  it('is null without a mode', () => {
    expect(loadPrefs(storage(JSON.stringify({ configs: {} })))).toBeNull()
  })
})

describe('savePrefs', () => {
  it('writes JSON under the prefs key', () => {
    let written: [string, string] | null = null
    savePrefs(
      {
        setItem: (k, v) => {
          written = [k, v]
        },
      },
      { mode: 'atc', configs: {} },
    )
    expect(written).toEqual([PREFS_KEY, JSON.stringify({ mode: 'atc', configs: {} })])
  })
})
