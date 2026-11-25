<!--
  The session summary shell of the checkout practice modes (121 Checkout, Catch 40): in place of the
  win screen when a game ends, and as the mode's section of the Match details page (without the
  buttons). With 2 or more players, a standings strip and a picker for whose session to see. Without
  the saved detail (loading, or a spectator, who can't read it) only the standings show. The mode
  fills in the picked seat's summary.
-->
<script lang="ts">
  import LoadingBlock from '$lib/components/LoadingBlock.svelte'
  import type { Snippet } from 'svelte'
  import type { PracticeSummaryBase } from './types'
  import { Button } from '$lib/components/ui/button/index.js'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import { ordinal } from '$lib/fmt'

  let {
    players,
    standings,
    ready,
    picked = $bindable(),
    loading = false,
    primary = null,
    secondary = null,
    children,
  }: Omit<PracticeSummaryBase, 'seat'> & {
    /** Best first, with the number each shows. */
    standings: { name: string; placement: number; value: string }[]
    /** Whether the saved detail has a summary for the picked seat (not while loading, nor for a spectator). */
    ready: boolean
    /** The picked seat's summary; `buttons` places the actions. */
    /** The seat shown, set by the picker. */
    picked?: number
    children: Snippet<[buttons: Snippet]>
  } = $props()
</script>

<main class="grow min-h-0 overflow-y-auto scrollbar-themed box-border p-4 md:p-7 flex flex-col gap-[18px]">
  {#if players.length > 1 || !ready}
    <ol aria-label="Standings" class="flex flex-wrap gap-2">
      {#each standings as s, i (i)}
        <li
          class="flex items-center gap-3 px-4 h-12 rounded-xl border {s.placement === 1
            ? 'border-accent-line-strong bg-surface-active'
            : 'border-line bg-surface-1'}"
        >
          <span class="font-display font-bold text-[20px] {s.placement === 1 ? 'text-accent' : 'text-text-dim'}"
            >{ordinal(s.placement)}</span
          >
          <span class="text-[15px] font-semibold">{s.name}</span>
          <span class="font-mono text-[13px] text-text-muted">{s.value}</span>
        </li>
      {/each}
    </ol>
    {#if ready}
      <SegmentedControl
        class="self-start w-full max-w-[480px]"
        options={players.map((p, i) => ({ value: i, label: p.name || `Player ${i + 1}` }))}
        bind:value={picked}
      />
    {/if}
  {/if}

  {#if ready}
    {@render children(buttons)}
  {:else}
    {#if loading}<LoadingBlock label="Loading the summary" />{/if}
    {@render buttons()}
  {/if}
</main>

{#snippet buttons()}
  {#if primary}
    <div class="xl:mt-auto flex gap-[10px]">
      {#if secondary}
        <Button variant="outline" size="xl" class="flex-1 text-[16px] font-semibold border-line-strong" onclick={secondary.onclick}
          >{secondary.label}</Button
        >
      {/if}
      <Button size="xl" class="flex-[1.4]" onclick={primary.onclick}>{primary.label}</Button>
    </div>
  {/if}
{/snippet}
