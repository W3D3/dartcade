<script lang="ts">
  // A win celebration playing once on its own canvas, placed by `class` (its positioned parent by
  // default; `fixed inset-0`: the whole screen). Nothing under reduced motion.
  import confetti from 'canvas-confetti'
  import { onMount } from 'svelte'
  import { celebrate } from '$lib/celebrations'
  import type { CardColors } from '$lib/progress/look'

  let { id, colors, class: cls = 'absolute inset-0 size-full' }: { id: string; colors: CardColors; class?: string } = $props()
  let canvas: HTMLCanvasElement | undefined = $state()

  onMount(() => {
    if (!canvas) return
    const fire = confetti.create(canvas, { resize: true, disableForReducedMotion: true })
    const stop = celebrate(fire, id, colors)
    return () => {
      stop()
      fire.reset()
    }
  })
</script>

<canvas bind:this={canvas} aria-hidden="true" class="{cls} pointer-events-none z-50"></canvas>
