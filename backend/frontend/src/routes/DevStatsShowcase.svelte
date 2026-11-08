<script lang="ts">
  // Every stats component with made-up numbers (lib/stats/fixtures.ts), for building and
  // screenshotting them on their own. Only in the dev server (App.svelte), never in a build.
  import Layout from '$lib/components/Layout.svelte'
  import StatTile from '$lib/components/stats/StatTile.svelte'
  import TileGrid from '$lib/components/stats/TileGrid.svelte'
  import ChartCard from '$lib/components/stats/ChartCard.svelte'
  import ChartLegend from '$lib/components/stats/ChartLegend.svelte'
  import SegmentedControl from '$lib/components/stats/SegmentedControl.svelte'
  import BarList from '$lib/components/stats/BarList.svelte'
  import ColumnChart from '$lib/components/stats/ColumnChart.svelte'
  import LineChart from '$lib/components/stats/LineChart.svelte'
  import TrendBarsChart from '$lib/components/stats/TrendBarsChart.svelte'
  import DoubleRing from '$lib/components/stats/DoubleRing.svelte'
  import LinkRow from '$lib/components/stats/LinkRow.svelte'
  import StatsState from '$lib/components/stats/StatsState.svelte'
  import { dec1, pct, trendOf } from '$lib/stats/trend'
  import {
    BUCKETS,
    BUCKETS_BEFORE,
    BUCKETS_NOW,
    BY_VISIT_BEFORE,
    BY_VISIT_NOW,
    DOUBLES,
    LEG_AVERAGES,
    LEGS_WON,
    series,
  } from '$lib/stats/fixtures'

  let range = $state('legs50')
  let view = $state('list')
  const pickRange = (id: string) => (range = id)
  const pickView = (id: string) => (view = id)
  const best = LEG_AVERAGES.indexOf(Math.max(...LEG_AVERAGES))
  const trend = LEG_AVERAGES.map((_, i) => {
    const last = LEG_AVERAGES.slice(Math.max(0, i - 9), i + 1)
    return last.reduce((a, b) => a + b, 0) / last.length
  })
  const doubles = [...DOUBLES.entries()]
    .map(([n, d]) => ({ n, ...d, rate: d.hits / d.attempts }))
    .sort((a, b) => b.rate - a.rate)
    .map(d => ({
      key: String(d.n),
      name: d.n === 25 ? 'Bull' : `D${d.n}`,
      fill: Math.min(1, d.rate / 0.6),
      value: pct(d.rate),
      detail: `${d.hits} / ${d.attempts}`,
      bright: d.rate >= 0.45,
    }))
</script>

<Layout title="Stats components">
  <main class="flex min-h-0 flex-grow flex-col gap-6 overflow-y-auto px-4 py-4 md:px-8 md:py-10 xl:px-11">
    <h1 class="font-display text-[40px] font-bold uppercase leading-none">Stats components</h1>

    <h2 class="text-[18px] font-semibold">Range pickers</h2>
    <div class="flex flex-wrap gap-2">
      <SegmentedControl
        label="Range by legs"
        value={range}
        onchange={pickRange}
        items={[
          { id: 'legs20', label: 'Last 20 legs' },
          { id: 'legs50', label: 'Last 50 legs' },
          { id: 'legs100', label: 'Last 100 legs' },
        ]}
      />
      <SegmentedControl
        label="Show as"
        size="sm"
        value={view}
        onchange={pickView}
        items={[
          { id: 'list', label: 'List' },
          { id: 'board', label: 'Board' },
        ]}
      />
    </div>

    <h2 class="text-[18px] font-semibold">Stat tiles</h2>
    <TileGrid>
      <StatTile
        label="3-dart average"
        value="68.4"
        trend={trendOf(68.4, 65.3, 'decimal', 'higher')}
        sub="65.3 the 50 legs before"
        spark={series(50, 66, 6, 4)}
      />
      <StatTile
        label="Darts per leg"
        value="19.8"
        trend={trendOf(19.8, 20.7, 'decimal', 'lower')}
        sub="Legs you won · fewer is better"
        spark={series(50, 20, 3, -2)}
      />
      <StatTile
        label="Checkout rate"
        value="36%"
        trend={trendOf(0.36, 0.38, 'pts', 'higher')}
        sub="41 of 114 darts at a double"
        spark={series(50, 36, 8, -4)}
      />
      <StatTile label="180s" value="4" trend={trendOf(4, 2, 'count', 'higher')} sub="1 every 12.5 legs">
        <a href="#/dev/stats" class="text-[13px] font-semibold text-accent no-underline">View all ›</a>
      </StatTile>
      <StatTile label="Legs won" value="31" unit="of 50" sub="No range before to compare with" />
    </TileGrid>

    <h2 class="text-[18px] font-semibold">Charts</h2>
    <ChartCard title="Average per leg" note="Bars are legs (darker = lost), line is the 10-leg trend">
      {#snippet aside()}
        <ChartLegend
          items={[
            { label: 'Won', mark: 'box', tone: 'won' },
            { label: 'Lost', mark: 'box', tone: 'lost' },
            { label: '10-leg trend', mark: 'line', tone: 'accent' },
            { label: 'Before', mark: 'dash', tone: 'muted' },
          ]}
        />
      {/snippet}
      <TrendBarsChart
        label="3-dart average per leg, last 50 legs"
        bars={LEG_AVERAGES.map((a, i) => ({
          value: a,
          trend: trend[i],
          tone: LEGS_WON[i] ? 'won' : 'lost',
          describe: `Leg ${i + 1}: ${dec1(a)} average, ${LEGS_WON[i] ? 'won' : 'lost'}`,
        }))}
        highlight={{ index: best, label: `13-darter · ${dec1(LEG_AVERAGES[best])}` }}
        reference={{ value: 65.3, label: '50 legs before · avg 65.3' }}
        startLabel="50 legs ago"
        endLabel="latest"
      />
    </ChartCard>
    <div class="grid gap-3 lg:grid-cols-2">
      <ChartCard title="What your visits score" note="Share of visits, now vs before">
        <ColumnChart
          label="Share of visits per score range"
          categories={BUCKETS}
          format={pct}
          series={[
            { key: 'now', label: 'Last 50 legs', tone: 'accent', values: BUCKETS_NOW },
            { key: 'before', label: 'Before', tone: 'lost', values: BUCKETS_BEFORE },
          ]}
        />
        <ChartLegend
          items={[
            { label: 'Last 50 legs', mark: 'box', tone: 'accent' },
            { label: 'Before', mark: 'box', tone: 'lost' },
          ]}
        />
      </ChartCard>
      <ChartCard title="Average by visit" note="Average score for each visit in a leg">
        <LineChart
          label="Average score of each visit in a leg"
          steps={[1, 2, 3, 4, 5, 6, 7]}
          format={dec1}
          stepLabel={n => `Visit ${n}`}
          band={{ from: 1, to: 3, label: 'First 9' }}
          series={[
            { key: 'now', label: 'Last 50 legs', tone: 'accent', values: BY_VISIT_NOW },
            { key: 'before', label: 'Before', tone: 'muted', values: BY_VISIT_BEFORE },
          ]}
        />
      </ChartCard>
    </div>

    <h2 class="text-[18px] font-semibold">Lists and the board</h2>
    <div class="grid gap-3 lg:grid-cols-3">
      <ChartCard title="Your doubles" note="Hit rate when going for the double">
        {#snippet aside()}
          <SegmentedControl
            label="Show doubles as"
            size="sm"
            value={view}
            onchange={pickView}
            items={[
              { id: 'list', label: 'List' },
              { id: 'board', label: 'Board' },
            ]}
          />
        {/snippet}
        {#if view === 'list'}<BarList label="Your doubles" items={doubles} />{:else}<DoubleRing rates={DOUBLES} />{/if}
      </ChartCard>
      <ChartCard title="Double ring" note="The board view on its own">
        <DoubleRing rates={DOUBLES} />
      </ChartCard>
      <ChartCard title="Top checkouts" note="Tap one to open the game">
        <div class="flex flex-col">
          <LinkRow href="#/dev/stats" sub="501 · vs Lena · 12 Oct · leg 3" tag="TON+"
            >{#snippet title()}124 <span class="font-normal text-text-muted">· T20 T16 D8</span>{/snippet}</LinkRow
          >
          <LinkRow href="#/dev/stats" sub="Ranked 501 · vs Anna K. · 2 Oct" value="13 darts">{#snippet title()}Best leg{/snippet}</LinkRow>
          <LinkRow href="#/dev/stats" sub="Solo practice · 17 Oct">{#snippet title()}Visit 3 of leg 5{/snippet}</LinkRow>
        </div>
      </ChartCard>
    </div>

    <h2 class="text-[18px] font-semibold">States</h2>
    <StatsState kind="loading" />
    <div class="grid gap-6 lg:grid-cols-2">
      <StatsState kind="empty" title="No stats yet" text="Finish an X01 game and your averages, scoring and checkouts show up here." />
      <StatsState kind="error" onretry={() => undefined} />
    </div>
  </main>
</Layout>
