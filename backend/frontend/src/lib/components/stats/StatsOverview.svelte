<script lang="ts">
  // Overview (Stats.dc.html): five numbers, the average of every leg, and your personal bests.
  import type { StatBest, X01Stats } from '$lib/api'
  import { beforeNoun, dec1, delta, doubleTotals, pct, rangeNoun } from '$lib/stats/view'
  import Kpi from './Kpi.svelte'
  import KpiGrid from './KpiGrid.svelte'
  import LegChart from './LegChart.svelte'
  import RefRow from './RefRow.svelte'
  import StatsSection from './StatsSection.svelte'

  let { stats }: { stats: X01Stats } = $props()
  const o = $derived(stats.overview)
  const range = $derived(stats.applied.range)
  const before = $derived(beforeNoun(range))
  const totals = $derived(doubleTotals(stats.checkout.doubles))
  const legs = $derived(stats.window.legs)
  const won = $derived(Math.round((o.legsWon.value ?? 0) * legs))

  const bests = $derived(
    [
      { label: 'Best leg', best: o.bests.bestLeg, value: (b: StatBest) => `${b.value} darts` },
      { label: 'Best leg average', best: o.bests.bestLegAverage, value: (b: StatBest) => dec1(b.value) },
      { label: 'Best match average', best: o.bests.bestMatchAverage, value: (b: StatBest) => dec1(b.value) },
      { label: 'Highest checkout', best: o.bests.highestCheckout, value: (b: StatBest) => String(b.value) },
      { label: 'Most 180s in a match', best: o.bests.most180s, value: (b: StatBest) => String(b.value) },
    ].filter(b => b.best !== null),
  )
</script>

<StatsSection id="stats-overview" title="Overview" note="The basics for {rangeNoun(range)} of X01." first>
  <KpiGrid>
    <Kpi
      label="3-dart average"
      value={dec1(o.average.value)}
      delta={delta(o.average.value, o.average.before, 'decimal', 'higher')}
      sub={o.average.before !== null && before ? `${dec1(o.average.before)} ${before}` : 'Points per three darts'}
      spark={o.average.spark}
    />
    <Kpi
      label="First 9 average"
      value={dec1(o.first9.value)}
      delta={delta(o.first9.value, o.first9.before, 'decimal', 'higher')}
      sub="Your first three visits"
      spark={o.first9.spark}
    />
    <Kpi
      label="Darts per leg"
      value={dec1(o.dartsPerLeg.value)}
      delta={delta(o.dartsPerLeg.value, o.dartsPerLeg.before, 'decimal', 'lower')}
      sub="Legs you won · fewer is better"
      spark={o.dartsPerLeg.spark}
    />
    <Kpi
      label="Checkout rate"
      value={pct(o.checkout.value)}
      delta={delta(o.checkout.value, o.checkout.before, 'pts', 'higher')}
      sub="{totals.hits} of {totals.attempts} darts at a double"
      spark={o.checkout.spark}
    />
    <Kpi
      label="Legs won"
      value={String(won)}
      unit="of {legs}"
      delta={delta(o.legsWon.value, o.legsWon.before, 'pts', 'higher')}
      sub="{pct(o.legsWon.value)} · {o.bestStreak} {o.bestStreak === 1 ? 'leg' : 'legs'} best streak"
      spark={o.legsWon.spark}
    />
  </KpiGrid>
  <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
    <section class="card flex min-w-0 flex-col gap-3 px-5 py-[18px]" aria-labelledby="stats-legs">
      <div class="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h3 id="stats-legs" class="m-0 text-[15px] font-semibold">Average per leg</h3>
        <span class="text-[12px] text-text-dim">Bars are legs (darker = lost), line is the 10-leg trend</span>
        <div class="flex flex-wrap gap-3.5 text-[12px] text-text-muted xl:ml-auto">
          <span class="flex items-center gap-1.5"><span class="h-3 w-3 rounded-[2px] bg-accent-line"></span>Won</span>
          <span class="flex items-center gap-1.5"><span class="h-3 w-3 rounded-[2px] bg-line-3"></span>Lost</span>
          <span class="flex items-center gap-1.5"><span class="h-[3px] w-3 rounded-[2px] bg-accent"></span>10-leg trend</span>
          {#if o.average.before !== null}
            <span class="flex items-center gap-1.5"><span class="h-0.5 w-3 rounded-[2px] bg-text-muted"></span>Before</span>
          {/if}
        </div>
      </div>
      <LegChart legs={o.perLeg} before={o.average.before} beforeLabel={before && before.replace(/^the /, '')} />
    </section>
    <section class="card flex min-w-0 flex-col gap-1 px-5 py-[18px]" aria-labelledby="stats-bests">
      <div class="mb-2 flex flex-wrap items-baseline gap-x-2.5">
        <h3 id="stats-bests" class="m-0 text-[15px] font-semibold">Personal bests</h3>
        <span class="text-[12px] text-text-dim">Open any of them in History</span>
      </div>
      {#each bests as b (b.label)}
        {#if b.best}
          <RefRow ref={b.best.ref} value={b.value(b.best)}>
            {#snippet title()}{b.label}{/snippet}
          </RefRow>
        {/if}
      {/each}
    </section>
  </div>
</StatsSection>
