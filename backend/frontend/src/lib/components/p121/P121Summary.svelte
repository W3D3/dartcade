<!--
  121's session summary (P121-Summary): in place of the win screen when a game ends, and as the
  121 section of the Match details page (without the buttons). With 2 or more players, a
  standings strip and a picker for whose session to see. Without the saved detail (loading, or a
  spectator, who can't read it) only the standings show.
-->
<script lang="ts">
  import type { P121Detail } from '$lib/api'
  import { Button } from '$lib/components/ui/button/index.js'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import P121TriesChart from '$lib/components/p121/P121TriesChart.svelte'
  import { dayMonth, ordinal, plural } from '$lib/fmt'
  import { bestStat } from '$lib/p121/best'
  import { bestRunLine, summaryData, type P121Standing } from '$lib/p121/summary'

  type Action = { label: string; onclick: () => void }
  let {
    detail,
    players,
    seat,
    missRule,
    startTarget,
    standings,
    loading = false,
    yourBest = false,
    primary = null,
    secondary = null,
  }: {
    detail: P121Detail | null
    players: { name: string }[]
    /** Whose summary shows first: the viewer's seat. */
    seat: number
    missRule: 'reset' | 'down' | 'stay'
    startTarget: number
    standings: P121Standing[]
    /** The detail is on its way (a player's screen); false for a spectator, who never gets it. */
    loading?: boolean
    /** Say it's the viewer's own best (the details page, where another player's summary may show). */
    yourBest?: boolean
    primary?: Action | null
    secondary?: Action | null
  } = $props()

  const best = bestStat('p121', 'highestMade')
  // Fresh for each screen: this game may have just raised it
  void best.refresh()

  // svelte-ignore state_referenced_locally
  let picked = $state(seat)
  const data = $derived(detail?.seats[picked] ? summaryData(detail, picked) : null)
  const missLabel = $derived(missRule === 'reset' ? `Missed · back to ${startTarget}` : 'Missed')
  const label = 'text-[12px] font-semibold label-caps text-text-dim'
  const card = 'box-border px-[22px] py-5 rounded-2xl border border-line bg-surface-1 flex flex-col gap-3'
  const maxCount = $derived(Math.max(1, ...(data?.dartsPerCheckout.map(d => d.count) ?? [])))
  const tiles = $derived(
    data
      ? [
          { k: 'Checkouts', v: `${data.checkouts.made}/${data.checkouts.tries}`, unit: `${data.checkouts.pct}%`, accent: true },
          { k: 'Highest made', v: String(data.highestMade ?? '–'), unit: '', accent: false },
          {
            k: 'Avg darts',
            v: data.avgDarts === null ? '–' : data.avgDarts.toFixed(1),
            unit: data.avgDarts === null ? '' : 'per checkout',
            accent: false,
          },
          {
            k: 'Fastest',
            v: String(data.fastest?.darts ?? '–'),
            unit: data.fastest ? `darts · ${data.fastest.target}` : '',
            accent: false,
          },
        ]
      : [],
  )
</script>

<main class="flex-grow min-h-0 overflow-y-auto scrollbar-themed box-border p-4 md:p-7 flex flex-col gap-[18px]">
  {#if players.length > 1 || !detail}
    <ol aria-label="Standings" class="m-0 p-0 list-none flex flex-wrap gap-2">
      {#each standings as s, i (i)}
        <li
          class="flex items-center gap-3 px-4 h-12 rounded-xl border {s.placement === 1
            ? 'border-accent-line-strong bg-surface-active'
            : 'border-line bg-surface-1'}"
        >
          <span class="font-display font-bold text-[20px] {s.placement === 1 ? 'text-accent' : 'text-text-dim'}"
            >{ordinal(s.placement)}</span
          >
          <span class="text-[15px] font-semibold">{s.name}</span>
          <span class="font-mono text-[13px] text-text-muted">{s.highestMade ?? '–'}</span>
        </li>
      {/each}
    </ol>
    {#if detail}
      <SegmentedControl
        class="self-start w-full max-w-[480px]"
        options={players.map((p, i) => ({ value: i, label: p.name || `Player ${i + 1}` }))}
        bind:value={picked}
      />
    {/if}
  {/if}

  {#if data}
    <div class="flex flex-col xl:flex-row gap-6 min-w-0">
      <div class="flex-grow min-w-0 flex flex-col gap-[18px]">
        <div class="flex flex-col gap-[6px]">
          <span class="text-[12px] font-semibold label-caps text-accent"
            >Session complete · {plural(data.checkouts.tries, 'try', 'tries')}</span
          >
          <h1 class="m-0 font-display font-bold uppercase text-[44px] md:text-[64px] leading-[0.95]">Reached {data.reached}</h1>
          <span class="text-[15px] md:text-[16px] text-text-muted">{bestRunLine(data, missRule, startTarget)}</span>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-[14px]">
          {#each tiles as t (t.k)}
            <div class="box-border px-5 py-[18px] rounded-[14px] border border-line bg-surface-1 flex flex-col gap-[6px] min-w-0">
              <span class={label}>{t.k}</span>
              <span class="flex flex-wrap items-baseline gap-x-2">
                <span class="font-display font-bold text-[40px] md:text-[56px] leading-none {t.accent ? 'text-accent' : ''}">{t.v}</span>
                {#if t.unit}<span class="text-[14px] text-text-dim">{t.unit}</span>{/if}
              </span>
            </div>
          {/each}
        </div>
        {#if data.tries.length > 0}<P121TriesChart tries={data.tries} {missLabel} />{/if}
      </div>

      <aside class="xl:w-[400px] shrink-0 flex flex-col gap-4">
        {#if data.doubles.length > 0}
          <section aria-label="Finishing doubles" class={card}>
            <h2 class="m-0 {label}">Finishing doubles</h2>
            {#each data.doubles as d (d.label)}
              <div class="grid grid-cols-[54px_1fr_54px] items-center gap-3">
                <span class="font-display font-bold text-[22px]">{d.label}</span>
                <span class="h-[10px] rounded-[5px] bg-surface-paused overflow-hidden"
                  ><span class="block h-full bg-accent" style:width="{d.attempts ? Math.round((d.hits / d.attempts) * 100) : 0}%"
                  ></span></span
                >
                <span class="font-mono text-[13px] text-text-muted text-right">{d.hits}/{d.attempts}</span>
              </div>
            {/each}
          </section>
        {/if}
        {#if data.dartsPerCheckout.length > 0}
          <section aria-label="Darts per checkout" class={card}>
            <h2 class="m-0 {label}">Darts per checkout</h2>
            <div class="flex items-end gap-2 h-[110px]">
              {#each data.dartsPerCheckout as d (d.darts)}
                <div class="flex flex-col items-center gap-[6px] flex-1">
                  <span class="font-mono text-[12px] text-text-muted">{d.count || ''}</span>
                  <span
                    class="w-full rounded-t-[6px] {d.count ? 'bg-accent' : 'bg-surface-paused'}"
                    style:height="{d.count ? Math.round((d.count / maxCount) * 68) : 4}px"
                  ></span>
                  <span class="font-mono text-[12px] text-text-dim">{d.darts}</span>
                </div>
              {/each}
            </div>
          </section>
        {/if}
        {#if $best}
          <div class="px-[18px] py-[14px] rounded-xl bg-surface-active flex items-center justify-between">
            <span class="text-[14px] text-ink-2">{yourBest ? 'Your highest target ever' : 'Highest target ever'}</span>
            <span class="font-display font-bold text-[28px]"
              >{$best.value}
              <span class="font-sans font-normal text-[13px] text-text-dim">· {dayMonth(new Date($best.finishedAt))}</span></span
            >
          </div>
        {/if}
        {@render buttons()}
      </aside>
    </div>
  {:else}
    {#if loading}<p class="m-0 text-[15px] text-text-muted">Loading the summary…</p>{/if}
    {@render buttons()}
  {/if}
</main>

{#snippet buttons()}
  {#if primary}
    <div class="xl:mt-auto flex gap-[10px]">
      {#if secondary}
        <Button variant="outline" size="xl" class="flex-1 text-[16px] font-semibold border-line-strong" onclick={secondary.onclick}
          >{secondary.label}</Button
        >
      {/if}
      <Button size="xl" class="flex-[1.4]" onclick={primary.onclick}>{primary.label}</Button>
    </div>
  {/if}
{/snippet}
