<script lang="ts">
  // "Throw order this leg" above the board in a ranked team game: who throws now, then who follows
  // (MM-Match-Teams board). The viewer's own seats are marked.
  import { ArrowRight } from '@lucide/svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import type { Who } from '$lib/face'

  let { order, who, mine }: { order: readonly number[]; who: readonly Who[]; mine: readonly number[] } = $props()
</script>

<div role="group" aria-label="Throw order this leg" class="flex shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-1">
  {#each order as seat, i (i)}
    {#if i > 0}<ArrowRight size={14} class="text-text-dim" aria-hidden="true" />{/if}
    <span
      class="inline-flex h-8 items-center gap-[6px] rounded-full border pl-[3px] pr-3 text-[14px] font-semibold
             {i === 0
        ? 'border-accent-line-strong bg-surface-hover text-text'
        : mine.includes(seat)
          ? 'border-line-2 text-ink-2'
          : 'border-line text-text-muted'}"
    >
      <Avatar name={who[seat]?.name ?? ''} face={who[seat]?.face} tone={i === 0 ? 'accent' : 'default'} size={26} />{who[seat]?.name}
    </span>
  {/each}
</div>
