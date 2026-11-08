<script lang="ts">
  import type { Who } from '$lib/face'
  import PanelShell from './PanelShell.svelte'
  import LegPips from './LegPips.svelte'
  import Chalkboard from './Chalkboard.svelte'
  import RollingNumber from './RollingNumber.svelte'
  import PagedStats from './PagedStats.svelte'
  import { x01Pages, x01Roll } from '$lib/playerStats'
  import type { PillKind } from './pills.js'
  import type { SeatRank } from '$lib/ranked/inGame'
  import type { X01PlayerView } from '$lib/playerStats.js'
  import type { SeatLine } from '$lib/remote'
  import type { Snippet } from 'svelte'

  let {
    who,
    p,
    active,
    solo = false,
    portrait = false,
    pill,
    seat = null,
    chalkboard,
    waiting,
    rank = null,
  }: {
    who: Who
    p: X01PlayerView
    active: boolean
    solo?: boolean
    /** Above the board (portrait): the score scales with the panel, the finish shows for the thrower too,
     * and the chalkboard is one line of the last visits. */
    portrait?: boolean
    pill: PillKind | null
    seat?: SeatLine | null
    chalkboard: boolean
    waiting?: Snippet
    rank?: SeatRank | null
  } = $props()

  const scoreSize = $derived(
    solo ? 'text-[min(220px,24vh)]' : portrait ? 'text-[min(52cqi,15vh)]' : 'text-[min(150px,24vh,56cqi)] xl:text-[min(220px,24vh)]',
  )
  // Sized by the card (cqi), not the viewport, so a narrow card shrinks its numbers before the labels wrap
  const statSize = $derived(
    solo
      ? '[--stat-label:12px] [--stat-value:clamp(26px,9cqi,44px)]'
      : portrait
        ? '[--stat-label:11px] lg:[--stat-label:13px] [--stat-value:clamp(20px,6cqi,34px)]'
        : '[--stat-label:clamp(9px,3.3cqi,13px)] [--stat-value:clamp(20px,6.5cqi,30px)] xl:[--stat-value:clamp(26px,9cqi,44px)]',
  )
</script>

<PanelShell {who} {active} {solo} {portrait} {pill} {seat} {waiting} {rank} pillInRow={solo}>
  {#snippet aside()}
    {#if !solo}<LegPips total={p.firstTo} won={p.legsWon} {active} />{/if}
  {/snippet}

  <div class="flex flex-col gap-[6px]">
    {#if solo}<span class="text-[12px] label-caps text-text-muted">Left</span>{/if}
    <span class="font-display font-bold {scoreSize} leading-[0.8] tracking-score tabular-nums {active ? 'text-text' : 'text-ink-3'}"
      ><RollingNumber {...x01Roll(p)} /></span
    >
  </div>

  {#if !p.opened}
    <span class="text-[13px] label-caps text-text-muted">Needs to open</span>
  {:else if (portrait || !active) && p.canFinish}
    <span class="flex items-baseline gap-[10px]">
      <span class="text-[12px] label-caps {active ? 'text-text-muted' : 'text-text-dim'}">Can finish</span>
      <span
        class="font-display font-bold {portrait ? 'text-[28px] lg:text-[34px]' : 'text-[28px]'} leading-none {active
          ? 'text-accent'
          : 'text-ink-3'}">{p.canFinish}</span
      >
    </span>
  {/if}

  <PagedStats pages={x01Pages(p)} {active} class={statSize} />

  {#if chalkboard && portrait}
    <div
      class="flex items-center gap-[10px] pt-[10px] border-t border-line-2 min-w-0 overflow-hidden"
      role="group"
      aria-label="Last visits"
    >
      <span class="text-[11px] lg:text-[13px] label-caps text-text-dim">Visits</span>
      {#each p.visits.slice(-6) as v, i (i)}
        <span class="font-mono text-[13px] lg:text-[16px] {v.bust ? 'text-danger-text' : 'text-text-muted'}"
          >{v.bust ? 'Bust' : v.scored}</span
        >
      {:else}
        <span class="text-[13px] text-text-dim">None yet</span>
      {/each}
    </div>
  {:else if chalkboard}
    <Chalkboard visits={p.visits} current={p.current} {active} />
  {/if}
</PanelShell>
