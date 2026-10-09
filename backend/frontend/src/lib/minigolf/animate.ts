// The test bench's path playback: a shot's 60 Hz samples, shown in real time.
import type { Pt } from '$shared/minigolf/types'

/** Plays a path sampled at 60 Hz in real time; with reduced motion, jumps to the end. */
export function playPath(path: Pt[], onFrame: (p: Pt) => void, reducedMotion: boolean): Promise<void> {
  if (reducedMotion || path.length < 2) {
    onFrame(path[path.length - 1])
    return Promise.resolve()
  }
  return new Promise(resolve => {
    const start = performance.now()
    const tick = (now: number) => {
      const i = Math.min(path.length - 1, Math.floor(((now - start) / 1000) * 60))
      onFrame(path[i])
      if (i === path.length - 1) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}
