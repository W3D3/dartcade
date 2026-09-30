<script lang="ts">
  // ATC targets 1–20 and bull: a 7-column grid (panels) or a single strip (rows).
  import type { AtcCell } from '$lib/atc.js'

  let { cells, active, layout = 'grid', cellHeight = 36 }: {
    cells: AtcCell[]
    active: boolean
    layout?: 'grid' | 'strip'
    cellHeight?: number
  } = $props()

  const text = $derived(layout === 'strip' ? 'text-[14px] rounded-[5px]' : cellHeight >= 44 ? 'text-[18px] rounded-[7px]' : 'text-[16px] rounded-[7px]')
</script>

<div class="grid {layout === 'grid' ? 'grid-cols-7 gap-[5px]' : 'gap-[3px]'}"
  style:grid-template-columns={layout === 'strip' ? `repeat(${cells.length}, minmax(0, 1fr))` : undefined}>
  {#each cells as c, i (i)}
    <span style:height="{cellHeight}px"
      class="box-border flex items-center justify-center font-display {text}
             {c.state === 'hit' ? (active ? 'bg-accent text-accent-fg font-bold' : 'bg-text-dim text-accent-fg font-bold')
               : c.state === 'current' ? (active ? 'border-2 border-accent text-accent font-bold' : 'border-2 border-dashed border-text text-text font-bold')
               : (active ? 'bg-surface-chip text-text-dim' : 'bg-surface-inset text-text-dim')}">
      {layout === 'strip' ? c.short : c.label}
    </span>
  {/each}
</div>
