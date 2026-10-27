<script lang="ts">
  // The frame every game's live view shares: the header with the LIVE badge, then the board and the panel, side by side
  // in landscape, the panel above the board in portrait.
  import type { Snippet } from 'svelte'
  import type { Orientation } from '$lib/bigscreen/stage'
  import { LIVE_SIZES, type LiveSizes } from '$lib/bigscreen/look'
  import type { BoardProps } from '$lib/bigscreen/tiles'
  import BigHeader from './BigHeader.svelte'
  import BoardBox from './BoardBox.svelte'

  let {
    header,
    orientation,
    boardWidth = 800,
    board,
    panel,
  }: {
    header: { title: string; meta: string; board: string | null }
    orientation: Orientation
    /** Landscape: the board's column (px). */
    boardWidth?: number
    board: BoardProps
    panel: Snippet<[LiveSizes]>
  } = $props()
  const sz = $derived(LIVE_SIZES[orientation])
</script>

<div class="flex size-full flex-col bg-bg-deep">
  <BigHeader {...header}>
    {#snippet badge()}
      <span
        class="inline-flex h-11 items-center gap-2.5 rounded-full bg-live-soft px-[18px] text-[24px] font-extrabold tracking-[0.14em] text-live"
      >
        <span class="size-3 animate-pulse rounded-full bg-live"></span>LIVE
      </span>
    {/snippet}
  </BigHeader>
  <main class="box-border flex min-h-0 flex-1 pb-10 pt-[30px] {sz.main}">
    {#if sz.portrait}
      {@render panel(sz)}
      <div class="min-h-0 flex-1"><BoardBox {...board} /></div>
    {:else}
      <div class="flex-none" style="width:{boardWidth}px"><BoardBox {...board} /></div>
      <div class="flex min-w-0 flex-1 flex-col gap-[22px]">{@render panel(sz)}</div>
    {/if}
  </main>
</div>
