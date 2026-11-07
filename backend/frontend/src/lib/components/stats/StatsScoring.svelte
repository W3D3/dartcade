<script lang="ts">
  // Scoring (Stats.dc.html): how much your visits score, how often you hit the big ones, and where
  // your darts at the 20 land.
  import type { X01Stats } from '$lib/api'
  import { dec1, pct, trendOf } from '$lib/stats/trend'
  import { rangeLabel, rangeNoun, refHref, refLine, visitTitle } from '$lib/stats/view'
  import BarList from './BarList.svelte'
  import ChartCard from './ChartCard.svelte'
  import ChartLegend from './ChartLegend.svelte'
  import ColumnChart from './ColumnChart.svelte'
  import LineChart from './LineChart.svelte'
  import LinkRow from './LinkRow.svelte'
  import StatTile from './StatTile.svelte'
  import StatsSection from './StatsSection.svelte'
  import TileGrid from './TileGrid.svelte'

  let { stats }: { stats: X01Stats } = $props()
  const s = $derived(stats.scoring)
  const range = $derived(stats.applied.range)
  const now = $derived(rangeLabel(range))
  const hasBefore = $derived(stats.before !== null)
  const share = (n: number) => (s.visits > 0 ? n / s.visits : null)
  const visitLabel = (n: number) => `Visit ${n}`
  const SHOWN_180S = 4
  let all180s = $state(false)

  const common = $derived(
    s.common.map((c, i) => ({
      key: String(c.score),
      name: String(c.score),
      fill: c.visits / (s.common[0]?.visits ?? 1),
      value: String(c.visits),
      detail: 'visits',
      bright: i === 0,
    })),
  )
  const twenties = $derived(
    s.twenties.beds.map((b, i) => ({
      key: b.name,
      name: b.name,
      fill: b.share / (s.twenties.beds[0]?.share ?? 1),
      value: pct(b.share),
      bright: i === 0,
    })),
  )
  function show180s() {
    all180s = true
    document.getElementById('stats-180s')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
  const LINK = 'mt-0.5 cursor-pointer self-start border-0 bg-transparent p-0 text-[13px] font-semibold text-accent hover:text-accent-hover'
</script>

<StatsSection id="stats-scoring" title="Scoring" note="How much your visits score, and how often you hit the big ones.">
  <TileGrid>
    <StatTile
      label="Average until 170"
      value={dec1(s.until170.value)}
      trend={trendOf(s.until170.value, s.until170.before, 'decimal', 'higher')}
      sub="Visits before you're on a finish"
      spark={s.until170.spark}
    />
    <StatTile
      label="180s"
      value={String(s.count180.value)}
      trend={trendOf(s.count180.value, s.count180.before, 'count', 'higher')}
      sub={s.count180.value > 0 ? `1 every ${dec1(stats.window.legs / s.count180.value)} legs` : 'None yet'}
    >
      {#if s.count180.value > 0}<button type="button" class={LINK} onclick={show180s}>View all ›</button>{/if}
    </StatTile>
    <StatTile
      label="140+"
      value={String(s.count140.value)}
      unit="visits"
      trend={trendOf(s.count140.value, s.count140.before, 'count', 'higher')}
      sub="{pct(share(s.count140.value))} of visits"
    />
    <StatTile
      label="100+"
      value={String(s.count100.value)}
      unit="visits"
      trend={trendOf(s.share100.value, s.share100.before, 'pts', 'higher')}
      sub="{pct(s.share100.value)} of visits"
    />
    <StatTile
      label="Under 40"
      value={pct(s.under40.value)}
      unit="of visits"
      trend={trendOf(s.under40.value, s.under40.before, 'pts', 'lower')}
      sub="The visits that cost you · fewer is better"
    />
  </TileGrid>

  <div class="grid gap-3 lg:grid-cols-2">
    <ChartCard title="What your visits score" note="Share of visits not on a finish{hasBefore ? ', now vs before' : ''}">
      <ColumnChart
        label="Share of visits per score range, {rangeNoun(range)}"
        categories={s.buckets.map(b => b.label)}
        format={pct}
        series={[
          { key: 'now', label: now, tone: 'accent', values: s.buckets.map(b => b.now) },
          ...(hasBefore ? [{ key: 'before', label: 'Before', tone: 'lost' as const, values: s.buckets.map(b => b.before) }] : []),
        ]}
      />
      <ChartLegend
        items={[
          { label: now, mark: 'box', tone: 'accent' },
          ...(hasBefore ? [{ label: 'Before', mark: 'box' as const, tone: 'lost' as const }] : []),
        ]}
      />
    </ChartCard>
    <ChartCard title="Average by visit" note="Average score for each visit in a leg">
      <LineChart
        label="Average score of each visit in a leg, {rangeNoun(range)}"
        steps={s.byVisit.map(v => v.visit)}
        format={dec1}
        stepLabel={visitLabel}
        band={{ from: 1, to: 3, label: 'First 9' }}
        series={[
          { key: 'now', label: now, tone: 'accent', values: s.byVisit.map(v => v.now) },
          ...(hasBefore ? [{ key: 'before', label: 'Before', tone: 'muted' as const, values: s.byVisit.map(v => v.before) }] : []),
        ]}
      />
      <ChartLegend
        items={[
          { label: now, mark: 'line', tone: 'accent' },
          ...(hasBefore ? [{ label: 'Before', mark: 'dash' as const, tone: 'muted' as const }] : []),
        ]}
      />
    </ChartCard>
  </div>

  <div class="grid gap-3 lg:grid-cols-3">
    <ChartCard title="Most common scores">
      <BarList items={common} label="Most common scores" />
    </ChartCard>
    <ChartCard title="Where your 20s go" note="Darts in the 20, 1 and 5 while scoring">
      {#if twenties.length > 0}
        <BarList items={twenties} label="Where your 20s go" />
      {:else}
        <p class="m-0 text-[13px] text-text-muted">No darts in the 20 bed yet.</p>
      {/if}
    </ChartCard>
    <ChartCard id="stats-180s" title="Your 180s" note="{s.list180.length} in {rangeNoun(range)}">
      <div class="flex flex-col">
        {#each all180s ? s.list180 : s.list180.slice(0, SHOWN_180S) as ref (`${ref.gameId}-${ref.leg}-${ref.visit}`)}
          <LinkRow href={refHref(ref)} sub={refLine(ref)}>{#snippet title()}{visitTitle(ref)}{/snippet}</LinkRow>
        {:else}
          <p class="m-0 text-[13px] text-text-muted">None yet. They'll show up here.</p>
        {/each}
      </div>
      {#if !all180s && s.list180.length > SHOWN_180S}
        <button type="button" class={LINK} onclick={() => (all180s = true)}>Show all {s.list180.length}</button>
      {/if}
    </ChartCard>
  </div>
</StatsSection>
