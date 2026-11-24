<!-- Live games (`#/admin/live`, admins only): every running game on the platform, each with a Watch link
     (Watch lets an admin see any running game, read only). Refreshed every 15 s while visible. -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import { Eye, LoaderCircle } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import PageMain from '$lib/components/PageMain.svelte'
  import PageTitle from '$lib/components/PageTitle.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { currentUser } from '$lib/auth'
  import { flag } from '$lib/flags'
  import { liveTrail } from '$lib/admin/breadcrumbs'
  import { DEFAULT_FILTERS, loadGames, type AdminGameSummary } from '$lib/admin/games'
  import { getGameView } from '$lib/gameViews'
  import { formatWhen } from '$lib/history'
  import { hrefs } from '$lib/routes'

  const REFRESH_MS = 15_000

  $effect(() => {
    if ($currentUser && !$currentUser.isAdmin) void push('/')
  })

  const watchOn = flag('watch.enabled')
  let games = $state<AdminGameSummary[]>([])
  let loading = $state(true)
  let error = $state('')
  let timer: ReturnType<typeof setInterval> | undefined

  async function refresh(): Promise<void> {
    try {
      games = (await loadGames({ ...DEFAULT_FILTERS, status: 'active' }, null)).games
      error = ''
    } catch {
      error = 'Could not load the live games.'
    }
    loading = false
  }

  function schedule() {
    clearInterval(timer)
    timer = document.hidden ? undefined : setInterval(() => void refresh(), REFRESH_MS)
  }

  onMount(() => {
    void refresh()
    schedule()
    document.addEventListener('visibilitychange', schedule)
  })
  onDestroy(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', schedule)
  })
</script>

<Layout>
  <PageMain>
    <PageTitle trail={liveTrail()} title="Live games" sub="Every game running now. Watch one without being a friend or a player." />
    {#if !$watchOn}<ErrorText>Watch is off (flag watch.enabled), so there is nothing to open.</ErrorText>{/if}
    {#if error}<ErrorText>{error}</ErrorText>{/if}
    <section aria-label="Live games" class="flex shrink-0 flex-col overflow-hidden card">
      {#if loading}
        <p class="flex items-center gap-2 px-[22px] py-10 text-[15px] text-text-muted">
          <LoaderCircle size={18} class="animate-spin" /> Loading games…
        </p>
      {:else if games.length === 0}
        <p class="px-[22px] py-10 text-[15px] text-text-muted">No game is running right now.</p>
      {:else}
        <ul>
          {#each games as g (g.id)}
            {@const when = formatWhen(g.createdAt, new Date())}
            <li class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-[22px] py-3">
              <span class="w-[110px] shrink-0 text-[15px] font-semibold">{when.time}</span>
              <span class="w-[130px] shrink-0 font-display text-[20px] font-bold uppercase tracking-title">{getGameView(g.mode).title}</span
              >
              <span class="min-w-0 flex-1 basis-[220px] text-[14px] text-ink-2">{g.players.map(p => p.name).join(' · ')}</span>
              {#if g.ranked}<Badge variant="ready">ranked</Badge>{/if}
              <span class="hidden shrink-0 text-[13px] text-text-dim sm:inline">{g.board?.name ?? '–'}</span>
              {#if $watchOn}
                <Button variant="outline" size="sm" href={hrefs.watch(g.id)}><Eye size={16} /> Watch</Button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </PageMain>
</Layout>
