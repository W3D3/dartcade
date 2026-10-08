<script lang="ts">
  // X01 leg by leg (X01-Details*): leg tabs, the leg's summary line, the points-left chart and
  // the chalkboard. Party: a highlight picker, and the chalkboard beside the chart on desktop.
  import type { GameDetail } from '$lib/api'
  import Chalkboard from './Chalkboard.svelte'
  import HighlightPicker from './HighlightPicker.svelte'
  import RemainingChart from './RemainingChart.svelte'
  import { chalkboardRows, legSeries, legSummary, x01Sides } from '$lib/details/x01'
  import { highlightDefault } from '$lib/details/page'

  let { detail, party = false }: { detail: GameDetail; party?: boolean } = $props()
  const x01 = $derived(detail.detail.mode === 'x01' ? detail.detail : null)
  const sides = $derived(x01 ? x01Sides(detail.game, x01) : [])
  const start = $derived(typeof detail.game.config.startScore === 'number' ? detail.game.config.startScore : 501)
  const legs = $derived(x01?.legs.map(l => l.leg) ?? [])
  let picked = $state<number | null>(null)
  const leg = $derived(picked ?? legs.at(-1) ?? 0)
  let highlightPick = $state<number | null>(null)
  const highlight = $derived(
    highlightPick ?? (party ? highlightDefault(detail) : (sides.find(s => s.seats.includes(detail.game.mySeat ?? -1))?.key ?? null)),
  )
  const nameOf = (seat: number) => detail.game.players.find(p => p.seat === seat)?.name ?? ''
  const forfeitedBy = $derived(detail.game.players.find(p => p.forfeited)?.name ?? null)
</script>

{#if x01}
  <section aria-label="Leg by leg" class="flex flex-col gap-4 min-w-0 box-border p-4 md:p-6 card">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="m-0 font-display font-bold text-[24px] md:text-[32px] leading-none uppercase">Leg by leg</h2>
      <div class="flex flex-wrap items-center gap-3">
        {#if party}
          <HighlightPicker
            options={sides.map(s => ({ key: s.key, name: s.name }))}
            value={highlight ?? 0}
            onpick={(k: number) => (highlightPick = k)}
          />
        {/if}
        {#if legs.length > 1}
          <div role="group" aria-label="Leg" class="flex flex-wrap gap-1 p-1 bg-bg rounded-[10px]">
            {#each legs as l (l)}
              <button
                type="button"
                aria-pressed={l === leg}
                onclick={() => (picked = l)}
                class="h-10 min-w-[72px] md:min-w-24 px-3 border-0 rounded-[7px] font-[inherit] text-[15px] cursor-pointer
                       {l === leg ? 'bg-accent text-accent-fg font-bold' : 'bg-transparent text-ink-2'}">Leg {l + 1}</button
              >
            {/each}
          </div>
        {:else}
          <span class="text-[14px] text-text-muted">Leg 1</span>
        {/if}
      </div>
    </div>
    <p class="m-0 text-[15px] text-text-muted">{legSummary(x01, leg, sides, nameOf, forfeitedBy)}</p>
    <div class="flex flex-col gap-4 {party ? 'xl:flex-row xl:items-start' : ''}">
      <div class="min-w-0 {party ? 'xl:flex-grow' : ''}">
        <RemainingChart series={legSeries(x01, leg, sides, start)} {sides} {start} {highlight} />
      </div>
      <div class="min-w-0 {party ? 'xl:w-[560px] xl:shrink-0' : ''}">
        <Chalkboard rows={chalkboardRows(x01, leg, sides)} {sides} showThrower={!!x01.teams} {nameOf} />
      </div>
    </div>
  </section>
{/if}
