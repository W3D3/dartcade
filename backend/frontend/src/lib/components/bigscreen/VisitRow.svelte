<script lang="ts">
  // The open visit on the big screen: its running total and the three dart slots (thrown, then what to aim at).
  import type { SlotTile } from '$lib/bigscreen/tiles'
  import type { SlotKind } from '$lib/dartSlots'

  let {
    total,
    tiles,
    bullOff = false,
    spare = '',
    height,
    totalSize,
    tileSize,
  }: {
    total: string | number
    tiles: SlotTile[]
    bullOff?: boolean
    /** The line under an empty slot after the last suggestion ("SPARE DART"). */
    spare?: string
    height: number
    totalSize: number
    tileSize: number
  } = $props()

  const look: Record<SlotKind, string> = {
    thrown: 'border-[3px] border-accent bg-accent text-accent-fg',
    miss: 'border-[3px] border-line-chip bg-surface-1 text-text-muted',
    'suggested-next': 'border-4 border-dashed border-accent text-text',
    'suggested-later': 'border-[3px] border-dashed border-line-chip text-text-faint',
    'empty-next': 'border-[3px] border-dashed border-line-chip text-text-faint',
    'empty-later': 'border-[3px] border-dashed border-line-chip text-text-faint',
  }
</script>

<div class="flex flex-none gap-[18px]" style="height:{height}px">
  {#if bullOff}
    <div class="box-border flex flex-1 items-center justify-center rounded-3xl border-2 border-line bg-surface-1">
      <span class="font-display text-[96px] font-bold uppercase leading-none tracking-[0.04em] text-text-muted">Bull off</span>
    </div>
  {:else}
    <div class="box-border flex min-w-0 flex-[0.9_1_0] flex-col items-center justify-center rounded-3xl border-2 border-line bg-surface-1">
      <span class="text-[26px] font-bold tracking-[0.12em] text-text-dim">THIS VISIT</span>
      <span class="font-display font-bold leading-[0.95]" style="font-size:{totalSize}px">{total}</span>
    </div>
    {#each tiles as t, i (i)}
      <div class="box-border flex min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-1.5 rounded-3xl {look[t.kind]}">
        <span class="font-display font-bold leading-[0.9]" style="font-size:{tileSize}px">{t.label || '–'}</span>
        <span class="whitespace-nowrap text-[26px] font-bold tracking-[0.06em] {t.kind === 'thrown' ? '' : 'text-text-muted'}"
          >{t.label ? t.note : t.kind === 'empty-later' ? spare : ''}</span
        >
      </div>
    {/each}
  {/if}
</div>
