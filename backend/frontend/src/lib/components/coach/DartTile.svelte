<script lang="ts">
  // One dart as the coach's visit rows draw it (Coach-Leg): the tile above its class label, in a
  // fixed-width column; `compact` (a visit's dart table) the smaller tile alone. The tone, the grade
  // word and the label come from visitTiles.
  import type { DartTileView } from '$lib/coach/dart'
  import { TILE_TONE } from '$lib/coach/tone'

  let { tile, compact = false }: { tile: DartTileView; compact?: boolean } = $props()
</script>

{#snippet name()}
  <span
    class="inline-flex items-center justify-center px-1.5 box-border font-display font-bold {compact
      ? 'min-w-[40px] h-6 rounded-[6px] text-[15px]'
      : 'min-w-[46px] h-[30px] rounded-[7px] text-[18px]'} {TILE_TONE[tile.tone]} {tile.offBoard
      ? 'border-[1.5px] border-dashed border-danger-line'
      : ''}"
    >{tile.name}{#if tile.word}<span class="sr-only">, {tile.word}</span>{/if}</span
  >
{/snippet}

{#if compact}
  {@render name()}
{:else}
  <span class="inline-flex w-[72px] flex-col items-center gap-1">
    {@render name()}
    <span class="text-center text-[11px] leading-[1.25] text-text-muted">{tile.label}</span>
  </span>
{/if}
