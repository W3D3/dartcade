<script lang="ts">
  // Checkout (Stats.dc.html): from 170 down to the double. Your doubles as a list or on the board,
  // how often each range finishes, and your highest checkouts.
  import type { X01Stats } from '$lib/api'
  import { visitTier } from '$shared/darts.js'
  import { dayMonth } from '$lib/fmt'
  import { dec1, pct, trendOf } from '$lib/stats/trend'
  import { doubleTotals, refHref, refLine } from '$lib/stats/view'
  import BarList from './BarList.svelte'
  import ChartCard from './ChartCard.svelte'
  import DoubleRing from './DoubleRing.svelte'
  import LinkRow from './LinkRow.svelte'
  import SegmentedControl from './SegmentedControl.svelte'
  import StatTile from './StatTile.svelte'
  import StatsSection from './StatsSection.svelte'
  import TileGrid from './TileGrid.svelte'

  let { stats }: { stats: X01Stats } = $props()
  const c = $derived(stats.checkout)
  const rate = $derived(stats.overview.checkout)
  const high = $derived(stats.overview.bests.highestCheckout)
  const totals = $derived(doubleTotals(c.doubles))
  const SHOWN_DOUBLES = 8
  // A full bar at 60%: a good double rate, so the bars spread out
  const FULL_RATE = 0.6
  let view = $state('list')
  const pickView = (id: string) => (view = id)

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
  /** The doubles by board number (25: the bull), for the board; other finishing darts (straight out) aren't on the ring. */
  const ring = $derived(
    new Map(
      c.doubles.flatMap(d => {
        const n = d.target === 'Bull' ? 25 : /^D(\d+)$/.exec(d.target) ? Number(d.target.slice(1)) : null
        return n === null ? [] : [[n, { hits: d.hits, attempts: d.attempts }] as const]
      }),
    ),
  )
  const topRate = $derived(Math.max(0, ...c.ranges.map(r => r.rate ?? 0)))
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

<StatsSection id="stats-checkout" title="Checkout" note="From 170 down to the double.">
  <TileGrid>
    <StatTile
      label="Checkout rate"
      value={pct(rate.value)}
      trend={trendOf(rate.value, rate.before, 'pts', 'higher')}
      sub="{totals.hits} of {totals.attempts} darts at a double"
    />
    <StatTile
      label="Highest checkout"
      value={high ? String(high.value) : '–'}
      sub={high ? `${(high.darts ?? []).join(' · ')} · ${dayMonth(new Date(high.ref.finishedAt))}` : 'None yet'}
    >
      {#if high}<a href={refHref(high.ref)} class="mt-0.5 text-[13px] font-semibold text-accent no-underline hover:text-accent-hover"
          >View game ›</a
        >{/if}
    </StatTile>
    <StatTile
      label="Ton+ checkouts"
      value={String(c.tonPlus.value)}
      trend={trendOf(c.tonPlus.value, c.tonPlus.before, 'count', 'higher')}
      sub="100 or more in one visit"
    />
    <StatTile
      label="Darts at double"
      value={dec1(c.dartsAtDouble.value)}
      unit="per leg won"
      trend={trendOf(c.dartsAtDouble.value, c.dartsAtDouble.before, 'decimal', 'lower')}
      sub="Fewer is better"
    />
    <StatTile
      label="Busts"
      value={String(c.busts.value)}
      trend={trendOf(c.busts.value, c.busts.before, 'count', 'lower')}
      sub="Scored too much on a finish"
    />
  </TileGrid>

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
      {#if c.doubles.length === 0}
        <p class="text-[13px] text-text-muted">No darts at a double yet.</p>
      {:else if view === 'list'}
        <BarList items={doubles} label="Your doubles" />
      {:else}
        <DoubleRing rates={ring} />
      {/if}
    </ChartCard>
    <ChartCard title="Checkout rate by range" note="Share of visits started on that score that finished">
      <BarList items={ranges} label="Checkout rate by range" />
    </ChartCard>
    <ChartCard title="Top checkouts" note="Tap one to open the game">
      <div class="flex flex-col">
        {#each c.top as t (`${t.ref.gameId}-${t.ref.leg}-${t.ref.visit}`)}
          <LinkRow href={refHref(t.ref)} sub={refLine(t.ref)} tag={visitTier(t.value) ? 'TON+' : undefined}>
            {#snippet title()}{t.value} <span class="font-normal text-text-muted">· {(t.darts ?? []).join(' ')}</span>{/snippet}
          </LinkRow>
        {:else}
          <p class="text-[13px] text-text-muted">No checkouts yet.</p>
        {/each}
      </div>
    </ChartCard>
  </div>
</StatsSection>
