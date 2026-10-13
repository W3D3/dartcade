import { describe, it, expect, vi, afterEach } from 'vitest'
import { webglAvailable } from '$lib/webgl'

const withCanvas = (getContext: (kind: string) => unknown) => vi.stubGlobal('document', { createElement: () => ({ getContext }) })

describe('webglAvailable', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is false when neither WebGL 2 nor WebGL starts', () => {
    withCanvas(() => null)
    expect(webglAvailable()).toBe(false)
  })

  it('is true with WebGL 2, or plain WebGL, and lets go of the probe context', () => {
    const loseContext = vi.fn()
    const gl = { getExtension: (name: string) => (name === 'WEBGL_lose_context' ? { loseContext } : null) }
    withCanvas(kind => (kind === 'webgl2' ? gl : null))
    expect(webglAvailable()).toBe(true)
    withCanvas(kind => (kind === 'webgl' ? gl : null))
    expect(webglAvailable()).toBe(true)
    expect(loseContext).toHaveBeenCalledTimes(2)
  })
})
