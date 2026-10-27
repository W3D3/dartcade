<script lang="ts">
  // Jump back in (Home board): your last three finished games, each with a way to play again.
  import { Button } from '$lib/components/ui/button/index.js'
  import HomeSection from './HomeSection.svelte'
  import { api } from '$lib/api'
  import { Loader } from '$lib/home/loader.svelte'
  import { recentRow } from '$lib/home/view'

  const games = new Loader(() => api.GET('/api/games', { params: { query: { limit: 3 } } }))

  const now = new Date()
  const rows = $derived((games.data?.games ?? []).map(g => recentRow(g, now)))
</script>

<HomeSection title="Jump back in" link={{ label: 'History', href: '#/history' }} loading={games.loading} error={games.error}>
  {#if rows.length > 0}
    <ul class="m-0 flex list-none flex-col gap-[10px] p-0">
      {#each rows as row (row.id)}
        <li class="flex items-center gap-3">
          <a href="#/history/{row.id}" class="flex min-w-0 flex-1 flex-col text-text no-underline">
            <span class="truncate text-[15px] font-semibold">{row.title}</span>
            <span class="truncate text-[13px] text-text-muted">{row.line}</span>
          </a>
          <Button href="#/play" variant="outline" size="sm" aria-label="Play {row.title} again">Play again</Button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="m-0 text-[14px] text-text-muted">No games yet. Your last ones show up here.</p>
  {/if}
</HomeSection>
