<!-- Every game on the platform (`#/admin/games`), for admins and moderators to investigate and invalidate. Finished games by default; aborted and active ones on request. -->
<script lang="ts">
  import { Checkbox } from '$lib/components/ui/checkbox/index.js'
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import { Ban, ChevronRight, LoaderCircle, Search, Trash, Undo2 } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import InvalidateGameModal from '$lib/components/admin/InvalidateGameModal.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Breadcrumb } from '$lib/components/ui/breadcrumb/index.js'
  import { Select } from '$lib/components/ui/select/index.js'
  import { DateRangePicker } from '$lib/components/ui/date-picker/index.js'
  import { api, type GameInfo } from '$lib/api'
  import { currentUser } from '$lib/auth'
  import { gamesTrail } from '$lib/admin/breadcrumbs'
  import {
    DEFAULT_FILTERS,
    deleteGame,
    DELETE_WARNING,
    invalidateGame,
    invalidationText,
    restoreGame,
    RESTORE_WARNING,
    STATUS_OPTIONS,
    loadGames,
    outcome,
    type AdminGameSummary,
    type GameFilters,
  } from '$lib/admin/games'
  import { getGameView } from '$lib/gameViews'
  import { formatWhen } from '$lib/history'
  import { createRequestGuard } from '$lib/requestGuard'

  // Not an admin: nothing to see here (signed-out users are sent to the login page by App)
  $effect(() => {
    if ($currentUser && !$currentUser.isModerator) void push('/')
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

  // The game asking to be invalidated, and the one mid-request
  let confirming = $state<AdminGameSummary | null>(null)
  let invalidating = $state(false)
  let invalidateError = $state('')

  async function confirmInvalidate(reason: string): Promise<void> {
    const game = confirming
    if (!game || invalidating) return
    invalidating = true
    invalidateError = ''
    const result = await invalidateGame(game.id, reason)
    invalidating = false
    confirming = null
    if ('error' in result) {
      invalidateError = result.error
      return
    }
    const me = $currentUser
    games = games.map(g =>
      g.id === game.id
        ? {
            ...g,
            invalidated: { at: new Date().toISOString(), by: me ? { id: me.id, name: me.name } : null, reason: reason.trim() || null },
          }
        : g,
    )
  }

  // Admins only: the game asking to be deleted for good
  let deleting = $state<AdminGameSummary | null>(null)

  async function confirmDelete(): Promise<void> {
    const game = deleting
    if (!game) return
    deleting = null
    invalidateError = ''
    const result = await deleteGame(game.id)
    if ('error' in result) invalidateError = result.error
    else games = games.filter(g => g.id !== game.id)
  }

  // The invalidated game asking to be restored
  let restoring = $state<AdminGameSummary | null>(null)

  async function confirmRestore(): Promise<void> {
    const game = restoring
    if (!game) return
    restoring = null
    invalidateError = ''
    const result = await restoreGame(game.id)
    if ('error' in result) {
      invalidateError = result.error
      return
    }
    games = games.map(g => (g.id === game.id ? { ...g, invalidated: null } : g))
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
</script>

<Layout title="Games">
  {#if $currentUser?.isModerator}
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
        <div class="flex flex-col gap-1 text-[12px] label-caps text-text-dim">
          Mode
          <Select
            label="Mode"
            value={filters.mode ?? ''}
            options={[{ value: '', label: 'All modes' }, ...modes.map(m => ({ value: m.id, label: getGameView(m.id).title }))]}
            onchange={(v: string) => {
              filters.mode = v || null
              void reload()
            }}
          />
        </div>
        <div class="flex flex-col gap-1 text-[12px] label-caps text-text-dim">
          Status
          <Select
            label="Status"
            value={filters.status}
            options={STATUS_OPTIONS.map(o => ({ value: o.id, label: o.label }))}
            onchange={(v: string) => {
              filters.status = STATUS_OPTIONS.find(o => o.id === v)?.id ?? DEFAULT_FILTERS.status
              void reload()
            }}
          />
        </div>
        <div class="flex flex-col gap-1 text-[12px] label-caps text-text-dim">
          Dates
          <DateRangePicker
            label="Dates"
            from={filters.from}
            to={filters.to}
            onchange={(range: { from: string; to: string }) => {
              filters.from = range.from
              filters.to = range.to
              void reload()
            }}
          />
        </div>
        <label class="flex h-11 items-center gap-2 text-[14px] text-text">
          <Checkbox bind:checked={filters.ranked} onCheckedChange={() => void reload()} />
          Ranked only
        </label>
      </div>

      {#if invalidateError}<ErrorText>{invalidateError}</ErrorText>{/if}

      <section aria-label="Games" class="flex shrink-0 flex-col overflow-hidden card">
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
              <li class="relative border-b border-line">
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
                      {#if g.invalidated}<Badge variant="guest">invalidated</Badge>{/if}
                    </span>
                    <span class="hidden shrink-0 text-[13px] text-text-dim xl:inline xl:w-[140px]">{g.board?.name ?? '–'}</span>
                    {#if g.invalidated}<span class="basis-full text-[13px] text-live-text">{invalidationText(g.invalidated)}</span>{/if}
                  </span>
                {/snippet}
                <div class="absolute right-11 top-1/2 z-10 flex -translate-y-1/2 gap-1">
                  {#if g.status === 'finished' && !g.invalidated}
                    <Button
                      variant="quiet"
                      size="icon-sm"
                      aria-label="Invalidate this game"
                      title="Invalidate"
                      onclick={() => (confirming = g)}
                      class="hover:text-live"><Ban size={16} /></Button
                    >
                  {:else if g.status === 'finished'}
                    <Button variant="quiet" size="icon-sm" aria-label="Restore this game" title="Restore" onclick={() => (restoring = g)}
                      ><Undo2 size={16} /></Button
                    >
                  {/if}
                  {#if g.status !== 'active' && $currentUser.isAdmin}
                    <Button
                      variant="quiet"
                      size="icon-sm"
                      aria-label="Delete this game for good"
                      title="Delete for good"
                      onclick={() => (deleting = g)}
                      class="hover:text-live"><Trash size={16} /></Button
                    >
                  {/if}
                </div>
                {#if g.status === 'finished'}
                  <a
                    href="#/admin/games/{g.id}"
                    class="relative block px-[22px] {$currentUser.isAdmin
                      ? 'pr-28'
                      : 'pr-20'} py-3 text-text no-underline hover:bg-surface-active"
                    aria-label="{getGameView(g.mode).title}, {when.day} {when.time}: details"
                  >
                    {@render row()}
                    <ChevronRight size={18} class="absolute right-4 top-1/2 -translate-y-1/2 text-text-dim" />
                  </a>
                {:else}
                  <div class="px-[22px] {$currentUser.isAdmin ? 'pr-28' : 'pr-20'} py-3 text-text">{@render row()}</div>
                {/if}
              </li>
            {/each}
          </ul>
          {#if error}<p role="alert" class="m-0 px-[22px] py-3 text-[13px] text-text-muted">{error}</p>{/if}
          {#if nextCursor !== null}
            <div class="flex justify-center p-4">
              <Button variant="outline" onclick={() => void more()} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          {/if}
        {/if}
      </section>
    </main>
    {#if confirming}
      <InvalidateGameModal onconfirm={(reason: string) => void confirmInvalidate(reason)} oncancel={() => (confirming = null)} />
    {/if}
    {#if deleting}
      <ConfirmModal
        title="Delete this game for good?"
        body={DELETE_WARNING}
        confirmLabel="Delete"
        cancelLabel="Keep it"
        danger
        onconfirm={() => void confirmDelete()}
        oncancel={() => (deleting = null)}
      />
    {/if}
    {#if restoring}
      <ConfirmModal
        title="Restore this game?"
        body={RESTORE_WARNING}
        confirmLabel="Restore"
        cancelLabel="Cancel"
        onconfirm={() => void confirmRestore()}
        oncancel={() => (restoring = null)}
      />
    {/if}
  {/if}
</Layout>
