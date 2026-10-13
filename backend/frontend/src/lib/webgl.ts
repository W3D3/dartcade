/** Whether this browser can start WebGL (2, or 1), for picking a 3D view over a flat one. */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') ?? c.getContext('webgl')
    // Browsers cap live contexts: give the probe's back at once
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return gl !== null
  } catch {
    return false
  }
}
