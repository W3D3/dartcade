<script lang="ts">
  // One pixel canvas over the battle stage for the pixelfx hit effects (lib/dungeon/fx/pixelfx): each
  // new `shot` plays one, drawn at 2 screen pixels per effect pixel, animated only while an effect
  // plays, nothing with reduced motion.
  import { FX, reducedMotion, type FxShot } from '$lib/dungeon/fx/effects'
  import { clearFrame, composite, createFrame, createFx, type Frame, type Fx } from '$lib/dungeon/fx/pixelfx'
  import { onDestroy } from 'svelte'

  let { shot = null }: { shot?: FxShot | null } = $props()

  const SCALE = 2
  let canvas: HTMLCanvasElement | undefined = $state()
  let live: Fx[] = []
  let frame: Frame | null = null
  let raf = 0
  let last = 0

  $effect(() => {
    if (shot) play(shot)
  })

  function play({ kind, x, y }: FxShot): void {
    if (!canvas || reducedMotion()) return
    const { mod, lift, palette } = FX[kind]
    live.push(
      createFx(mod, {
        x: Math.round(x / SCALE),
        y: Math.round(y / SCALE + lift),
        seed: live.length + Math.round(x),
        ...(palette ? { palette } : {}),
      }),
    )
    if (!raf) {
      last = performance.now()
      raf = requestAnimationFrame(tick)
    }
  }

  function tick(now: number): void {
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return void (raf = 0)
    const w = Math.max(1, Math.round(canvas.clientWidth / SCALE))
    const h = Math.max(1, Math.round(canvas.clientHeight / SCALE))
    if (canvas.width !== w || canvas.height !== h || !frame) {
      canvas.width = w
      canvas.height = h
      frame = createFrame(w, h)
    }
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    clearFrame(frame)
    for (const fx of live) {
      fx.update(dt)
      fx.draw(frame)
    }
    live = live.filter(fx => !fx.done())
    const img = new ImageData(w, h)
    composite(frame, img.data)
    ctx.putImageData(img, 0, 0)
    raf = live.length ? requestAnimationFrame(tick) : 0
    if (!raf) ctx.clearRect(0, 0, w, h)
  }

  onDestroy(() => raf && cancelAnimationFrame(raf))
</script>

<canvas
  bind:this={canvas}
  class="pointer-events-none absolute inset-0 z-20 size-full [image-rendering:pixelated]"
  aria-hidden="true"
  data-shot={shot?.kind}
></canvas>
