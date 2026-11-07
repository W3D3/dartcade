import { describe, it, expect, beforeEach, vi } from 'vitest'
import { exportUrl, labelText, lastDownloaded, markerAt, rememberDownloaded } from './dartSamples'

describe('markerAt', () => {
  it('puts the bull at the centre, the double ring a third out and 20 at the top', () => {
    expect(markerAt({ x: 0, y: 0 })).toEqual({ left: 50, top: 50 })
    expect(markerAt({ x: 0, y: 1 })).toEqual({ left: 50, top: 50 - 100 / 3 })
    expect(markerAt({ x: -1.5, y: 0 })).toEqual({ left: 0, top: 50 })
  })
})

describe('exportUrl', () => {
  it('asks for what is new since the last download, of one label or all', () => {
    expect(exportUrl('42', null, null)).toBe('/api/admin/dart-samples/export?upTo=42')
    expect(exportUrl('42', '17', 'corrected_spot')).toBe('/api/admin/dart-samples/export?upTo=42&after=17&label=corrected_spot')
  })
})

describe('labelText', () => {
  it('names each label', () => {
    expect(labelText('corrected_segment')).toBe('Corrected to a segment')
  })
})

describe('download cursor', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
  })

  it('is kept per label, so a filtered download does not skip samples of the others', () => {
    rememberDownloaded('corrected_segment', '42')
    expect(lastDownloaded('corrected_segment')).toBe('42')
    expect(lastDownloaded(null)).toBeNull()
    expect(lastDownloaded('autodarts')).toBeNull()
  })
})
