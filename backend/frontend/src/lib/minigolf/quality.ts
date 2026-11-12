// How well the 3D hole is drawn: three tiers, and Auto, which picks one from the GPU and lowers the
// drawing resolution (then the tier) while frames come too slowly; a tier picked by hand stays as
// it is. Only the look changes: the game and its physics are the same in every tier.
import { glRenderer } from './perf.js'

export const QUALITIES = ['low', 'medium', 'high'] as const
export type Quality = (typeof QUALITIES)[number]
export type QualityChoice = Quality | 'auto'
const CHOICES: readonly QualityChoice[] = ['auto', ...QUALITIES]

/** What a tier draws. `maxPixels` caps the canvas's device pixels (a 4K screen is drawn at most
 *  this big and scaled up); `antialias` (MSAA) is fixed once the view opens. */
export type Tier = { antialias: boolean; shadows: boolean; maxPixelRatio: number; maxPixels: number }
export const TIERS: Record<Quality, Tier> = {
  // The full look: smoothed edges, shadows, up to twice the CSS pixels
  high: { antialias: true, shadows: true, maxPixelRatio: 2, maxPixels: Infinity },
  // Shadows kept; no edge smoothing, at most a 1080p canvas
  medium: { antialias: false, shadows: true, maxPixelRatio: 1.5, maxPixels: 1920 * 1080 },
  // A round blob under each ball instead of shadows, at most 1440×810 (scaled up)
  low: { antialias: false, shadows: false, maxPixelRatio: 1, maxPixels: 1440 * 810 },
}

/** Auto's first tier from the GPU's name: software GL and the Raspberry Pi's VideoCore are low,
 *  integrated and phone GPUs medium, the rest high. The controller corrects it while playing. */
export function autoTier(gpu: string): Quality {
  if (/swiftshader|llvmpipe|softpipe|software|v3d|videocore|powervr|vivante|lima/i.test(gpu)) return 'low'
  if (/intel|mali|adreno|apple|panfrost|freedreno/i.test(gpu)) return 'medium'
  return 'high'
}

/** The quality asked for in the page's hash query (`?quality=low`): for a kiosk, such as the board's
 *  screen. Null when there's none. */
export function urlQuality(hash: string): QualityChoice | null {
  const q = new URLSearchParams(hash.split('?')[1] ?? '').get('quality')
  return CHOICES.find(c => c === q) ?? null
}

/** The renderer's pixel ratio: the device's, capped by the tier, then by its pixel budget for a
 *  `width`×`height` CSS px canvas, times the controller's `scale`. */
export function pixelRatio(tier: Tier, dpr: number, width: number, height: number, scale: number): number {
  const budget = Math.sqrt(tier.maxPixels / Math.max(1, width * height))
  return Math.min(tier.maxPixelRatio, dpr, budget) * scale
}

const STEP = 0.8
/** The lowest scale the controller goes to: two steps down, 64% of the tier's resolution each way
 *  (a 1080p window drawn at 921×518 on Low). Lower turns the rails into stair steps on a TV. */
export const MIN_SCALE = STEP * STEP
/** A second's frames are judged together: slow under 45 fps, fast at 55 or more (a 60 Hz screen). */
const WINDOW_MS = 1000
const SLOW_MS = 1000 / 45
const FAST_MS = 1000 / 55
/** Fast seconds in a row before trying a higher resolution; doubled each time a raise doesn't hold. */
const RAISE_AFTER = 3
const MAX_RAISE_AFTER = 64

const lower = (q: Quality): Quality => QUALITIES[Math.max(0, QUALITIES.indexOf(q) - 1)]

/**
 * Auto's frame-rate keeper: each slow second takes the resolution down a step; once it's at
 * MIN_SCALE and still slow, the tier steps down (and never back up while the view is open). It goes back up a step only after a run of fast seconds, a run that doubles
 * whenever the step up didn't hold, so it never flaps. The second after a change isn't judged (a
 * resize costs a frame or two). Mutable, so the frame loop allocates nothing.
 */
export class FrameBudget {
  scale = 1
  private frames: number[] = []
  private windowStart: number | null = null
  private skip = false
  private fastRun = 0
  private raiseAfter = RAISE_AFTER
  private raisedAt: number | null = null

  constructor(public tier: Quality) {}

  /** Takes a drawn frame's time (ms since the one before) at `now`; true when the scale or tier changed. */
  frame(ms: number, now: number): boolean {
    this.windowStart ??= now
    this.frames.push(ms)
    if (now - this.windowStart < WINDOW_MS) return false
    const sorted = this.frames.sort((a, b) => a - b)
    const median = sorted[sorted.length >> 1]
    this.frames.length = 0
    this.windowStart = now
    if (this.skip) {
      this.skip = false
      return false
    }
    if (median > SLOW_MS) return this.slower(now)
    if (median > FAST_MS || this.scale >= 1) {
      this.fastRun = 0
      return false
    }
    if (++this.fastRun < this.raiseAfter) return false
    this.scale = Math.min(1, this.scale / STEP)
    this.fastRun = 0
    this.raisedAt = now
    this.skip = true
    return true
  }

  private slower(now: number): boolean {
    this.fastRun = 0
    // The last step up came straight back down: wait twice as long before the next
    if (this.raisedAt !== null && now - this.raisedAt < 3 * WINDOW_MS) {
      this.raiseAfter = Math.min(MAX_RAISE_AFTER, this.raiseAfter * 2)
    }
    this.raisedAt = null
    if (this.scale > MIN_SCALE) this.scale = Math.max(MIN_SCALE, this.scale * STEP)
    else if (this.tier !== 'low') this.tier = lower(this.tier)
    else return false
    this.skip = true
    return true
  }
}

let probed: string | null = null
/** The GPU's name from a throwaway WebGL context: Auto picks the tier, and with it MSAA, before
 *  the view's own context exists. Asked once a page. */
export function probeGpu(): string {
  if (probed !== null) return probed
  const gl = document.createElement('canvas').getContext('webgl2')
  probed = gl ? glRenderer(gl) : ''
  gl?.getExtension('WEBGL_lose_context')?.loseContext()
  return probed
}
