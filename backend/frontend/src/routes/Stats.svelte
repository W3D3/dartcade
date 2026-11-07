<script lang="ts">
  // The Stats page (Stats.dc.html): your X01 numbers over a range of legs or days, each compared with
  // the same range before. The range and filters live in the querystring (#/stats?range=days30&kind=ranked)
  // so Back, reload and a shared link keep them; the server picks the start score and out rule
  // you played most when none is asked for.
  import { querystring } from 'svelte-spa-router'
  import { Target } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import EmptyState from '$lib/components/lobby/EmptyState.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Chip } from '$lib/components/ui/chip'
  import { Select } from '$lib/components/ui/select'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import StatsOverview from '$lib/components/stats/StatsOverview.svelte'
  import StatsScoring from '$lib/components/stats/StatsScoring.svelte'
  import StatsCheckout from '$lib/components/stats/StatsCheckout.svelte'
  import { api, type StatsRange, type X01Stats } from '$lib/api'
  import type { operations } from '$lib/api/schema'
  import { flag, flagsLoaded } from '$lib/flags'
  import { createRequestGuard } from '$lib/requestGuard'
  import { paramUrl, readParam, setParam } from '$lib/urlState'
  import { plural } from '$lib/fmt'
  import { DAY_RANGES, KINDS, KIND_IDS, LEG_RANGES, OUT_IDS, OUT_LABELS, RANGE_IDS, compareNote } from '$lib/stats/view'

  const enabled = flag('stats.enabled')
  const requests = createRequestGuard()

  const range = $derived(readParam($querystring, 'range', RANGE_IDS, 'legs50'))
  const kind = $derived(readParam($querystring, 'kind', KIND_IDS, 'all'))
  const out = $derived(readParam($querystring, 'out', OUT_IDS, undefined))
  const start = $derived.by(() => {
    const n = Number(new URLSearchParams($querystring ?? '').get('start'))
    return Number.isInteger(n) && n >= 2 ? n : undefined
  })

  let stats = $state<X01Stats | null>(null)
  let error = $state('')

  async function load(query: operations['getX01Stats']['parameters']['query']) {
    const token = requests.start()
    error = ''
    const { data } = await api.GET('/api/stats/x01', { params: { query } }).catch(() => ({ data: undefined }))
    if (!requests.isCurrent(token)) return
    if (data) stats = data
    else error = "Couldn't load your stats"
  }

  $effect(() => {
    if ($enabled) void load({ range, kind, out, start })
  })

  const param = (key: string, value: string | null) => setParam('/stats', $querystring, key, value)
  const pickStart = (v: string) => param('start', v)
  const pickKind = (v: string) => param('kind', v === 'all' ? null : v)
  const pickOut = (v: string) => param('out', v)
  const rangeHref = (id: StatsRange) => '#' + paramUrl('/stats', $querystring, 'range', id === 'legs50' ? null : id)
  const note = $derived(stats && compareNote(stats.applied.range, stats.before))
  const empty = $derived(stats !== null && stats.totalLegs === 0 && stats.options.starts.length === 0)

  const SECTIONS = [
    { id: 'stats-overview', label: 'Overview' },
    { id: 'stats-scoring', label: 'Scoring' },
    { id: 'stats-checkout', label: 'Checkout' },
  ]
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const CHIP = 'h-8 min-w-0 rounded-full border-line-2 px-3 text-[13px] text-ink-2'
</script>

{#snippet seg(items: { id: StatsRange; label: string }[], label: string)}
  <div role="group" aria-label={label} class="flex rounded-[10px] border border-line bg-surface-panel p-[3px]">
    {#each items as r (r.id)}
      <a
        href={rangeHref(r.id)}
        aria-current={r.id === range ? 'true' : undefined}
        class="whitespace-nowrap rounded-[7px] px-3 py-[7px] text-[13px] no-underline {r.id === range
          ? 'bg-line font-semibold text-text'
          : 'text-text-muted hover:text-text'}">{r.label}</a
      >
    {/each}
  </div>
{/snippet}

<Layout title="Stats">
  <main class="flex min-h-0 flex-grow flex-col gap-4 overflow-y-auto px-4 py-4 md:px-8 md:py-10 xl:px-11">
    <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div class="flex flex-col gap-1.5">
        <h1 class="m-0 hidden font-display text-[48px] font-bold uppercase leading-none tracking-[0.02em] md:block">Stats</h1>
        <p class="m-0 text-[15px] text-text-muted">How you’ve been playing, and whether it’s getting better.</p>
      </div>
      {#if $enabled}
        <div class="flex flex-col items-start gap-2 md:items-end">
          <div class="flex flex-wrap gap-2">
            {@render seg(LEG_RANGES, 'Range by legs')}
            {@render seg(DAY_RANGES, 'Range by time')}
          </div>
          {#if note}<span class="text-[12px] text-text-dim">{note}</span>{/if}
        </div>
      {/if}
    </header>

    {#if !$enabled && !$flagsLoaded}
      <Skeleton class="h-40 w-full" />
    {:else if !$enabled}
      <p class="m-0 text-[15px] text-text-muted">Stats aren't available yet.</p>
    {:else if error}
      <ErrorText class="text-[15px]">{error}</ErrorText>
    {:else if !stats}
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-busy="true">
        {#each { length: 5 } as _, i (i)}<Skeleton class="h-[132px] rounded-[14px]" />{/each}
      </div>
      <Skeleton class="h-[280px] w-full rounded-[14px]" />
    {:else if empty}
      <EmptyState title="No stats yet" text="Finish an X01 game and your averages, scoring and checkouts show up here.">
        {#snippet icon()}<Target size={24} />{/snippet}
        {#snippet actions()}<a class="underline" href="#/play">Play</a>{/snippet}
      </EmptyState>
    {:else}
      <div class="flex flex-wrap items-end gap-x-5 gap-y-2 border-b border-surface-paused">
        <span aria-current="page" class="-mb-px border-b-[3px] border-accent px-0.5 pb-2.5 font-display text-[24px] font-bold text-text"
          >X01 <span class="text-[14px] text-text-muted">{plural(stats.totalLegs, 'leg')}</span></span
        >
        <span class="pb-3 font-display text-[20px] font-bold text-pip-dim">More game modes soon</span>
        <div class="flex flex-wrap gap-2 pb-2.5 md:ml-auto">
          <Select
            label="Start score"
            class={CHIP}
            value={String(stats.applied.start)}
            options={stats.options.starts.map(s => ({ value: String(s), label: String(s) }))}
            onchange={pickStart}
          />
          <Select label="Matches" class={CHIP} value={stats.applied.kind} options={KINDS} onchange={pickKind} />
          <Select
            label="Out rule"
            class={CHIP}
            value={stats.applied.out ?? 'double'}
            options={stats.options.outModes.map(o => ({ value: o, label: OUT_LABELS[o] }))}
            onchange={pickOut}
          />
        </div>
      </div>
      <nav aria-label="Sections" class="flex gap-1.5">
        {#each SECTIONS as s (s.id)}<Chip variant="plain" onclick={() => jump(s.id)}>{s.label}</Chip>{/each}
      </nav>
      {#if stats.window.legs === 0}
        <p class="m-0 text-[15px] text-text-muted">No legs in this range with these filters. Try a longer range or another filter.</p>
      {:else}
        <StatsOverview {stats} />
        <StatsScoring {stats} />
        <StatsCheckout {stats} />
      {/if}
    {/if}
  </main>
</Layout>
