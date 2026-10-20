<!-- Every game on the platform (`#/admin/games`), for investigating. Finished games by default; aborted and active ones on request. -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import { ChevronRight, LoaderCircle, Search } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Breadcrumb } from '$lib/components/ui/breadcrumb/index.js'
  import { api, type GameInfo } from '$lib/api'
  import { currentUser } from '$lib/auth'
  import { gamesTrail } from '$lib/admin/breadcrumbs'
  import { DEFAULT_FILTERS, STATUS_OPTIONS, loadGames, outcome, type AdminGameSummary, type GameFilters } from '$lib/admin/games'
  import { getGameView } from '$lib/gameViews'
  import { formatWhen } from '$lib/history'
  import { createRequestGuard } from '$lib/requestGuard'

  // Not an admin: nothing to see here (signed-out users are sent to the login page by App)
  $effect(() => {
    if ($currentUser && !$currentUser.isAdmin) void push('/')
  })

  // Only the most recently started request may apply its result (a quick filter change leaves older ones in flight)
  const requests = createRequestGuard()

  let filters = $state<GameFilters>({ ...DEFAULT_FILTERS })
  let modes = $state<GameInfo[]>([])
  let games = $state<AdminGameSummary[]>([])
  let nextCursor = $state<string | null>(null)
  let loading = $state(true)
  let loadingMore = $state(false)
  let error = $state('')
  const now = new Date()

  async function reload(): Promise<void> {
    const token = requests.start()
    loading = true
    loadingMore = false
    error = ''
    try {
      const page = await loadGames(filters, null)
      if (!requests.isCurrent(token)) return
      games = page.games
      nextCursor = page.nextCursor
    } catch (e) {
      if (requests.isCurrent(token)) error = e instanceof Error ? e.message : 'Could not load the games'
    } finally {
      if (requests.isCurrent(token)) loading = false
    }
  }

  async function more(): Promise<void> {
    if (nextCursor === null || loadingMore) return
    const token = requests.current()
    loadingMore = true
    error = ''
    try {
      const page = await loadGames(filters, nextCursor)
      if (!requests.isCurrent(token)) return
      games = [...games, ...page.games]
      nextCursor = page.nextCursor
    } catch (e) {
      if (requests.isCurrent(token)) error = e instanceof Error ? e.message : 'Could not load more games'
    } finally {
      if (requests.isCurrent(token)) loadingMore = false
    }
  }

  let playerTimer: ReturnType<typeof setTimeout> | undefined
  function onPlayerInput(value: string): void {
    filters.player = value
    clearTimeout(playerTimer)
    playerTimer = setTimeout(() => void reload(), 300)
  }

  onMount(() => {
    void api.GET('/api/gamemodes').then(r => (modes = r.data?.modes ?? []))
    void reload()
  })

  const field = 'h-11 rounded-[10px] border border-line-3 bg-transparent px-3 text-[14px] text-text'
</script>

<Layout title="Games">
  {#if $currentUser?.isAdmin}
    <main class="flex min-h-0 flex-grow flex-col gap-[14px] md:gap-[22px] overflow-y-auto box-border p-4 md:p-[34px_32px] xl:p-[34px_44px]">
      <header class="hidden md:flex flex-col gap-[6px]">
        <Breadcrumb items={gamesTrail()} />
        <h1 class="m-0 font-display font-bold text-[48px] leading-none uppercase tracking-[0.02em]">Games</h1>
        <p class="m-0 text-[15px] text-text-muted">Every game on the platform. Open a finished one to see it leg by leg.</p>
      </header>

      <div class="flex flex-wrap items-end gap-3">
        <label class="flex h-11 w-full max-w-[300px] items-center gap-2 rounded-[10px] border border-line-3 px-3 text-text-muted">
          <Search size={16} />
          <input
            type="search"
            value={filters.player}
            oninput={e => onPlayerInput(e.currentTarget.value)}
            placeholder="Player name or account id"
            aria-label="Player name or account id"
            class="min-w-0 flex-grow border-0 bg-transparent text-[14px] text-text outline-none"
          />
        </label>
        <label class="flex flex-col gap-1 text-[12px] label-caps text-text-dim">
          Mode
          <select
            class={field}
            value={filters.mode ?? ''}
            onchange={e => {
              filters.mode = e.currentTarget.value || null
              void reload()
            }}
          >
            <option value="">All modes</option>
            {#each modes as m (m.id)}<option value={m.id}>{getGameView(m.id).title}</option>{/each}
          </select>
        </label>
        <label class="flex flex-col gap-1 text-[12px] label-caps text-text-dim">
          Status
          <select
            class={field}
            value={filters.status}
            onchange={e => {
              filters.status = STATUS_OPTIONS.find(o => o.id === e.currentTarget.value)?.id ?? DEFAULT_FILTERS.status
              void reload()
            }}
          >
            {#each STATUS_OPTIONS as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
          </select>
        </label>
        <label class="flex flex-col gap-1 text-[12px] label-caps text-text-dim">
          From
          <input type="date" class={field} bind:value={filters.from} onchange={() => void reload()} />
        </label>
        <label class="flex flex-col gap-1 text-[12px] label-caps text-text-dim">
          To
          <input type="date" class={field} bind:value={filters.to} onchange={() => void reload()} />
        </label>
        <label class="flex h-11 items-center gap-2 text-[14px] text-text">
          <input type="checkbox" bind:checked={filters.ranked} onchange={() => void reload()} />
          Ranked only
        </label>
      </div>

      <section aria-label="Games" class="flex min-h-0 flex-col overflow-hidden card">
        {#if loading}
          <p class="m-0 flex items-center gap-2 px-[22px] py-10 text-[15px] text-text-muted">
            <LoaderCircle size={18} class="animate-spin" /> Loading games…
          </p>
        {:else if error && games.length === 0}
          <p role="alert" class="m-0 px-[22px] py-10 text-[15px] text-text-muted">{error}</p>
        {:else if games.length === 0}
          <p class="m-0 px-[22px] py-10 text-[15px] text-text-muted">No games match.</p>
        {:else}
          <ul class="m-0 list-none p-0">
            {#each games as g (g.id)}
              {@const when = formatWhen(g.createdAt, now)}
              <li class="border-b border-line">
                {#snippet row()}
                  <span class="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
                    <span class="flex w-[110px] shrink-0 flex-col">
                      <span class="text-[15px] font-semibold">{when.day}</span>
                      <span class="font-mono text-[12px] text-text-dim">{when.time}</span>
                    </span>
                    <span class="w-[130px] shrink-0 font-display text-[20px] font-bold uppercase tracking-[0.02em]"
                      >{getGameView(g.mode).title}</span
                    >
                    <span class="min-w-0 flex-1 basis-[220px] text-[14px] text-ink-2"
                      >{g.players.map(p => (p.bot ? `${p.name} (bot ${p.bot.level})` : p.name)).join(' · ')}</span
                    >
                    <span class="flex shrink-0 items-center gap-2 text-[13px] text-text-muted">
                      {outcome(g)}
                      {#if g.status !== 'finished'}<Badge variant="guest">{g.status}</Badge>{/if}
                      {#if g.ranked}<Badge variant="ready">ranked</Badge>{/if}
                    </span>
                    <span class="hidden shrink-0 text-[13px] text-text-dim xl:inline xl:w-[140px]">{g.board?.name ?? '–'}</span>
                  </span>
                {/snippet}
                {#if g.status === 'finished'}
                  <a
                    href="#/admin/games/{g.id}"
                    class="relative block px-[22px] pr-12 py-3 text-text no-underline hover:bg-surface-active"
                    aria-label="{getGameView(g.mode).title}, {when.day} {when.time}: details"
                  >
                    {@render row()}
                    <ChevronRight size={18} class="absolute right-4 top-1/2 -translate-y-1/2 text-text-dim" />
                  </a>
                {:else}
                  <div class="px-[22px] pr-12 py-3 text-text">{@render row()}</div>
                {/if}
              </li>
            {/each}
          </ul>
          {#if error}<p role="alert" class="m-0 px-[22px] py-3 text-[13px] text-text-muted">{error}</p>{/if}
          {#if nextCursor !== null}
            <div class="flex justify-center p-4">
              <button
                type="button"
                onclick={() => void more()}
                disabled={loadingMore}
                class="h-10 rounded-lg border border-line-strong bg-transparent px-5 text-[15px] text-text disabled:opacity-60"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          {/if}
        {/if}
      </section>
    </main>
  {/if}
</Layout>
