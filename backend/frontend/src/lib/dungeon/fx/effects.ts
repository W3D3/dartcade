// The pixel effects the battle plays (pixelfx, copied in ./pixelfx): which effect each kind is, with
// its palette, and how far above its origin its middle is (its own `height`), in effect pixels.
import { PAL, bluntHit, critHit, snowflakeBurst, type FxModule } from './pixelfx'

/** What a beat of the popup plays on its target: a dart's hit, a big or killing hit, Chill, Burn, block gained. */
export type FxKind = 'hit' | 'crit' | 'chill' | 'burn' | 'block'

/** An effect on enemy `uid` or hero `seat` (its sprite's middle); a new `id` fires it again. */
export type FxCue = { kind: FxKind; at: { enemy: string } | { hero: number }; id: number }

/** An effect centred on (x, y), in CSS pixels from the effect layer's top left; a new `id` fires it again. */
export type FxShot = { kind: FxKind; x: number; y: number; id: number }

export const FX: Record<FxKind, { mod: FxModule; lift: number; palette?: string[] }> = {
  hit: { mod: bluntHit, lift: 22 },
  crit: { mod: critHit, lift: 26 },
  chill: { mod: snowflakeBurst, lift: 48 },
  burn: { mod: bluntHit, lift: 22, palette: PAL.fire },
  block: { mod: bluntHit, lift: 22, palette: PAL.water },
}

/** Reduced motion asked for: no effects, the popup jumps to its end. */
export const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
