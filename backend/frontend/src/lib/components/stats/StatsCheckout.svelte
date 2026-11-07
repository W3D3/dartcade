<script lang="ts">
  // Checkout (Stats.dc.html): from 170 down to the double. Your doubles as a list or on the board,
  // how often each range finishes, and your highest checkouts.
  import type { X01Stats } from '$lib/api'
  import { dayMonth } from '$lib/fmt'
  import { dec1, delta, doubleTotals, pct, refHref } from '$lib/stats/view'
  import BarRows from './BarRows.svelte'
  import DoublesBoard from './DoublesBoard.svelte'
  import Kpi from './Kpi.svelte'
  import KpiGrid from './KpiGrid.svelte'
  import RefRow from './RefRow.svelte'
  import StatsSection from './StatsSection.svelte'

  let { stats }: { stats: X01Stats } = $props()
  const c = $derived(stats.checkout)
  const rate = $derived(stats.overview.checkout)
  const high = $derived(stats.overview.bests.highestCheckout)
  const totals = $derived(doubleTotals(stats.checkout.doubles))
  const SHOWN_DOUBLES = 8
  // Full bar at 60%: a good double rate, so the bars spread out
  const FULL_RATE = 0.6
  let view = $state<'list' | 'board'>('list')

  const doubles = $derived(
    c.doubles
      .slice(0, SHOWN_DOUBLES)
      .map(d => ({ ...d, rate: d.hits / d.attempts }))
      .sort((a, b) => b.rate - a.rate || b.attempts - a.attempts)
      .map(d => ({
        key: d.target,
        name: d.target,
        fill: Math.min(1, d.rate / FULL_RATE),
        value: pct(d.rate),
        detail: `${d.hits} / ${d.attempts}`,
        bright: d.rate >= 0.45,
      })),
  )
  const topRate = $derived(Math.max(...c.ranges.map(r => r.rate ?? 0)))
  const ranges = $derived(
    c.ranges.map(r => ({
      key: r.label,
      name: r.label,
      fill: topRate > 0 ? (r.rate ?? 0) / topRate : 0,
      value: r.rate === null ? '–' : pct(r.rate),
      bright: r.rate !== null && r.rate === topRate,
    })),
  )
</script>

{#snippet toggle(id: 'list' | 'board', label: string)}
  <button
    type="button"
    aria-pressed={view === id}
    class="cursor-pointer rounded-[6px] border-0 px-2.5 py-1 text-[12px] {view === id
      ? 'bg-line font-semibold text-text'
      : 'bg-transparent text-text-muted'}"
    onclick={() => (view = id)}>{label}</button
  >
{/snippet}

<StatsSection id="stats-checkout" title="Checkout" note="From 170 down to the double.">
  <KpiGrid>
    <Kpi
      label="Checkout rate"
      value={pct(rate.value)}
      delta={delta(rate.value, rate.before, 'pts', 'higher')}
      sub="{totals.hits} of {totals.attempts} darts at a double"
    />
    <Kpi
      label="Highest checkout"
      value={high ? String(high.value) : '–'}
      sub={high ? `${(high.darts ?? []).join(' · ')} · ${dayMonth(new Date(high.ref.finishedAt))}` : 'None yet'}
    >
      {#if high}<a href={refHref(high.ref)} class="mt-0.5 text-[13px] font-semibold text-accent no-underline hover:text-accent-hover"
          >View game ›</a
        >{/if}
    </Kpi>
    <Kpi
      label="Ton+ checkouts"
      value={String(c.tonPlus.value)}
      delta={delta(c.tonPlus.value, c.tonPlus.before, 'count', 'higher')}
      sub="100 or more in one visit"
    />
    <Kpi
      label="Darts at double"
      value={dec1(c.dartsAtDouble.value)}
      unit="per leg won"
      delta={delta(c.dartsAtDouble.value, c.dartsAtDouble.before, 'decimal', 'lower')}
      sub="Fewer is better"
    />
    <Kpi
      label="Busts"
      value={String(c.busts.value)}
      delta={delta(c.busts.value, c.busts.before, 'count', 'lower')}
      sub="Scored too much on a finish"
    />
  </KpiGrid>

  <div class="grid gap-3 lg:grid-cols-3">
    <section class="card flex min-w-0 flex-col gap-3 px-5 py-[18px]" aria-labelledby="stats-doubles">
      <div class="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <h3 id="stats-doubles" class="m-0 text-[15px] font-semibold">Your doubles</h3>
        <span class="text-[12px] text-text-dim">Hit rate when going for the double</span>
        <div role="group" aria-label="Show doubles as" class="ml-auto flex rounded-[10px] border border-line bg-surface-panel p-0.5">
          {@render toggle('list', 'List')}
          {@render toggle('board', 'Board')}
        </div>
      </div>
      {#if c.doubles.length === 0}
        <p class="m-0 text-[13px] text-text-muted">No darts at a double yet.</p>
      {:else if view === 'list'}
        <BarRows rows={doubles} label="Your doubles" />
      {:else}
        <DoublesBoard doubles={c.doubles} />
      {/if}
    </section>
    <section class="card flex min-w-0 flex-col gap-3 px-5 py-[18px]" aria-labelledby="stats-ranges">
      <div class="flex flex-col gap-1">
        <h3 id="stats-ranges" class="m-0 text-[15px] font-semibold">Checkout rate by range</h3>
        <span class="text-[12px] text-text-dim">Share of visits started on that score that finished</span>
      </div>
      <BarRows rows={ranges} label="Checkout rate by range" />
    </section>
    <section class="card flex min-w-0 flex-col gap-1 px-5 py-[18px]" aria-labelledby="stats-top">
      <div class="mb-2 flex flex-wrap items-baseline gap-x-2.5">
        <h3 id="stats-top" class="m-0 text-[15px] font-semibold">Top checkouts</h3>
        <span class="text-[12px] text-text-dim">Tap one to open the game</span>
      </div>
      {#each c.top as t (`${t.ref.gameId}-${t.ref.leg}-${t.ref.visit}`)}
        <RefRow ref={t.ref} tag={t.value >= 100 ? 'TON+' : undefined}>
          {#snippet title()}{t.value} <span class="font-normal text-text-muted">· {(t.darts ?? []).join(' ')}</span>{/snippet}
        </RefRow>
      {:else}
        <p class="m-0 text-[13px] text-text-muted">No checkouts yet.</p>
      {/each}
    </section>
  </div>
</StatsSection>
