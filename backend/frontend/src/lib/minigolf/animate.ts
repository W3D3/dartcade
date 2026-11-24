// The test bench's path playback: a shot's 60 Hz samples, shown in real time.
import type { Pt } from '$shared/minigolf/types'

/** Plays a path sampled at 60 Hz in real time. */
export function playPath<P = Pt>(path: P[], onFrame: (p: P) => void): Promise<void> {
  if (path.length < 2) {
    onFrame(path[path.length - 1])
    return Promise.resolve()
  }
  return new Promise(resolve => {
    const start = performance.now()
    const tick = (now: number) => {
      // A frame can be stamped a moment before `start`
      const i = Math.min(path.length - 1, Math.max(0, Math.floor(((now - start) / 1000) * 60)))
      onFrame(path[i])
      if (i === path.length - 1) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/** Steps through `frames` 60 Hz frames in real time, calling `onFrame` with the (fractional, for
 *  smooth slow motion) position on every animation frame, then
 *  `onDone`; `rate` slows playback at a frame (0.5 = half speed). Returns a function that stops it.
 *  Reduced motion doesn't skip it: the roll is the game, not decoration. */
export function playFrames(
  frames: number,
  onFrame: (i: number) => void,
  { rate = () => 1, onDone = () => {} }: { rate?: (i: number) => number; onDone?: () => void } = {},
): () => void {
  if (frames < 2) {
    onFrame(Math.max(0, frames - 1))
    onDone()
    return () => {}
  }
  let raf = 0
  let at = 0
  let last = performance.now()
  const tick = (now: number) => {
    // A frame can be stamped a moment before `last`
    at = Math.min(frames - 1, at + (Math.max(0, now - last) / 1000) * 60 * rate(at))
    last = now
    onFrame(at)
    if (at < frames - 1) raf = requestAnimationFrame(tick)
    else onDone()
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}
