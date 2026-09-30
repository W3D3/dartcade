import { describe, it, expect } from 'vitest'
import { manualDart, polarFromCoords } from './manualDart.js'

const T20 = { name: 'T20', number: 20, bed: 'Triple', multiplier: 3 } as const

describe('polarFromCoords', () => {
  it('measures theta counterclockwise from +x', () => {
    expect(polarFromCoords({ x: 0, y: 0.5 })).toEqual({ r: 0.5, theta_deg: 90 })
  })
})

describe('manualDart', () => {
  it('scores the segment and has no position without coords', () => {
    expect(manualDart({ ...T20 })).toEqual({ segment: T20, score: 60 })
  })

  it('carries coords and their polar form', () => {
    const d = manualDart({ ...T20 }, { x: 0, y: 0.6 })
    expect(d.coords).toEqual({ x: 0, y: 0.6 })
    expect(d.polar).toEqual({ r: 0.6, theta_deg: 90 })
  })

  it('ignores coords that are not finite numbers', () => {
    expect(manualDart({ ...T20 }, { x: NaN, y: 0 }).coords).toBeUndefined()
  })
})
