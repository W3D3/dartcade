<script lang="ts">
  // Scoring (Stats.dc.html): how much your visits score, how often you hit the big ones, and
  // where your darts at the 20 land.
  import type { X01Stats } from '$lib/api'
  import { dec1, delta, pct, rangeNoun, visitTitle } from '$lib/stats/view'
  import BarRows from './BarRows.svelte'
  import BucketChart from './BucketChart.svelte'
  import ByVisitChart from './ByVisitChart.svelte'
  import Kpi from './Kpi.svelte'
  import KpiGrid from './KpiGrid.svelte'
  import RefRow from './RefRow.svelte'
  import StatsSection from './StatsSection.svelte'

  let { stats }: { stats: X01Stats } = $props()
  const s = $derived(stats.scoring)
  const range = $derived(stats.applied.range)
  const hasBefore = $derived(stats.before !== null)
  const share = (n: number) => (s.visits > 0 ? n / s.visits : null)
  const SHOWN_180S = 4
  let all180s = $state(false)

  const common = $derived(
    s.common.map((c, i) => ({
      key: String(c.score),
      name: String(c.score),
      fill: c.visits / s.common[0].visits,
      value: String(c.visits),
      detail: 'visits',
      bright: i === 0,
    })),
  )
  const twenties = $derived(
    s.twenties.beds.map((b, i) => ({
      key: b.name,
      name: b.name,
      fill: b.share / s.twenties.beds[0].share,
      value: pct(b.share),
      bright: i === 0,
    })),
  )
  const show180s = () => {
    all180s = true
    document.getElementById('stats-180s')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
</script>

<StatsSection id="stats-scoring" title="Scoring" note="How much your visits score, and how often you hit the big ones.">
  <KpiGrid>
    <Kpi
      label="Average until 170"
      value={dec1(s.until170.value)}
      delta={delta(s.until170.value, s.until170.before, 'decimal', 'higher')}
      sub="Visits before you're on a finish"
      spark={s.until170.spark}
    />
    <Kpi
      label="180s"
      value={String(s.count180.value)}
      delta={delta(s.count180.value, s.count180.before, 'count', 'higher')}
      sub={s.count180.value > 0 ? `1 every ${dec1(stats.window.legs / s.count180.value)} legs` : 'None yet'}
    >
      {#if s.count180.value > 0}
        <button
          type="button"
          class="mt-0.5 cursor-pointer self-start border-0 bg-transparent p-0 text-[13px] font-semibold text-accent hover:text-accent-hover"
          onclick={show180s}>View all ›</button
        >
      {/if}
    </Kpi>
    <Kpi
      label="140+"
      value={String(s.count140.value)}
      unit="visits"
      delta={delta(s.count140.value, s.count140.before, 'count', 'higher')}
      sub="{pct(share(s.count140.value))} of visits"
    />
    <Kpi
      label="100+"
      value={String(s.count100.value)}
      unit="visits"
      delta={delta(s.share100.value, s.share100.before, 'pts', 'higher')}
      sub="{pct(s.share100.value)} of visits"
    />
    <Kpi
      label="Under 40"
      value={pct(s.under40.value)}
      unit="of visits"
      delta={delta(s.under40.value, s.under40.before, 'pts', 'lower')}
      sub="The visits that cost you · fewer is better"
    />
  </KpiGrid>

  <div class="grid gap-3 lg:grid-cols-2">
    <section class="card flex min-w-0 flex-col gap-3 px-5 py-[18px]" aria-labelledby="stats-buckets">
      <div class="flex flex-wrap items-baseline gap-x-2.5">
        <h3 id="stats-buckets" class="m-0 text-[15px] font-semibold">What your visits score</h3>
        <span class="text-[12px] text-text-dim">Share of visits not on a finish{hasBefore ? ', now vs before' : ''}</span>
      </div>
      <BucketChart buckets={s.buckets} />
      <div class="flex gap-4 text-[12px] text-text-muted">
        <span class="flex items-center gap-1.5"><span class="h-3 w-3 rounded-[2px] bg-accent"></span>{rangeNoun(range)}</span>
        {#if hasBefore}<span class="flex items-center gap-1.5"><span class="h-3 w-3 rounded-[2px] bg-line-3"></span>Before</span>{/if}
      </div>
    </section>
    <section class="card flex min-w-0 flex-col gap-3 px-5 py-[18px]" aria-labelledby="stats-by-visit">
      <div class="flex flex-wrap items-baseline gap-x-2.5">
        <h3 id="stats-by-visit" class="m-0 text-[15px] font-semibold">Average by visit</h3>
        <span class="text-[12px] text-text-dim">Average score for each visit in a leg</span>
      </div>
      <ByVisitChart visits={s.byVisit} />
      <div class="flex gap-4 text-[12px] text-text-muted">
        <span class="flex items-center gap-1.5"><span class="h-[3px] w-3 rounded-[2px] bg-accent"></span>{rangeNoun(range)}</span>
        {#if hasBefore}<span class="flex items-center gap-1.5"><span class="h-0.5 w-3 rounded-[2px] bg-text-muted"></span>Before</span>{/if}
      </div>
    </section>
  </div>

  <div class="grid gap-3 lg:grid-cols-3">
    <section class="card flex min-w-0 flex-col gap-3 px-5 py-[18px]" aria-labelledby="stats-common">
      <h3 id="stats-common" class="m-0 text-[15px] font-semibold">Most common scores</h3>
      <BarRows rows={common} label="Most common scores" />
    </section>
    <section class="card flex min-w-0 flex-col gap-3 px-5 py-[18px]" aria-labelledby="stats-twenties">
      <div class="flex flex-wrap items-baseline gap-x-2.5">
        <h3 id="stats-twenties" class="m-0 text-[15px] font-semibold">Where your 20s go</h3>
        <span class="text-[12px] text-text-dim">Darts in the 20, 1 and 5 while scoring</span>
      </div>
      {#if twenties.length > 0}
        <BarRows rows={twenties} label="Where your 20s go" />
      {:else}
        <p class="m-0 text-[13px] text-text-muted">No darts in the 20 bed yet.</p>
      {/if}
    </section>
    <section id="stats-180s" class="card flex min-w-0 scroll-mt-4 flex-col gap-1 px-5 py-[18px]" aria-labelledby="stats-180s-title">
      <div class="mb-2 flex flex-wrap items-baseline gap-x-2.5">
        <h3 id="stats-180s-title" class="m-0 text-[15px] font-semibold">Your 180s</h3>
        <span class="text-[12px] text-text-dim">{s.list180.length} in {rangeNoun(range)}</span>
      </div>
      {#each all180s ? s.list180 : s.list180.slice(0, SHOWN_180S) as ref (`${ref.gameId}-${ref.leg}-${ref.visit}`)}
        <RefRow {ref}>{#snippet title()}{visitTitle(ref)}{/snippet}</RefRow>
      {:else}
        <p class="m-0 text-[13px] text-text-muted">None yet. They'll show up here.</p>
      {/each}
      {#if !all180s && s.list180.length > SHOWN_180S}
        <button
          type="button"
          class="mt-2 cursor-pointer self-start border-0 bg-transparent p-0 text-[13px] font-semibold text-accent hover:text-accent-hover"
          onclick={() => (all180s = true)}>Show all {s.list180.length}</button
        >
      {/if}
    </section>
  </div>
</StatsSection>
