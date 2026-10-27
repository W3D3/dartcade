<script lang="ts">
  // The fixed-size stage (1920x1080 or 1080x1920), centred and scaled to fit the window.
  import type { Snippet } from 'svelte'
  import { stageScale, type Orientation } from '$lib/bigscreen/stage'

  let { children }: { children: Snippet<[Orientation]> } = $props()
  let width = $state(typeof window === 'undefined' ? 1920 : window.innerWidth)
  let height = $state(typeof window === 'undefined' ? 1080 : window.innerHeight)
  const st = $derived(stageScale(width, height))
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} />

<div class="fixed inset-0 overflow-hidden bg-bg-deep">
  <div
    class="absolute left-1/2 top-1/2 overflow-hidden bg-bg text-text"
    style="width:{st.w}px;height:{st.h}px;transform:translate(-50%,-50%) scale({st.scale})"
  >
    {@render children(st.orientation)}
  </div>
</div>
