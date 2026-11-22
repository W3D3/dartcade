<!--
  A checkout practice player's card (121 Checkout, Catch 40): the target, the big number left, the
  open target's darts as pips in threes, the hint or the result banner. 'solo' is the 400 px
  desktop card, 'side' a duel card, 'phone' the compact card on top of the phone screen. The mode
  passes its hint line, what leads the phone card's top row, and what closes the desktop card.
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { Who } from '$lib/face'
  import { Check, X } from '@lucide/svelte'
  import PanelShell from '$lib/components/PanelShell.svelte'
  import { plural } from '$lib/fmt'
  import { playerCard } from '$lib/playerCard'

  let {
    who,
    active,
    variant = 'solo',
    portrait = false,
    target,
    left,
    used,
    maxDarts,
    pips,
    banner,
    label,
    hint,
    phoneLead,
    footer,
  }: {
    who: Who
    /** The thrower: the lime-bordered card. */
    active: boolean
    variant?: 'solo' | 'side' | 'phone'
    /** The portrait layout: the shell's portrait sizes. */
    portrait?: boolean
    target: number
    left: number
    /** Darts used on the open target, the open visit's included. */
    used: number
    maxDarts: number
    /** 'used' (committed visits), 'current' (thrown in the open visit), 'open' (not thrown), in groups. */
    pips: ('used' | 'current' | 'open')[][]
    /** The result of the target that just ended, shown while no dart is in the board. */
    banner: { kind: 'made' | 'missed'; text: string } | null
    /** The card's accessible name, without the darts used (added here). */
    label: string
    /** The line under the pips when there is no banner. */
    hint: Snippet
    /** What leads the phone card's top row (the target follows). */
    phoneLead: Snippet
    /** What closes the desktop card. */
    footer?: Snippet
  } = $props()

  const phone = $derived(variant === 'phone')
  const caption = 'text-[12px] font-semibold label-caps text-text-dim'
  const aria = $derived(`${label}, ${used} of ${maxDarts} darts used`)
</script>

{#snippet pipRow(size: string)}
  <div role="img" aria-label="{used} of {maxDarts} darts used" class="flex flex-wrap gap-[21px]">
    {#each pips as group, g (g)}
      <span class="flex gap-[7px]">
        {#each group as p, i (i)}
          <span
            class="{size} rounded-full box-border {p === 'used'
              ? 'bg-line-strong'
              : p === 'current'
                ? 'bg-accent shadow-[0_0_10px_rgba(198,242,78,.5)]'
                : 'border-2 border-line-chip'}"
          ></span>
        {/each}
      </span>
    {/each}
  </div>
{/snippet}

{#snippet hintLine()}
  {#if banner}
    <span
      role="status"
      class="self-start inline-flex items-center gap-2 rounded-full px-3 py-1 text-[14px] border {banner.kind === 'made'
        ? 'bg-accent-tint border-accent-line text-accent'
        : 'bg-live-soft border-danger-line text-danger-text'}"
    >
      {#if banner.kind === 'made'}<Check size={14} strokeWidth={3} />{:else}<X size={14} strokeWidth={3} class="text-live" />{/if}
      {banner.text}
    </span>
  {:else}
    <span class="{phone ? 'text-[13px]' : 'text-[14px]'} text-text-muted">{@render hint()}</span>
  {/if}
{/snippet}

{#if phone}
  <section aria-label={aria} class="box-border rounded-panel flex flex-col min-w-0 px-4 py-3 gap-2 {playerCard(active)}">
    <div class="flex items-center justify-between">
      {@render phoneLead()}
      <span class="flex items-baseline gap-[6px]">
        <span class={caption}>Target</span>
        <span class="font-display font-bold text-[28px] leading-none text-accent">{target}</span>
      </span>
    </div>
    <span class="font-display font-bold text-[120px] leading-[0.85] tracking-score">{left}</span>
    <div class="flex items-center justify-between gap-3">
      <span class={caption}>{plural(maxDarts - used, 'dart')} left</span>
      {@render pipRow('w-[14px] h-[14px]')}
    </div>
    {@render hintLine()}
  </section>
{:else}
  <PanelShell
    {who}
    {active}
    pill={null}
    solo={variant === 'solo'}
    {portrait}
    class={variant === 'solo' ? 'w-[300px] xl:w-[400px]' : ''}
    label={aria}
  >
    {#snippet aside()}
      <span class="flex items-baseline gap-[6px]">
        <span class={caption}>Target</span>
        <span class="font-display font-bold text-[34px] leading-none text-accent">{target}</span>
      </span>
    {/snippet}
    <div class="flex flex-col">
      <span class={caption}>Left</span>
      <span
        class="font-display font-bold leading-[0.85] tracking-score {variant === 'solo'
          ? 'text-[150px] xl:text-[200px]'
          : 'text-[120px] xl:text-[160px]'} {active ? 'text-text' : 'text-ink-3'}">{left}</span
      >
    </div>
    <div class="flex flex-col gap-[10px]">
      <span class={caption}>Darts · {maxDarts - used} left</span>
      {@render pipRow('w-[18px] h-[18px]')}
    </div>
    {@render hintLine()}
    {@render footer?.()}
  </PanelShell>
{/if}
