<script lang="ts">
  import LoadingBlock from '$lib/components/LoadingBlock.svelte'
  // The inline panel under an Activity chart: the accounts or games behind the bar or cell that was
  // clicked, newest first, with links to the profile or the game's details; "Show more" pages on.
  import { X } from '@lucide/svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { hrefs } from '$lib/routes'
  import { gameTitle } from '$shared/gameNames'
  import { formatCount, loadDrill, type AdminActivityDrill, type DrillQuery } from '$lib/admin/activity'

  let { title, query, onclose }: { title: string; query: DrillQuery; onclose: () => void } = $props()

  let page = $state<AdminActivityDrill | null>(null)
  let error = $state('')
  let loading = $state(false)
  const shown = $derived(page ? page.users.length + page.games.length : 0)

  async function more(reset: boolean): Promise<void> {
    const asked = query
    loading = true
    const next = await loadDrill(asked, reset ? 0 : shown)
    // The panel moved on to another point while this was loading
    if (asked !== query) return
    loading = false
    if (!next) {
      error = "Couldn't load this."
      return
    }
    error = ''
    page = reset || !page ? next : { ...next, users: [...page.users, ...next.users], games: [...page.games, ...next.games] }
  }
  $effect(() => {
    page = null
    void more(true)
  })
  const when = (iso: string) => new Date(iso).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC'
</script>

<div class="rounded-card border border-line bg-surface-inset p-3 md:p-4 flex flex-col gap-2" role="region" aria-label="Drill-down: {title}">
  <div class="flex items-start justify-between gap-3">
    <div>
      <h3 class="text-label font-semibold">{title}</h3>
      {#if page}<p class="text-small text-text-muted">
          {formatCount(page.total)}
          {query.metric === 'signups' ? 'new accounts' : 'finished games'}
        </p>{/if}
    </div>
    <Button variant="outline" size="sm" aria-label="Close the drill-down" class="w-9 px-0" onclick={onclose}><X size={16} /></Button>
  </div>
  {#if error}<ErrorText>{error}</ErrorText>{/if}
  {#if !page && !error}<LoadingBlock rows={4} label="Loading the games" />{/if}
  {#if page}
    {#if shown === 0}
      <p class="text-small text-text-muted">Nothing here.</p>
    {:else}
      <ul class="flex flex-col">
        {#each page.users as u (u.id)}
          <li class="flex items-baseline justify-between gap-3 py-2 border-b border-line last:border-b-0">
            <a href={hrefs.profile(u.id)} class="min-w-0 truncate text-label">{u.name}</a>
            <span class="shrink-0 text-small text-text-muted">{when(u.at)}</span>
          </li>
        {/each}
        {#each page.games as g (g.id)}
          <li class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 border-b border-line last:border-b-0">
            <a href={hrefs.adminGames(g.id)} class="min-w-0 truncate text-label">
              {gameTitle(g.mode)}{g.players.length ? ` · ${g.players.join(', ')}` : ''}
            </a>
            <span class="shrink-0 text-small text-text-muted">{when(g.at)}</span>
          </li>
        {/each}
      </ul>
      {#if shown < page.total}
        <Button variant="outline" size="sm" class="self-start" disabled={loading} onclick={() => void more(false)}>Show more</Button>
      {/if}
    {/if}
  {/if}
</div>
