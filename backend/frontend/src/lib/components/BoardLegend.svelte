<script lang="ts">
  // Key for the ATC board highlights, shown under the board.
  let { items }: { items: { label: string; kind: 'current' | 'next' | 'others' }[] } = $props()
</script>

<div class="flex items-center justify-center gap-5 text-[13px] text-text-muted">
  {#each items as item (item.label)}
    <span class="flex items-center gap-2 min-w-0">
      {#if item.kind === 'current'}
        <span class="w-3 h-3 shrink-0 rounded-[3px] bg-accent"></span>
      {:else if item.kind === 'next'}
        <span class="w-3 h-3 shrink-0 rounded-[3px] border-2 border-dashed border-text"></span>
      {:else}
        <span class="w-[14px] h-[14px] shrink-0 rounded-full bg-text"></span>
      {/if}
      <span class="truncate">{item.label}</span>
    </span>
  {/each}
</div>
