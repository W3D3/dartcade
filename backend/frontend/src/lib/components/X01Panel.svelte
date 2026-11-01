<script lang="ts">
  import type { Who } from '$lib/face'
  import PanelShell from './PanelShell.svelte'
  import LegPips from './LegPips.svelte'
  import Chalkboard from './Chalkboard.svelte'
  import RollingNumber from './RollingNumber.svelte'
  import { x01Averages, x01Roll } from '$lib/playerStats'
  import type { PillKind } from './pills.js'
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
  } = $props()

  const scoreSize = $derived(
    solo ? 'text-[min(220px,24vh)]' : portrait ? 'text-[min(52cqi,15vh)]' : 'text-[min(150px,24vh,56cqi)] xl:text-[min(220px,24vh)]',
  )
  const statGap = $derived(solo ? 'gap-9' : portrait ? 'gap-5 lg:gap-9' : 'gap-[18px] xl:gap-9')
  const labelSize = $derived(solo ? 'text-[13px]' : portrait ? 'text-[11px] lg:text-[13px]' : 'text-[11px] xl:text-[13px]')
  const valueSize = $derived(solo ? 'text-[44px]' : portrait ? 'text-[30px] lg:text-[40px]' : 'text-[30px] xl:text-[44px]')
</script>

<PanelShell {who} {active} {solo} {portrait} {pill} {seat} {waiting} pillInRow={solo}>
  {#snippet aside()}
    {#if !solo}<LegPips total={p.firstTo} won={p.legsWon} {active} />{/if}
  {/snippet}

  <div class="flex flex-col gap-[6px]">
    {#if solo}<span class="text-[12px] label-caps text-text-muted">Left</span>{/if}
    <span class="font-display font-bold {scoreSize} leading-[0.8] tracking-[-0.02em] tabular-nums {active ? 'text-text' : 'text-ink-3'}"
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

  <div class="flex {statGap}">
    {#each [...x01Averages(p), { label: 'Darts', value: String(p.darts) }, { label: 'Checkout', value: p.checkout, title: `${p.checkoutDarts} darts at a finish` }] as s (s.label)}
      <span class="flex flex-col gap-1" title={'title' in s ? s.title : undefined}>
        <span class="{labelSize} label-caps {active ? 'text-text-muted' : 'text-text-dim'}">{s.label}</span>
        <span class="font-display font-bold {valueSize} leading-none tabular-nums {active ? 'text-text' : 'text-ink-2'}">{s.value}</span>
      </span>
    {/each}
  </div>

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
