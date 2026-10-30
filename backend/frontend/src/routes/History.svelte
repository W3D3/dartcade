<script lang="ts">
  import { deviceStore } from '$lib/storage'
  import { onMount } from 'svelte'
  import { MediaQuery } from 'svelte/reactivity'
  import { ChevronRight, LoaderCircle, RotateCcw } from '@lucide/svelte'
  import { createColumnHelper, renderSnippet, type ColumnSizingState } from '@tanstack/svelte-table'
  import Layout from '$lib/components/Layout.svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import ProfilePopover from '$lib/components/progress/ProfilePopover.svelte'
  import { DataTable, type Features } from '$lib/components/ui/data-table/index.js'
  import { api, type GameInfo, type GameStats, type GameSummary } from '$lib/api'
  import { getGameView } from '$lib/gameViews'
  import {
    formatWhen,
    historyStat,
    loadColumnSizing,
    playerBadges,
    resultLabel,
    rulesLine,
    saveColumnSizing,
    statTiles,
    type PlayerBadge,
  } from '$lib/history'
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

  // Desktops: Game takes the width the others leave and truncates. Players fits three badges up
  // to 1440px and four from there, where the Board column joins. A column resized by dragging
  // keeps its width on this device until "Reset columns".
  const wide = new MediaQuery('min-width: 1440px')
  const storage = deviceStore()
  let columnSizing = $state<ColumnSizingState>(loadColumnSizing(storage))
  $effect(() => saveColumnSizing(storage, columnSizing))

  const helper = createColumnHelper<Features, GameSummary>()
  const columns = $derived(
    helper.columns([
      helper.display({ id: 'when', header: 'When', size: 110, minSize: 90, cell: c => renderSnippet(whenCell, c.row.original) }),
      helper.display({ id: 'game', header: 'Game', size: 160, cell: c => renderSnippet(gameCell, c.row.original) }),
      helper.display({
        id: 'players',
        header: 'Players',
        size: wide.current ? 430 : 320,
        minSize: 120,
        cell: c => renderSnippet(playersCell, c.row.original),
      }),
      helper.display({ id: 'result', header: 'Result', size: 124, minSize: 90, cell: c => renderSnippet(resultCell, c.row.original) }),
      helper.display({ id: 'stat', header: 'Key stat', size: 104, minSize: 80, cell: c => renderSnippet(statCell, c.row.original) }),
      helper.display({ id: 'board', header: 'Board', size: 132, minSize: 80, cell: c => renderSnippet(boardCell, c.row.original) }),
      helper.display({ id: 'open', header: '', size: 40, enableResizing: false, cell: () => renderSnippet(chevronCell) }),
    ]),
  )
  const rowLabel = (g: GameSummary) => {
    const when = formatWhen(g.finishedAt, now)
    const result = resultLabel(g)
    return `${getGameView(g.mode).title}, ${when.day} ${when.time}${result.text ? `, ${result.text}` : ''}: details`
  }

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
    try {
      await loadGames(null, token)
    } catch (e) {
      if (requests.isCurrent(token)) error = e instanceof Error ? e.message : 'Could not load your games'
    } finally {
      if (requests.isCurrent(token)) loading = false
    }
  }

  async function more() {
    if (nextCursor === null || loadingMore) return
    const token = requests.current()
    loadingMore = true
    loadMoreError = ''
    // Keep the already-loaded list on screen; only an initial load replaces it with an error.
    try {
      await loadGames(nextCursor, token)
    } catch (e) {
      if (requests.isCurrent(token)) loadMoreError = e instanceof Error ? e.message : 'Could not load more games'
    } finally {
      if (requests.isCurrent(token)) loadingMore = false
    }
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

<!-- A player in throw order, opening their profile; your own badge is outlined in the accent colour.
     pointer-events-auto: a badge with no profile card (progression off, a guest, a bot) takes its
     own click and does nothing, rather than letting it fall through to the row's link. -->
{#snippet badge(p: PlayerBadge)}
  <ProfilePopover userId={p.userId} name={p.name}>
    <span
      class="pointer-events-auto inline-flex max-w-full h-[28px] items-center gap-[5px] whitespace-nowrap rounded-full border py-0 pl-[5px] pr-[8px] text-[13px] lg:h-[30px] lg:gap-[6px] lg:pl-[7px] lg:pr-[10px] {p.me
        ? 'border-accent bg-accent-tint font-bold text-text'
        : 'border-line-2 bg-surface-inset font-medium text-ink-2'}"
    >
      <span class="font-mono text-[11px] {p.me ? 'font-medium text-accent' : 'text-text-dim'}">{p.n}</span>
      <Avatar name={p.name} face={p} guest={p.guest} bot={p.bot} class="size-[18px] text-[8px] lg:size-[22px] lg:text-[9px]" />
      <span class="min-w-0 truncate">{p.name}</span>
    </span>
  </ProfilePopover>
{/snippet}

<!-- Won (lime) or the placement -->
{#snippet resultPill(result: { text: string; won: boolean }, className = '')}
  <span
    class="{className} inline-flex h-7 items-center rounded-full px-3 text-[13px] font-bold uppercase tracking-[0.06em] {result.won
      ? 'bg-accent text-accent-fg'
      : 'border border-line-strong text-ink-2'}">{result.text}</span
  >
{/snippet}

<!-- A moderator invalidated the game: it stays in the list but doesn't count -->
{#snippet invalidatedPill(className = '')}
  <span
    title="A moderator invalidated this game. It does not count in your stats or ratings."
    class="{className} inline-flex h-7 items-center rounded-full bg-live-soft px-3 text-[13px] font-bold uppercase tracking-[0.06em] text-live-text"
    >Invalidated</span
  >
{/snippet}

{#snippet status(g: GameSummary, className = '')}
  {#if g.invalidated}{@render invalidatedPill(className)}{:else}{@render resultPill(resultLabel(g), className)}{/if}
{/snippet}

<!-- The desktop table's cells -->
{#snippet whenCell(g: GameSummary)}
  {@const when = formatWhen(g.finishedAt, now)}
  <span class="flex flex-col gap-0.5">
    <span class="truncate text-[15px] font-semibold">{when.day}</span>
    <span class="font-mono text-[12px] text-text-dim">{when.time}</span>
  </span>
{/snippet}

{#snippet gameCell(g: GameSummary)}
  {@const rules = rulesLine(g)}
  <span class="flex min-w-0 flex-col gap-0.5" title={rules || undefined}>
    <span class="truncate font-display text-[24px] font-bold uppercase leading-none tracking-[0.02em]">{getGameView(g.mode).title}</span>
    <span class="truncate text-[13px] text-text-muted">{rules}</span>
  </span>
{/snippet}

{#snippet playersCell(g: GameSummary)}
  <span class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
    {#each playerBadges(g) as p (p.n)}{@render badge(p)}{/each}
  </span>
{/snippet}

{#snippet resultCell(g: GameSummary)}
  {@render status(g)}
{/snippet}

{#snippet statCell(g: GameSummary)}
  {@const key = historyStat(g)}
  {#if key}
    <span class="flex flex-col gap-0.5">
      <span class="font-display text-[24px] font-bold leading-none">{key.value}</span>
      <span class="truncate text-[12px] text-text-dim">{key.label}</span>
    </span>
  {/if}
{/snippet}

{#snippet boardCell(g: GameSummary)}
  <span class="block truncate text-[14px] text-text-muted">{g.board?.name ?? '–'}</span>
{/snippet}

{#snippet chevronCell()}
  <ChevronRight size={18} class="text-text-dim" />
{/snippet}

<!-- Narrow screens: title+when / players+stat / rules, badge and stat at the end of each -->
{#snippet narrowRow(g: GameSummary)}
  {@const when = formatWhen(g.finishedAt, now)}
  {@const key = historyStat(g)}
  {@const rules = rulesLine(g)}
  <div class="flex flex-col gap-1 py-3 pl-4 pr-10 text-text">
    <div class="flex items-baseline justify-between gap-3">
      <span class="flex min-w-0 items-baseline gap-2 overflow-hidden">
        <span class="truncate font-display text-[20px] font-bold uppercase leading-none tracking-[0.02em]">{getGameView(g.mode).title}</span
        >
        <span class="shrink-0 whitespace-nowrap text-[12px] text-text-dim">{when.day} · {when.time}</span>
      </span>
      {@render status(g, 'shrink-0')}
    </div>
    <div class="flex items-baseline justify-between gap-3">
      <span class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1"
        >{#each playerBadges(g) as p (p.n)}{@render badge(p)}{/each}</span
      >
      {#if key}
        <span class="shrink-0 whitespace-nowrap text-[13px] text-text-muted"
          ><span class="font-display text-[18px] font-bold text-text">{key.value}</span> {key.label}</span
        >
      {/if}
    </div>
    {#if rules}<span class="truncate text-[13px] text-text-muted">{rules}</span>{/if}
    <ChevronRight size={18} class="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim" />
  </div>
{/snippet}

<Layout title="History">
  <main class="flex min-h-0 flex-grow flex-col gap-4 md:gap-6 overflow-auto px-4 py-4 md:px-8 xl:px-11 md:py-10">
    <header class="flex flex-wrap items-end justify-between gap-6">
      <div class="hidden md:flex flex-col gap-1.5">
        <h1 class="m-0 font-display text-[48px] font-bold uppercase leading-none tracking-[0.02em]">History</h1>
        <p class="m-0 text-[15px] text-text-muted">Every match you played. Open one to see it leg by leg.</p>
      </div>
      <div
        role="group"
        aria-label="Game mode"
        class="grid max-w-full auto-cols-max grid-flow-col gap-1 overflow-x-auto rounded-[10px] border border-line bg-surface-1 p-1"
      >
        {#each filters as f (f.id ?? 'all')}
          <button
            type="button"
            aria-pressed={f.id === mode}
            onclick={() => void pick(f.id)}
            class="h-10 whitespace-nowrap rounded-[7px] border-0 px-4 text-[15px] {f.id === mode
              ? 'bg-line font-semibold text-text'
              : 'bg-transparent text-ink-2'}"
          >
            {f.name}
          </button>
        {/each}
      </div>
    </header>

    {#if tiles.length}
      <!-- 1px gaps over the line colour draw the dividers: a compact row that scrolls sideways on phones, 2x2 on tablets, 4 across on desktops -->
      <!-- Focusable so a keyboard can scroll the phone row -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <dl
        aria-label={tilesLabel}
        tabindex="0"
        class="m-0 grid flex-shrink-0 snap-x snap-mandatory auto-cols-[minmax(max-content,1fr)] grid-flow-col gap-px overflow-x-auto rounded-[12px] border border-line-2 bg-line-2 [scrollbar-width:none] md:snap-none md:grid-flow-row md:grid-cols-2 md:overflow-hidden md:rounded-[14px] lg:grid-cols-4 [&::-webkit-scrollbar]:hidden"
      >
        {#each tiles as t (t.label)}
          <div class="flex min-w-[116px] snap-start flex-col gap-0.5 bg-surface-panel px-3 py-2.5 md:gap-1.5 md:px-[22px] md:py-[18px]">
            <dt class="text-[10px] label-caps text-text-dim max-md:whitespace-nowrap md:text-[12px]">{t.label}</dt>
            <dd class="m-0 flex items-baseline gap-1.5 md:gap-2.5">
              <span class="font-display text-[26px] max-md:whitespace-nowrap font-bold leading-none md:text-[40px]">{t.value}</span>
              {#if t.note}<span class="whitespace-nowrap text-[12px] md:text-[15px] {t.trend === 'up' ? 'text-accent' : 'text-text-muted'}"
                  >{t.note}</span
                >{/if}
            </dd>
          </div>
        {/each}
      </dl>
    {/if}

    <section aria-label="Matches" class="flex shrink-0 flex-col gap-3">
      {#if Object.keys(columnSizing).length > 0}
        <button
          type="button"
          onclick={() => (columnSizing = {})}
          class="hidden h-9 items-center gap-1.5 self-end rounded-lg border border-line-strong bg-transparent px-3 text-[14px] text-ink-2 hover:text-text lg:inline-flex"
          ><RotateCcw size={14} /> Reset columns</button
        >
      {/if}
      {#if loading}
        <p class="card m-0 flex items-center gap-2 px-[22px] py-10 text-[15px] text-text-muted">
          <LoaderCircle size={18} class="animate-spin" /> Loading matches…
        </p>
      {:else if error}
        <p role="alert" class="card m-0 px-[22px] py-10 text-[15px] text-text-muted">{error}</p>
      {:else}
        <DataTable
          data={games}
          {columns}
          rowHref={(g: GameSummary) => `#/history/${g.id}`}
          {rowLabel}
          resizable
          growColumn="game"
          bind:columnSizing
          columnVisibility={{ board: wide.current }}
          {narrowRow}
          tableClass=""
          headClass="h-11 px-3 first:pl-[22px] text-[12px] font-normal label-caps text-text-dim"
          cellClass="h-[68px] px-3 py-2.5 first:pl-[22px] text-text"
        >
          {#snippet emptyState()}No matches in this mode yet.{/snippet}
        </DataTable>
        {#if nextCursor !== null}
          <div class="flex flex-col items-center gap-2 p-4">
            <button
              type="button"
              onclick={() => void more()}
              disabled={loadingMore}
              class="h-10 rounded-lg border border-line-strong bg-transparent px-5 text-[15px] text-text disabled:opacity-60"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
            {#if loadMoreError}<p role="alert" class="m-0 text-[13px] text-text-muted">{loadMoreError}</p>{/if}
          </div>
        {/if}
      {/if}
    </section>
  </main>
</Layout>
