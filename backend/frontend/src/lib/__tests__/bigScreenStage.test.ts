import { describe, it, expect } from 'vitest'
import { orientationFor, stageScale } from '../bigscreen/stage.js'

describe('stage', () => {
  it('picks the orientation by aspect ratio', () => {
    expect(orientationFor(1920, 1080)).toBe('landscape')
    expect(orientationFor(1000, 1000)).toBe('landscape')
    expect(orientationFor(1080, 1920)).toBe('portrait')
  })
  it('scales the stage to fit', () => {
    expect(stageScale(1920, 1080)).toEqual({ orientation: 'landscape', scale: 1, w: 1920, h: 1080 })
    expect(stageScale(1280, 720).scale).toBeCloseTo(2 / 3)
    expect(stageScale(1080, 1920)).toEqual({ orientation: 'portrait', scale: 1, w: 1080, h: 1920 })
    // Square-ish: the stage's height is the limit
    expect(stageScale(800, 1000)).toMatchObject({ orientation: 'portrait', w: 1080, h: 1920 })
    expect(stageScale(800, 1000).scale).toBeCloseTo(1000 / 1920)
  })
})
