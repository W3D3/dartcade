<script lang="ts">
  // Your doubles on the board (Stats.dc.html, Board view): the board drawn dim, each double (and the
  // bull) filled from grey at 0% to lime at 55% or more with its rate on it, the ones never thrown
  // at left dark. The double ring is drawn wider than a real board's so its colours and numbers read.
  // Each slice is a LayerChart Arc; the list view next to it says the same in text.
  import { Arc, Chart, Group, Text } from 'layerchart/svg'
  import type { ChartState } from 'layerchart'
  import { R } from '$shared/board'
  import { RING, polar, rateFill } from '$lib/stats/board'

  export type DoubleRate = { hits: number; attempts: number }
  let { rates }: { rates: Map<number, DoubleRate> } = $props()

  const DOUBLE_IN = 0.84
  const NUMBERS = 1.14
  const fill = (d: DoubleRate | undefined) =>
    d
      ? `color-mix(in srgb, var(--color-accent) ${Math.round(rateFill(d.hits / d.attempts) * 100)}%, var(--color-line-3))`
      : 'var(--color-surface-1)'
  const tried = $derived([...rates.entries()].filter(([, d]) => d.attempts > 0))
  const summary = $derived(
    tried.length === 0
      ? 'No doubles thrown at yet'
      : tried.map(([n, d]) => `${n === 25 ? 'Bull' : `D${n}`} ${Math.round((d.hits / d.attempts) * 100)}%`).join(', '),
  )
  const bull = $derived(rates.get(25))
</script>

<div class="flex flex-col items-center gap-2.5">
  <div class="aspect-square w-full max-w-[280px]">
    <Chart
      ssr
      class="block size-full "
      role="img"
      aria-label="Double hit rate on the board: {summary}"
      padding={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      {#snippet marks({ context }: { context: ChartState<unknown> })}
        {@const rb = Math.min(context.width, context.height) / 2 / 1.25}
        <Group center>
          <circle r={rb * 1.25} class="fill-bg-deep" />
          {#each RING as s, i (s.number)}
            {@const d = rates.get(s.number)}
            {@const single = i % 2 ? 'fill-surface-inset' : 'fill-surface-active'}
            {@const [nx, ny] = polar(rb * NUMBERS, s.mid)}
            {@const [px, py] = polar(rb * 0.92, s.mid)}
            <Arc startAngle={s.startAngle} endAngle={s.endAngle} innerRadius={rb * R.bull25} outerRadius={rb * R.si} class={single} />
            <Arc startAngle={s.startAngle} endAngle={s.endAngle} innerRadius={rb * R.si} outerRadius={rb * R.tr} class="fill-line" />
            <Arc startAngle={s.startAngle} endAngle={s.endAngle} innerRadius={rb * R.tr} outerRadius={rb * DOUBLE_IN} class={single} />
            <Arc
              startAngle={s.startAngle}
              endAngle={s.endAngle}
              innerRadius={rb * DOUBLE_IN}
              outerRadius={rb}
              style="fill: {fill(d)}"
              class="stroke-bg"
            />
            <Text
              x={nx}
              y={ny}
              value={String(s.number)}
              textAnchor="middle"
              verticalAnchor="middle"
              class="text-[12px] font-semibold {d ? 'fill-text' : 'fill-text-faint'}"
            />
            {#if d && d.hits / d.attempts >= 0.2}
              <Text
                x={px}
                y={py}
                value={String(Math.round((d.hits / d.attempts) * 100))}
                textAnchor="middle"
                verticalAnchor="middle"
                class="fill-accent-fg text-[9.5px] font-bold"
              />
            {/if}
          {/each}
          <circle r={rb * R.bull25} style="fill: {fill(bull)}" class="stroke-bg" />
        </Group>
      {/snippet}
    </Chart>
  </div>
  <div class="flex items-center gap-2 text-[11px] text-text-dim" aria-hidden="true">
    <span>0%</span>
    <span class="h-2 w-24 rounded-full bg-linear-to-r from-line-3 to-accent"></span>
    <span>55%+</span>
    <span class="ml-2 size-2.5 rounded-[3px] border border-line-2 bg-surface-1"></span>
    <span>not tried</span>
  </div>
</div>
