import { describe, it, expect } from 'vitest'
import { CameraStills, MAX_STILL_BYTES } from './store.js'

const jpeg = (n = 4) => Buffer.alloc(n, 0xff)
const still = (bytes = jpeg()) => ({ bytes, contentType: 'image/jpeg', capturedAt: '2026-10-04T12:00:00.000Z' })

describe('CameraStills', () => {
  it('keeps the latest still per board and camera, with a version that goes up', () => {
    const s = new CameraStills()
    const v1 = s.put('b1', 0, still(jpeg(1)))
    const v2 = s.put('b1', 0, still(jpeg(2)))
    expect(v1).not.toBeNull()
    expect(v2).toBeGreaterThan(v1 ?? Infinity)
    expect(s.get('b1', 0)).toEqual({ version: v2, ...still(jpeg(2)) })
  })

  it('keeps boards and cameras apart', () => {
    const s = new CameraStills()
    s.put('b1', 0, still(jpeg(1)))
    s.put('b1', 2, still(jpeg(3)))
    s.put('b2', 0, still(jpeg(5)))
    expect(s.get('b1', 2)?.bytes.length).toBe(3)
    expect(s.get('b2', 0)?.bytes.length).toBe(5)
    expect(s.get('b1', 1)).toBeUndefined()
    expect(s.get('b3', 0)).toBeUndefined()
    expect(s.versions('b1').map(v => v.cam)).toEqual([0, 2])
    expect(s.versions('nope')).toEqual([])
  })

  it('drops a still over 1 MiB and keeps the one before', () => {
    const s = new CameraStills()
    const v = s.put('b1', 0, still(jpeg(10)))
    expect(s.put('b1', 0, still(jpeg(MAX_STILL_BYTES + 1)))).toBeNull()
    expect(s.get('b1', 0)?.version).toBe(v)
    expect(s.put('b1', 1, still(jpeg(MAX_STILL_BYTES)))).not.toBeNull()
  })

  it('starts versions after a restart above the last run\'s (cached ?v= URLs stay unique)', () => {
    const a = new CameraStills(() => 1_000)
    const b = new CameraStills(() => 2_000)
    expect(b.put('b1', 0, still())).toBeGreaterThan(a.put('b1', 0, still()) ?? Infinity)
  })

  it('forgets a board\'s stills, and only that board\'s', () => {
    const s = new CameraStills()
    s.put('b1', 0, still()); s.put('b1', 1, still()); s.put('b2', 0, still())
    s.clear('b1')
    expect(s.get('b1', 0)).toBeUndefined()
    expect(s.versions('b1')).toEqual([])
    expect(s.versions('b2')).toHaveLength(1)
    s.clear('nope')
  })
})
