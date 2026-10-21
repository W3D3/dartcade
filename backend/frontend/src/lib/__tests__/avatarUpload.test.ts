import { describe, it, expect } from 'vitest'
import { centerSquareCrop } from '../avatarUpload.js'

describe('centerSquareCrop', () => {
  it('crops a landscape photo to its centered square, by height', () => {
    expect(centerSquareCrop(400, 200)).toEqual({ x: 100, y: 0, size: 200 })
  })

  it('crops a portrait photo to its centered square, by width', () => {
    expect(centerSquareCrop(200, 400)).toEqual({ x: 0, y: 100, size: 200 })
  })

  it('leaves an already-square photo as is', () => {
    expect(centerSquareCrop(300, 300)).toEqual({ x: 0, y: 0, size: 300 })
  })
})
