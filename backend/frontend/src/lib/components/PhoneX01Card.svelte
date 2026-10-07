<script lang="ts">
  // The X01 thrower on a phone: name, board, Throwing pill, leg pips, big score, averages, chalkboard.
  import Chalkboard from './Chalkboard.svelte'
  import LegPips from './LegPips.svelte'
  import RollingNumber from './RollingNumber.svelte'
  import { x01Roll } from '$lib/playerStats'
  import PhoneCardShell from './PhoneCardShell.svelte'
  import type { PillKind } from './pills.js'
  import type { X01PlayerView } from '$lib/playerStats'
  import type { SeatLine } from '$lib/remote'

  let {
    name,
    p,
    pill,
    seat,
    chalkboard,
  }: {
    name: string
    p: X01PlayerView
    pill: PillKind | null
    seat: SeatLine | null
    chalkboard: boolean
  } = $props()

  const stats = $derived([
    { label: 'Leg avg', value: p.legAvg, dim: false },
    { label: 'Match avg', value: p.avg, dim: true },
    { label: 'Checkout', value: p.checkout, dim: true },
    { label: 'Darts', value: String(p.darts), dim: false },
  ])
</script>

<PhoneCardShell {name} label="{name}, throwing, {p.remaining} left" {pill} {seat} class="gap-2">
  {#snippet aside()}
    {#if p.firstTo > 1}<span class="ml-auto"><LegPips total={p.firstTo} won={p.legsWon} active /></span>{/if}
  {/snippet}
  <!-- Short screens (≤ 740 px tall) drop the chalkboard and shrink the score so the board keeps its room -->
  <div class="grid gap-3 items-end grid-cols-1 {chalkboard ? '[@media(min-height:741px)]:grid-cols-[minmax(0,1fr)_150px]' : ''}">
    <div class="flex flex-col gap-[10px] min-w-0">
      <span class="font-display font-bold text-[64px] [@media(min-height:741px)]:text-[104px] leading-[0.8] tracking-[-0.02em] tabular-nums"
        ><RollingNumber {...x01Roll(p)} /></span
      >
      {#if !p.opened}<span class="text-[12px] label-caps text-text-muted">Needs to open</span>{/if}
      <div class="hidden [@media(min-height:600px)]:flex flex-wrap gap-x-[14px] gap-y-1">
        {#each stats as s (s.label)}
          <span class="flex flex-col gap-[1px]">
            <span class="text-[10px] uppercase tracking-[0.08em] text-text-muted whitespace-nowrap">{s.label}</span>
            <span class="font-display font-bold text-[22px] leading-none tabular-nums {s.dim ? 'text-text-muted' : 'text-text'}"
              >{s.value}</span
            >
          </span>
        {/each}
      </div>
    </div>
    {#if chalkboard}<div class="hidden [@media(min-height:741px)]:flex h-[132px] flex-col overflow-hidden">
        <Chalkboard visits={p.visits} current={p.current} active />
      </div>{/if}
  </div>
</PhoneCardShell>
