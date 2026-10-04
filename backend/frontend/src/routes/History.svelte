<script lang="ts">
  import { onMount } from 'svelte'
  import { LoaderCircle } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import { api, type GameInfo, type GameStats, type GameSummary } from '$lib/api'
  import { getGameView } from '$lib/gameViews'
  import { formatWhen, historyStat, playerBadges, resultLabel, rulesLine, statTiles } from '$lib/history'
  import { createRequestGuard } from '$lib/requestGuard'

  // Guards against a stale response winning a race: a quick filter switch leaves the
  // previous filter's request in flight, and "load more" can be overtaken by a filter
  // switch too. Only the most recently started request is allowed to apply its result.
  const requests = createRequestGuard()

  let modes = $state<GameInfo[]>([])
  let mode = $state<string | null>(null)
  let games = $state<GameSummary[]>([])
  let nextCursor = $state<string | null>(null)
  let stats = $state<GameStats | null>(null)
  let loading = $state(true)
  let loadingMore = $state(false)
  let error = $state('')
  let loadMoreError = $state('')
  const now = new Date()

  // The tiles follow the filter: overall numbers for All, that mode's own otherwise
  const tiles = $derived(stats ? statTiles(stats, mode, m => getGameView(m).shortTitle) : [])
  const tilesLabel = $derived(`${mode === null ? 'Your' : getGameView(mode).title} stats, last ${stats?.days ?? 30} days`)
  const filters = $derived([{ id: null, name: 'All' }, ...modes.map(m => ({ id: m.id, name: getGameView(m.id).title }))])

  async function loadGames(cursor: string | null, token: number) {
    const query = { ...(mode !== null && { mode }), ...(cursor !== null && { cursor }) }
    const { data, error: err } = await api.GET('/api/games', { params: { query } })
    if (!requests.isCurrent(token)) return // superseded by a newer filter or load-more; drop it
    if (!data) throw new Error(err.error)
    games = cursor === null ? data.games : [...games, ...data.games]
    nextCursor = data.nextCursor
  }

  async function pick(id: string | null) {
    if (id === mode) return
    mode = id
    const token = requests.start()
    loading = true
    loadingMore = false // any in-flight "load more" for the old filter no longer applies
    error = ''
    loadMoreError = ''
    try { await loadGames(null, token) }
    catch (e) { if (requests.isCurrent(token)) error = e instanceof Error ? e.message : 'Could not load your games' }
    finally { if (requests.isCurrent(token)) loading = false }
  }

  async function more() {
    if (nextCursor === null || loadingMore) return
    const token = requests.current()
    loadingMore = true
    loadMoreError = ''
    // Keep the already-loaded list on screen; only an initial load replaces it with an error.
    try { await loadGames(nextCursor, token) }
    catch (e) { if (requests.isCurrent(token)) loadMoreError = e instanceof Error ? e.message : 'Could not load more games' }
    finally { if (requests.isCurrent(token)) loadingMore = false }
  }

  onMount(async () => {
    const token = requests.start()
    try {
      const [m, s] = await Promise.all([api.GET('/api/gamemodes'), api.GET('/api/games/stats'), loadGames(null, token)])
      modes = m.data?.modes ?? []
      stats = s.data ?? null
    } catch (e) {
      if (requests.isCurrent(token)) error = e instanceof Error ? e.message : 'Could not load your games'
    } finally {
      if (requests.isCurrent(token)) loading = false
    }
  })
</script>

<!-- A player in throw order; your own badge is outlined in the accent colour -->
{#snippet badge(p: { n: number; name: string; me: boolean })}
  <span class="inline-flex h-[26px] items-center gap-[5px] whitespace-nowrap rounded-md border py-0 pl-[7px] pr-[9px] text-[13px] {p.me ? 'border-accent bg-[#2b3417] font-bold text-text' : 'border-line-2 bg-surface-inset font-medium text-[#c9c9bf]'}">
    <span class="font-mono text-[11px] {p.me ? 'font-medium text-accent' : 'text-text-dim'}">{p.n}</span>{p.name}
  </span>
{/snippet}

<Layout title="History">
  <main class="flex min-h-0 flex-grow flex-col gap-6 overflow-auto px-4 py-6 md:px-8 xl:px-11 md:py-10">
    <header class="flex flex-wrap items-end justify-between gap-6">
      <div class="hidden md:flex flex-col gap-1.5">
        <h1 class="m-0 font-display text-[48px] font-bold uppercase leading-none tracking-[0.02em]">History</h1>
        <p class="m-0 text-[15px] text-text-muted">Every match you played. Open one to see it leg by leg.</p>
      </div>
      <div role="group" aria-label="Game mode" class="grid max-w-full auto-cols-max grid-flow-col gap-1 overflow-x-auto rounded-[10px] border border-line bg-surface-1 p-1">
        {#each filters as f (f.id ?? 'all')}
          <button type="button" aria-pressed={f.id === mode} onclick={() => void pick(f.id)}
            class="h-10 whitespace-nowrap rounded-[7px] border-0 px-4 text-[15px] {f.id === mode ? 'bg-line font-semibold text-text' : 'bg-transparent text-[#c9c9bf]'}">
            {f.name}
          </button>
        {/each}
      </div>
    </header>

    {#if tiles.length}
      <!-- 1px gaps over the line colour draw the dividers, in the 2x2 and the single row alike -->
      <dl aria-label={tilesLabel} class="m-0 grid flex-shrink-0 grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line-2 bg-line-2 lg:grid-cols-4">
        {#each tiles as t (t.label)}
          <div class="flex flex-col gap-1.5 bg-surface-panel px-[22px] py-[18px]">
            <dt class="text-[12px] uppercase tracking-[0.1em] text-text-dim">{t.label}</dt>
            <dd class="m-0 flex items-baseline gap-2.5">
              <span class="font-display text-[40px] font-bold leading-none">{t.value}</span>
              {#if t.note}<span class="whitespace-nowrap text-[15px] {t.trend === 'up' ? 'text-accent' : 'text-text-muted'}">{t.note}</span>{/if}
            </dd>
          </div>
        {/each}
      </dl>
    {/if}

    <section aria-label="Matches" class="flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-line-2 bg-surface-panel">
      <!-- Desktops only: the column headings, and the Board column -->
      <div class="hidden h-11 items-center gap-4 border-b border-line-2 px-[22px] text-[12px] uppercase tracking-[0.1em] text-text-dim xl:grid xl:grid-cols-[132px_minmax(0,1fr)_220px_124px_132px_124px]">
        <span>When</span><span>Game</span><span>Players</span><span>Result</span><span>Key stat</span><span>Board</span>
      </div>

      {#if loading}
        <p class="m-0 flex items-center gap-2 px-[22px] py-10 text-[15px] text-text-muted"><LoaderCircle size={18} class="animate-spin" /> Loading matches…</p>
      {:else if error}
        <p role="alert" class="m-0 px-[22px] py-10 text-[15px] text-text-muted">{error}</p>
      {:else if games.length === 0}
        <p class="m-0 px-[22px] py-10 text-[15px] text-text-muted">No matches in this mode yet.</p>
      {:else}
        <ul class="m-0 list-none p-0">
          {#each games as g (g.id)}
            {@const when = formatWhen(g.finishedAt, now)}
            {@const result = resultLabel(g)}
            {@const key = historyStat(g)}
            {@const badges = playerBadges(g)}
            {@const rules = rulesLine(g)}
            <li class="border-b border-line px-[22px] py-3 lg:min-h-[68px] lg:py-0">
              <!-- Narrow screens: title+when / players+stat / rules, badge and stat at the end of each -->
              <div class="flex flex-col gap-1 lg:hidden">
                <div class="flex items-baseline justify-between gap-3">
                  <span class="flex min-w-0 items-baseline gap-2 overflow-hidden">
                    <span class="truncate font-display text-[20px] font-bold uppercase leading-none tracking-[0.02em]">{getGameView(g.mode).title}</span>
                    <span class="shrink-0 whitespace-nowrap text-[12px] text-text-dim">{when.day} · {when.time}</span>
                  </span>
                  <span class="shrink-0 inline-flex h-7 items-center rounded-full px-3 text-[13px] font-bold uppercase tracking-[0.06em] {result.won ? 'bg-accent text-accent-fg' : 'border border-line-strong text-[#c9c9bf]'}">{result.text}</span>
                </div>
                <div class="flex items-baseline justify-between gap-3">
                  <span class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">{#each badges as p (p.n)}{@render badge(p)}{/each}</span>
                  {#if key}
                    <span class="shrink-0 whitespace-nowrap text-[13px] text-text-muted"><span class="font-display text-[18px] font-bold text-text">{key.value}</span> {key.label}</span>
                  {/if}
                </div>
                {#if rules}<span class="truncate text-[13px] text-text-muted">{rules}</span>{/if}
              </div>

              <!-- lg and up: a column grid; tablets (up to xl) leave out the Board column -->
              <div class="hidden lg:grid lg:min-h-[68px] lg:grid-cols-[110px_minmax(0,1fr)_200px_110px_90px] xl:grid-cols-[132px_minmax(0,1fr)_220px_124px_132px_124px] lg:items-center lg:gap-4">
                <span class="flex flex-col gap-0.5">
                  <span class="text-[15px] font-semibold">{when.day}</span>
                  <span class="font-mono text-[12px] text-text-dim">{when.time}</span>
                </span>
                <span class="flex min-w-0 flex-col gap-0.5">
                  <span class="font-display text-[24px] font-bold uppercase leading-none tracking-[0.02em]">{getGameView(g.mode).title}</span>
                  <span class="text-[13px] text-text-muted">{rules}</span>
                </span>
                <span class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 py-2.5">
                  {#each badges as p (p.n)}{@render badge(p)}{/each}
                </span>
                <span>
                  <span class="inline-flex h-7 items-center rounded-full px-3 text-[13px] font-bold uppercase tracking-[0.06em] {result.won ? 'bg-accent text-accent-fg' : 'border border-line-strong text-[#c9c9bf]'}">{result.text}</span>
                </span>
                <span class="flex flex-col gap-0.5">
                  {#if key}
                    <span class="font-display text-[24px] font-bold leading-none">{key.value}</span>
                    <span class="text-[12px] text-text-dim">{key.label}</span>
                  {/if}
                </span>
                <span class="hidden xl:inline text-[14px] text-text-muted">{g.board?.name ?? '–'}</span>
              </div>
            </li>
          {/each}
        </ul>
        {#if nextCursor !== null}
          <div class="flex flex-col items-center gap-2 p-4">
            <button type="button" onclick={() => void more()} disabled={loadingMore}
              class="h-10 rounded-lg border border-line-strong bg-transparent px-5 text-[15px] text-text disabled:opacity-60">
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
            {#if loadMoreError}<p role="alert" class="m-0 text-[13px] text-text-muted">{loadMoreError}</p>{/if}
          </div>
        {/if}
      {/if}
    </section>
  </main>
</Layout>
