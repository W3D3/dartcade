<script lang="ts">
  // One of the Matchmaking page's top cards: a label, a big number, and lines under it.
  import type { Snippet } from 'svelte'

  let {
    label,
    shortLabel,
    value,
    unit,
    aria,
    corner,
    children,
  }: { label: string; shortLabel?: string; value: string; unit?: string; aria: string; corner?: Snippet; children?: Snippet } = $props()
</script>

<section
  aria-label={aria}
  class="relative box-border flex min-w-0 flex-col gap-1 md:gap-[6px] rounded-[12px] md:rounded-[14px] border border-line bg-surface-panel px-3 py-3 md:px-[18px] md:py-4"
>
  <span class="truncate text-[10px] uppercase tracking-[0.1em] text-text-muted md:text-[12px] {corner ? 'pr-10 md:pr-14' : ''}"
    >{#if shortLabel}<span class="md:hidden">{shortLabel}</span><span class="hidden md:inline">{label}</span>{:else}{label}{/if}</span
  >
  <span class="flex items-baseline whitespace-nowrap">
    <span class="font-display text-[30px] md:text-[46px] font-bold leading-[0.9]">{value}</span>
    {#if unit}<span class="ml-[6px] text-[12px] md:text-[15px] font-semibold text-text-dim">{unit}</span>{/if}
  </span>
  {@render children?.()}
  {#if corner}<span class="absolute right-3 top-3 md:right-4 md:top-[14px]">{@render corner()}</span>{/if}
</section>
