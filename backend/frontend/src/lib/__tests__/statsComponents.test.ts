import { describe, expect, it, vi } from 'vitest'
import { render } from 'svelte/server'
import StatTile from '../components/stats/StatTile.svelte'
import SegmentedControl from '../components/stats/SegmentedControl.svelte'
import BarList from '../components/stats/BarList.svelte'
import StatsState from '../components/stats/StatsState.svelte'
import ColumnChart from '../components/stats/ColumnChart.svelte'
import LineChart from '../components/stats/LineChart.svelte'
import TrendBarsChart from '../components/stats/TrendBarsChart.svelte'
import DoubleRing from '../components/stats/DoubleRing.svelte'
import { trendOf, pct, dec1 } from '$lib/stats/trend'
import { BUCKETS, BUCKETS_BEFORE, BUCKETS_NOW, BY_VISIT_BEFORE, BY_VISIT_NOW, DOUBLES } from '$lib/stats/fixtures'

describe('StatTile', () => {
  it('shows the number, its unit and the arrow, and says the arrow in words', () => {
    const out = render(StatTile, {
      props: { label: 'Legs won', value: '31', unit: 'of 50', trend: trendOf(0.62, 0.56, 'pts', 'higher') },
    }).body
    expect(out).toContain('>31<')
    expect(out).toContain('of 50')
    expect(out).toContain('▲ 6 pts')
    expect(out).toContain('aria-label="Better than before: 6 pts"')
  })

  it('has no arrow without an earlier value', () => {
    expect(render(StatTile, { props: { label: '180s', value: '4' } }).body).not.toContain('▲')
  })
})

describe('SegmentedControl', () => {
  const items = [
    { id: 'a', label: 'Last 20 legs', href: '#/stats?range=a' },
    { id: 'b', label: 'Last 50 legs', href: '#/stats' },
  ]

  it('marks the current link', () => {
    const out = render(SegmentedControl, { props: { label: 'Range', items, value: 'b' } }).body
    expect(out).toMatch(/<a href="#\/stats" aria-current="true"[^>]*>Last 50 legs/)
    expect(out).not.toMatch(/aria-current="true"[^>]*>Last 20 legs/)
  })

  it('is a set of pressed buttons without links', () => {
    const out = render(SegmentedControl, {
      props: { label: 'Show as', items: items.map(({ id, label }) => ({ id, label })), value: 'a' },
    }).body
    expect(out).toMatch(/aria-pressed="true"[^>]*>Last 20 legs/)
    expect(out).toMatch(/aria-pressed="false"[^>]*>Last 50 legs/)
  })
})

describe('BarList', () => {
  it('fills each bar to its share, never below a sliver', () => {
    const out = render(BarList, {
      props: {
        label: 'Doubles',
        items: [
          { key: 'd20', name: 'D20', fill: 0.87, value: '52%', detail: '13 / 25', bright: true },
          { key: 'd1', name: 'D1', fill: 0, value: '0%' },
        ],
      },
    }).body
    expect(out).toContain('width: 87%')
    expect(out).toContain('width: 2%')
    expect(out).toContain('13 / 25')
  })
})

describe('StatsState', () => {
  it('shows a busy skeleton while loading', () => {
    expect(render(StatsState, { props: { kind: 'loading' } }).body).toContain('aria-busy="true"')
  })

  it('offers a retry only when it can retry', () => {
    const error = render(StatsState, { props: { kind: 'error', onretry: vi.fn() } }).body
    expect(error).toContain('role="alert"')
    expect(error).toContain('Try again')
    expect(render(StatsState, { props: { kind: 'error' } }).body).not.toContain('Try again')
  })

  it('names what is missing when there is nothing yet', () => {
    expect(render(StatsState, { props: { kind: 'empty', title: 'No stats yet', text: 'Play X01' } }).body).toContain('No stats yet')
  })
})

describe('charts', () => {
  it('draws columns for each series and writes the first one’s values', () => {
    const out = render(ColumnChart, {
      props: {
        label: 'Share of visits',
        categories: BUCKETS,
        format: pct,
        series: [
          { key: 'now', label: 'Now', tone: 'accent', values: BUCKETS_NOW },
          { key: 'before', label: 'Before', tone: 'lost', values: BUCKETS_BEFORE },
        ],
      },
    }).body
    expect(out).toContain('aria-label="Share of visits"')
    expect(out).toContain('<svg')
  })

  it('draws the lines of a line chart', () => {
    const out = render(LineChart, {
      props: {
        label: 'Average by visit',
        steps: [1, 2, 3, 4, 5, 6, 7],
        format: dec1,
        band: { from: 1, to: 3, label: 'First 9' },
        series: [
          { key: 'now', label: 'Now', tone: 'accent', values: BY_VISIT_NOW },
          { key: 'before', label: 'Before', tone: 'muted', values: BY_VISIT_BEFORE },
        ],
      },
    }).body
    expect(out).toContain('aria-label="Average by visit"')
    expect(out).toContain('<path')
  })

  it('draws bars and their trend', () => {
    const bars = [60, 70, 80].map((value, i) => ({ value, trend: value, tone: 'won' as const, describe: `Leg ${i + 1}` }))
    const out = render(TrendBarsChart, { props: { label: 'Average per leg', bars, startLabel: '3 legs ago', endLabel: 'latest' } }).body
    expect(out).toContain('aria-label="Average per leg"')
    expect(out).toContain('<svg')
  })

  it('names every double thrown at on the board, for screen readers', () => {
    const out = render(DoubleRing, { props: { rates: DOUBLES } }).body
    expect(out).toContain('D20 52%')
    expect(out).toContain('Bull 17%')
    expect(render(DoubleRing, { props: { rates: new Map() } }).body).toContain('No doubles thrown at yet')
  })
})
