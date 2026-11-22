<!--
  Catch 40's session summary: the shared practice summary shell with the total, the per-target list
  and the viewer's best total.
-->
<script lang="ts">
  import type { Catch40Detail } from '$lib/api'
  import type { Snippet } from 'svelte'
  import PracticeSummary from '$lib/components/practice/PracticeSummary.svelte'
  import type { PracticeSummaryBase } from '$lib/components/practice/types'
  import { pointsLabel } from '$lib/catch40/view'
  import { summaryData, type Catch40Standing } from '$lib/catch40/summary'
  import { dayMonth } from '$lib/fmt'
  import { bestStat } from '$lib/p121/best'

  let {
    detail,
    standings,
    yourBest = false,
    ...rest
  }: {
    detail: Catch40Detail | null
    standings: Catch40Standing[]
    /** Say it's the viewer's own best (the details page, where another player's summary may show). */
    yourBest?: boolean
  } & PracticeSummaryBase = $props()

  const best = bestStat('catch40', 'total')
  // Fresh for each screen: this game may have just raised it
  void best.refresh()

  // svelte-ignore state_referenced_locally
  let picked = $state(rest.seat)
  const data = $derived(detail?.seats[picked] ? summaryData(detail, picked) : null)
  const label = 'text-caption font-semibold label-caps text-text-dim'
  const card = 'box-border px-[22px] py-5 rounded-2xl border border-line bg-surface-1 flex flex-col gap-3'
</script>

<PracticeSummary
  bind:picked
  {...rest}
  standings={standings.map(s => ({ name: s.name, placement: s.placement, value: String(s.total) }))}
  ready={data !== null}
>
  {#snippet children(buttons: Snippet)}
    {#if data}
      {@const tiles = [
        { k: 'Checkouts', v: `${data.checkouts.made}/${data.checkouts.of}`, unit: '', accent: true },
        {
          k: 'Avg darts',
          v: data.avgDarts === null ? '–' : data.avgDarts.toFixed(1),
          unit: data.avgDarts === null ? '' : 'per checkout',
          accent: false,
        },
      ]}
      <div class="flex flex-col xl:flex-row gap-6 min-w-0">
        <div class="grow min-w-0 flex flex-col gap-[18px]">
          <div class="flex flex-col gap-[6px]">
            <span class="text-caption font-semibold label-caps text-accent">Session complete · {data.tries.length} targets</span>
            <h1 class="type-page-title font-bold md:text-page-title leading-[0.95]">{data.total} of 120 points</h1>
          </div>
          <div class="grid grid-cols-2 gap-[14px]">
            {#each tiles as t (t.k)}
              <div class="box-border px-5 py-[18px] rounded-card border border-line bg-surface-1 flex flex-col gap-[6px] min-w-0">
                <span class={label}>{t.k}</span>
                <span class="flex flex-wrap items-baseline gap-x-2">
                  <span class="type-checkout font-bold md:text-page-title leading-none {t.accent ? 'text-accent' : ''}">{t.v}</span>
                  {#if t.unit}<span class="text-label text-text-dim">{t.unit}</span>{/if}
                </span>
              </div>
            {/each}
          </div>
          <section aria-label="Every target" class={card}>
            <h2 class={label}>Every target</h2>
            <ol class="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              {#each data.tries as t (t.target)}
                <li class="grid grid-cols-[48px_1fr_auto] items-center gap-3 min-h-[38px] border-b border-line">
                  <span class="font-display font-bold text-player-name leading-none">{t.target}</span>
                  <span class="text-small text-text-muted">{t.finish ? `${t.finish} · ${t.darts} darts` : 'missed'}</span>
                  <span class="font-mono text-small {t.points > 0 ? 'text-accent' : 'text-text-dim'}">{pointsLabel(t.points)}</span>
                </li>
              {/each}
            </ol>
          </section>
        </div>

        <aside class="xl:w-[400px] shrink-0 flex flex-col gap-4">
          <section aria-label="Points per target" class={card}>
            <h2 class={label}>Targets by points</h2>
            {#each data.byPoints as b (b.points)}
              <div class="grid grid-cols-[54px_1fr] items-center gap-3">
                <span class="font-display font-bold text-player-name">{b.points}</span>
                <span class="h-[10px] rounded-[5px] bg-surface-paused overflow-hidden"
                  ><span
                    class="block h-full bg-accent"
                    style:width="{data.tries.length ? Math.round((b.count / data.tries.length) * 100) : 0}%"
                  ></span></span
                >
              </div>
            {/each}
          </section>
          {#if $best}
            <div class="px-[18px] py-[14px] rounded-xl bg-surface-active flex items-center justify-between">
              <span class="text-label text-ink-2">{yourBest ? 'Your best total ever' : 'Best total ever'}</span>
              <span class="font-display font-bold text-wordmark"
                >{$best.value}
                <span class="font-sans font-normal text-small text-text-dim">· {dayMonth(new Date($best.finishedAt))}</span></span
              >
            </div>
          {/if}
          {@render buttons()}
        </aside>
      </div>
    {/if}
  {/snippet}
</PracticeSummary>
