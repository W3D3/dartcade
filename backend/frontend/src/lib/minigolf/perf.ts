// Measuring the 3D view: per-frame samples from Hole3D and their summary, the GPU's name and time,
// and the frame-time overlay's switch and window.
import type { Quality } from './quality.js'

/** One drawn frame: since the last one, the main thread's work on it, the GPU's (when the browser
 *  can time it), ms; what three drew, on how big a canvas (device px), in which tier and scale. */
export type FrameSample = {
  frameMs: number
  cpuMs: number
  gpuMs: number | null
  calls: number
  triangles: number
  canvas: [number, number]
  tier: Quality
  scale: number
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
const round = (n: number) => Math.round(n * 100) / 100

export type PerfSummary = {
  frames: number
  /** Frames per second over the run, and the 1% low (the rate of the slowest 1% of frames). */
  fps: number
  low1Fps: number
  frameMs: { p50: number; p95: number; p99: number }
  cpuMs: { p50: number; p95: number }
  gpuMs: { p50: number; p95: number } | null
  calls: number
  triangles: number
}

/** The samples' frame rate, frame-time percentiles and the last frame's draw calls and triangles. */
export function summarize(samples: readonly FrameSample[]): PerfSummary {
  const sorted = (f: (s: FrameSample) => number | null) =>
    samples
      .map(f)
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b)
  const frame = sorted(s => s.frameMs)
  const cpu = sorted(s => s.cpuMs)
  const gpu = sorted(s => s.gpuMs)
  const total = frame.reduce((a, b) => a + b, 0)
  const last = samples.at(-1)
  return {
    frames: samples.length,
    fps: round(total > 0 ? (1000 * frame.length) / total : 0),
    low1Fps: round(frame.length ? 1000 / pct(frame, 0.99) : 0),
    frameMs: { p50: round(pct(frame, 0.5)), p95: round(pct(frame, 0.95)), p99: round(pct(frame, 0.99)) },
    cpuMs: { p50: round(pct(cpu, 0.5)), p95: round(pct(cpu, 0.95)) },
    gpuMs: gpu.length ? { p50: round(pct(gpu, 0.5)), p95: round(pct(gpu, 0.95)) } : null,
    calls: last?.calls ?? 0,
    triangles: last?.triangles ?? 0,
  }
}

/** The overlay's window: the last 2 s of frames, summarised at most twice a second. */
export class RecentFrames {
  private frames: FrameSample[] = []
  private shownAt = -Infinity

  /** Adds a frame drawn at `now` (ms); every 500 ms, the summary of the last 2 s, else null. */
  add(s: FrameSample, now: number): PerfSummary | null {
    this.frames.push(s)
    if (now - this.shownAt < 500) return null
    this.shownAt = now
    let total = 0
    let k = this.frames.length
    while (k > 0 && total < 2000) total += this.frames[--k].frameMs
    this.frames.splice(0, k)
    return summarize(this.frames)
  }
}

/** The GPU's name as the browser reports it (e.g. "V3D 7.1" on a Raspberry Pi 5), or its plain
 *  WebGL renderer string where it hides the real one. */
export function glRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const info = gl.getExtension('WEBGL_debug_renderer_info')
  return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
}

/** Times the GPU's work on a frame where the browser allows it (EXT_disjoint_timer_query_webgl2;
 *  Chrome often hides it). One query in flight at a time: `ms` is the last finished one, a frame or
 *  two late. */
export type GpuTimer = { begin(): void; end(): void; readonly ms: number | null; dispose(): void }
export function gpuTimer(gl: WebGLRenderingContext | WebGL2RenderingContext): GpuTimer | null {
  // TypeScript's DOM types don't know the extension: its two enums, from its spec
  const TIME_ELAPSED_EXT = 0x88bf
  const GPU_DISJOINT_EXT = 0x8fbb
  if (!('createQuery' in gl) || !gl.getExtension('EXT_disjoint_timer_query_webgl2')) return null
  let query: WebGLQuery | null = null
  let running = false
  let ms: number | null = null
  return {
    begin() {
      if (query && gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
        if (!gl.getParameter(GPU_DISJOINT_EXT)) ms = Number(gl.getQueryParameter(query, gl.QUERY_RESULT)) / 1e6
        gl.deleteQuery(query)
        query = null
      }
      if (query) return
      query = gl.createQuery()
      gl.beginQuery(TIME_ELAPSED_EXT, query)
      running = true
    },
    end() {
      if (running) gl.endQuery(TIME_ELAPSED_EXT)
      running = false
    },
    get ms() {
      return ms
    },
    dispose() {
      if (query) gl.deleteQuery(query)
    },
  }
}

/** Whether to show the frame-time overlay over the 3D view: `perf=1` in the page's hash query turns
 *  it on for this browser (so the big screen's frame, a page of its own, shows it too), `perf=0` off. */
export function perfOverlayOn(): boolean {
  const asked = new URLSearchParams(location.hash.split('?')[1] ?? '').get('perf')
  try {
    if (asked !== null) localStorage.setItem('minigolf.perf', asked)
    return localStorage.getItem('minigolf.perf') === '1'
  } catch {
    return asked === '1'
  }
}
