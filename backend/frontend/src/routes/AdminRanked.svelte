<!-- Ranked queue (`#/admin/ranked`), for admins and moderators: who is searching, for how long and at what rating, and a way to take someone out. Refreshed every 5 s while visible. -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import { RefreshCw, UserMinus } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import PageMain from '$lib/components/PageMain.svelte'
  import PageTitle from '$lib/components/PageTitle.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import ReasonModal from '$lib/components/admin/ReasonModal.svelte'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { currentUser } from '$lib/auth'
  import { rankedTrail } from '$lib/admin/breadcrumbs'
  import { loadQueue, removeFromQueue, waitText, type QueuedSearch } from '$lib/admin/games'
  import { rank, rankIndexFor } from '$shared/ranked.js'

  // Not a moderator: nothing to see here (signed-out users are sent to the login page by App)
  $effect(() => {
    if ($currentUser && !$currentUser.isModerator) void push('/')
  })

  let searches = $state<QueuedSearch[] | null>(null)
  let error = $state('')
  let removing = $state<{ search: QueuedSearch; userId: string } | null>(null)

  async function refresh(): Promise<void> {
    const list = await loadQueue()
    if (list === null) error = "Couldn't load the queue."
    else {
      searches = list
      error = ''
    }
  }

  async function confirmRemove(reason: string): Promise<void> {
    const target = removing
    if (!target) return
    removing = null
    const result = await removeFromQueue(target.userId, reason)
    error = 'error' in result ? result.error : ''
    await refresh()
  }

  const REFRESH_MS = 5000
  let timer: ReturnType<typeof setInterval> | undefined
  function schedule(): void {
    clearInterval(timer)
    timer = document.hidden ? undefined : setInterval(() => void refresh(), REFRESH_MS)
  }
  function onVisibility(): void {
    if (!document.hidden) void refresh()
    schedule()
  }
  onMount(() => {
    void refresh()
    schedule()
    document.addEventListener('visibilitychange', onVisibility)
  })
  onDestroy(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibility)
  })
</script>

<Layout title="Ranked queue">
  {#if $currentUser?.isModerator}
    <PageMain>
      <header class="flex flex-wrap items-end justify-between gap-3">
        <PageTitle as="div" trail={rankedTrail()} title="Ranked queue" sub="Everyone searching for a ranked match right now" />
        <Button variant="outline" size="md" aria-label="Refresh" class="w-11 px-0" onclick={() => void refresh()}>
          <RefreshCw size={16} />
        </Button>
      </header>

      {#if error}<ErrorText>{error}</ErrorText>{/if}

      <section class="card flex flex-col" aria-label="Searches">
        {#if searches === null}
          <p class="p-5 text-[14px] text-text-muted">Loading…</p>
        {:else if searches.length === 0}
          <p class="p-5 text-[14px] text-text-muted">Nobody is searching.</p>
        {:else}
          <ul>
            {#each searches as s (s.id)}
              <li class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-[22px] py-3 last:border-b-0">
                <span class="w-[70px] shrink-0 font-display text-[20px] font-bold uppercase tracking-[0.02em]">{s.mode}</span>
                <span class="flex min-w-0 flex-1 basis-[200px] flex-col text-[14px]">
                  <span class="font-semibold text-text">{s.players.map(p => p.name).join(' + ')}</span>
                  <span class="text-[13px] text-text-muted">
                    first to {s.firstTo} · {s.rating.toLocaleString('en-US')} RP{s.placing ? '' : `, ${rank(rankIndexFor(s.rating)).name}`} ·
                    ±{s.range}
                  </span>
                </span>
                <span class="flex shrink-0 items-center gap-2 text-[13px] text-text-muted">
                  {#if s.placing}<Badge variant="guest">placing</Badge>{/if}
                  <span class="font-mono">{waitText(s.waitSeconds)}</span>
                </span>
                <span class="flex shrink-0 gap-2">
                  {#each s.players as p (p.userId)}
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label="Remove {p.name} from the queue"
                      onclick={() => (removing = { search: s, userId: p.userId })}
                    >
                      <UserMinus size={14} />{s.players.length > 1 ? p.name : 'Remove'}
                    </Button>
                  {/each}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </PageMain>
    {#if removing}
      <ReasonModal
        title="Remove from the queue?"
        subtitle={removing.search.players.length > 1
          ? 'Their whole duo’s search ends. They see it end and can search again at once.'
          : 'Their search ends. They see it end and can search again at once.'}
        confirmLabel="Remove"
        onconfirm={(reason: string) => void confirmRemove(reason)}
        oncancel={() => (removing = null)}
      />
    {/if}
  {/if}
</Layout>
