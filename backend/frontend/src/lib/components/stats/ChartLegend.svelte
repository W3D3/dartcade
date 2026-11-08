<script lang="ts">
  // A chart's key: a box for bars, a line for a line, a dashed one for what it is compared with.
  import type { Tone } from '$lib/stats/tones'
  import { TONE_BG } from '$lib/stats/tones'

  export type LegendItem = { label: string; mark: 'box' | 'line' | 'dash'; tone: Tone }
  let { items }: { items: LegendItem[] } = $props()
</script>

<ul class="flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-text-muted">
  {#each items as item (item.label)}
    <li class="flex items-center gap-1.5">
      {#if item.mark === 'box'}
        <span class="h-3 w-3 rounded-[2px] {TONE_BG[item.tone]}" aria-hidden="true"></span>
      {:else if item.mark === 'line'}
        <span class="h-[3px] w-3 rounded-[2px] {TONE_BG[item.tone]}" aria-hidden="true"></span>
      {:else}
        <span class="w-3 border-t-2 border-dashed border-text-muted" aria-hidden="true"></span>
      {/if}
      {item.label}
    </li>
  {/each}
</ul>
