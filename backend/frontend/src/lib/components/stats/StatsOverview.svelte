<script lang="ts">
  // Overview (Stats.dc.html): five numbers, the average of every leg, and your personal bests.
  import type { StatBest, X01Stats } from '$lib/api'
  import { dec1, pct, trendOf } from '$lib/stats/trend'
  import { beforeNoun, doubleTotals, rangeNoun, refHref, refLine } from '$lib/stats/view'
  import ChartCard from './ChartCard.svelte'
  import ChartLegend from './ChartLegend.svelte'
  import LinkRow from './LinkRow.svelte'
  import StatTile from './StatTile.svelte'
  import StatsSection from './StatsSection.svelte'
  import TileGrid from './TileGrid.svelte'
  import TrendBarsChart from './TrendBarsChart.svelte'

  let { stats }: { stats: X01Stats } = $props()
  const o = $derived(stats.overview)
  const range = $derived(stats.applied.range)
  const before = $derived(beforeNoun(range))
  const totals = $derived(doubleTotals(stats.checkout.doubles))
  const legs = $derived(stats.window.legs)
  const won = $derived(Math.round((o.legsWon.value ?? 0) * legs))

  const bars = $derived(
    o.perLeg.map((l, i) => ({
      value: l.average,
      trend: l.trend,
      tone: l.won ? ('won' as const) : ('lost' as const),
      describe: `${o.perLeg.length - i} ${o.perLeg.length - i === 1 ? 'leg' : 'legs'} ago: ${dec1(l.average)} average in ${l.darts} darts, ${l.won ? 'won' : 'lost'}`,
    })),
  )
  const best = $derived(o.perLeg.reduce((b, l, i) => ((l.average ?? -1) > (o.perLeg[b]?.average ?? -1) ? i : b), 0))
  const bestLeg = $derived(o.perLeg.at(best))
  const highlight = $derived(
    bestLeg && bestLeg.average !== null
      ? { index: best, label: bestLeg.won ? `${bestLeg.darts}-darter · ${dec1(bestLeg.average)}` : dec1(bestLeg.average) }
      : null,
  )

  const bests = $derived(
    [
      { label: 'Best leg', best: o.bests.bestLeg, value: (b: StatBest) => `${b.value} darts` },
      { label: 'Best leg average', best: o.bests.bestLegAverage, value: (b: StatBest) => dec1(b.value) },
      { label: 'Best match average', best: o.bests.bestMatchAverage, value: (b: StatBest) => dec1(b.value) },
      { label: 'Highest checkout', best: o.bests.highestCheckout, value: (b: StatBest) => String(b.value) },
      { label: 'Most 180s in a match', best: o.bests.most180s, value: (b: StatBest) => String(b.value) },
    ].flatMap(b => (b.best ? [{ ...b, best: b.best }] : [])),
  )
</script>

<StatsSection id="stats-overview" title="Overview" note="The basics for {rangeNoun(range)} of X01." first>
  <TileGrid>
    <StatTile
      label="3-dart average"
      value={dec1(o.average.value)}
      trend={trendOf(o.average.value, o.average.before, 'decimal', 'higher')}
      sub={o.average.before !== null && before ? `${dec1(o.average.before)} ${before}` : 'Points per three darts'}
      spark={o.average.spark}
    />
    <StatTile
      label="First 9 average"
      value={dec1(o.first9.value)}
      trend={trendOf(o.first9.value, o.first9.before, 'decimal', 'higher')}
      sub="Your first three visits"
      spark={o.first9.spark}
    />
    <StatTile
      label="Darts per leg"
      value={dec1(o.dartsPerLeg.value)}
      trend={trendOf(o.dartsPerLeg.value, o.dartsPerLeg.before, 'decimal', 'lower')}
      sub="Legs you won · fewer is better"
      spark={o.dartsPerLeg.spark}
    />
    <StatTile
      label="Checkout rate"
      value={pct(o.checkout.value)}
      trend={trendOf(o.checkout.value, o.checkout.before, 'pts', 'higher')}
      sub="{totals.hits} of {totals.attempts} darts at a double"
      spark={o.checkout.spark}
    />
    <StatTile
      label="Legs won"
      value={String(won)}
      unit="of {legs}"
      trend={trendOf(o.legsWon.value, o.legsWon.before, 'pts', 'higher')}
      sub="{pct(o.legsWon.value)} · {o.bestStreak} {o.bestStreak === 1 ? 'leg' : 'legs'} best streak"
      spark={o.legsWon.spark}
    />
  </TileGrid>
  <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
    <ChartCard title="Average per leg" note="Bars are legs (darker = lost), line is the 10-leg trend">
      {#snippet aside()}
        <ChartLegend
          items={[
            { label: 'Won', mark: 'box', tone: 'won' },
            { label: 'Lost', mark: 'box', tone: 'lost' },
            { label: '10-leg trend', mark: 'line', tone: 'accent' },
            ...(o.average.before !== null ? [{ label: 'Before', mark: 'dash' as const, tone: 'muted' as const }] : []),
          ]}
        />
      {/snippet}
      <TrendBarsChart
        label="3-dart average per leg, {rangeNoun(range)}"
        {bars}
        {highlight}
        reference={o.average.before !== null && before
          ? { value: o.average.before, label: `${before.replace(/^the /, '')} · avg ${dec1(o.average.before)}` }
          : null}
        startLabel="{o.perLeg.length} {o.perLeg.length === 1 ? 'leg' : 'legs'} ago"
        endLabel="latest"
      />
    </ChartCard>
    <ChartCard title="Personal bests" note="Open any of them in History">
      <div class="flex flex-col">
        {#each bests as b (b.label)}
          <LinkRow href={refHref(b.best.ref)} sub={refLine(b.best.ref)} value={b.value(b.best)}
            >{#snippet title()}{b.label}{/snippet}</LinkRow
          >
        {/each}
      </div>
    </ChartCard>
  </div>
</StatsSection>
