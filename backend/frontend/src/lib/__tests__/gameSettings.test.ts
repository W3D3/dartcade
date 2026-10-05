import { describe, it, expect } from 'vitest'
import { defaultSettings, loadSettings, saveSettings, SETTINGS_KEY } from '../gameSettings.js'

const store = (value: string | null) => ({ getItem: (k: string) => (k === SETTINGS_KEY ? value : null) })

describe('loadSettings', () => {
  it('returns the defaults without storage or stored value', () => {
    expect(loadSettings(null)).toEqual(defaultSettings)
    expect(loadSettings(store(null))).toEqual(defaultSettings)
  })

  it('merges stored values over the defaults', () => {
    const s = loadSettings(store(JSON.stringify({ chalkboard: false, soundHit: true, volume: 0.3 })))
    expect(s).toEqual({ ...defaultSettings, chalkboard: false, soundHit: true, volume: 0.3 })
  })

  it('ignores unknown keys and values of the wrong type', () => {
    const s = loadSettings(store(JSON.stringify({ bogus: true, visitSum: 'no', volume: '1' })))
    expect(s).toEqual(defaultSettings)
    expect(s).not.toHaveProperty('bogus')
  })

  it('keeps a favourite double of 1–20 or the bull (25), and drops anything else', () => {
    const fav = (v: unknown) => loadSettings(store(JSON.stringify({ favouriteDouble: v }))).favouriteDouble
    expect([fav(16), fav(25), fav(null)]).toEqual([16, 25, null])
    expect([fav(0), fav(21), fav(16.5), fav('16')]).toEqual([null, null, null, null])
  })

  it("keeps the setting for other players' targets on the board", () => {
    expect(defaultSettings.showMarkers).toBe(false)
    expect(loadSettings(store(JSON.stringify({ showMarkers: true }))).showMarkers).toBe(true)
  })

  it('clamps the volume to 0–1', () => {
    expect(loadSettings(store(JSON.stringify({ volume: 4 }))).volume).toBe(1)
    expect(loadSettings(store(JSON.stringify({ volume: -1 }))).volume).toBe(0)
  })

  it('remembers board or keypad; nothing chosen yet by default', () => {
    expect(defaultSettings.inputView).toBeNull()
    expect(defaultSettings.scoreUpdates).toBe('dart')
    expect(loadSettings(store(JSON.stringify({ inputView: 'entry' }))).inputView).toBe('entry')
    expect(loadSettings(store(JSON.stringify({ inputView: 'board' }))).inputView).toBe('board')
    expect(loadSettings(store(JSON.stringify({ inputView: 'sideways' }))).inputView).toBeNull()
  })

  it('keeps the caller off with no voice picked by default; wrong types fall back', () => {
    expect(defaultSettings.callerOn).toBe(false)
    expect(defaultSettings.callerVoice).toBeNull()
    const s = loadSettings(store(JSON.stringify({ callerOn: true, callerVoice: 'builtin:en-adam' })))
    expect(s.callerOn).toBe(true)
    expect(s.callerVoice).toBe('builtin:en-adam')
    const bad = loadSettings(store(JSON.stringify({ callerOn: 'yes', callerVoice: 42 })))
    expect(bad.callerOn).toBe(false)
    expect(bad.callerVoice).toBeNull()
  })

  it('shows the drawn board by default; a camera when picked', () => {
    expect(defaultSettings.boardView).toBe('svg')
    expect(loadSettings(store(JSON.stringify({ boardView: 'cam2' }))).boardView).toBe('cam2')
    expect(loadSettings(store(JSON.stringify({ boardView: 'combined' }))).boardView).toBe('combined')
    expect(loadSettings(store(JSON.stringify({ boardView: 'cam4' }))).boardView).toBe('svg')
    expect(loadSettings(store(JSON.stringify({ boardView: 1 }))).boardView).toBe('svg')
  })

  it('remembers the last camera view for the board toggle; combined by default, wrong types fall back', () => {
    expect(defaultSettings.lastCameraView).toBe('combined')
    expect(loadSettings(store(JSON.stringify({ lastCameraView: 'cam2' }))).lastCameraView).toBe('cam2')
    expect(loadSettings(store(JSON.stringify({ lastCameraView: 'svg' }))).lastCameraView).toBe('combined')
    expect(loadSettings(store(JSON.stringify({ lastCameraView: 'cam4' }))).lastCameraView).toBe('combined')
    expect(loadSettings(store(JSON.stringify({ lastCameraView: 1 }))).lastCameraView).toBe('combined')
  })

  it('falls back to the defaults on broken JSON', () => {
    expect(loadSettings(store('{nope'))).toEqual(defaultSettings)
  })
})

describe('saveSettings', () => {
  it('writes JSON under the settings key', () => {
    const written: Record<string, string> = {}
    saveSettings(
      {
        setItem: (k, v) => {
          written[k] = v
        },
      },
      defaultSettings,
    )
    expect(JSON.parse(written[SETTINGS_KEY])).toEqual(defaultSettings)
  })
})
