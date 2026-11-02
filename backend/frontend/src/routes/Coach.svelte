<script lang="ts">
  // The Coach page: your finished X01 games the coach can review, each opening its details page
  // at the Coach section. No coach numbers here: those would need the coach run on the server.
  import { onMount } from 'svelte'
  import { Target } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import EmptyState from '$lib/components/lobby/EmptyState.svelte'
  import { api, type GameSummary } from '$lib/api'
  import { flag } from '$lib/flags'
  import { coachable, legsPlayed, opponents } from '$lib/coach/view'
  import { formatWhen, historyStat, resultLabel } from '$lib/history'

  const enabled = flag('coach.enabled')
  let games = $state<GameSummary[]>([])
  let cursor = $state<string | null>(null)
  let loading = $state(true)
  let error = $state('')
  const now = new Date()

  async function more() {
    loading = true
    error = ''
    const { data } = await api.GET('/api/games', { params: { query: { mode: 'x01', limit: 25, ...(cursor ? { cursor } : {}) } } })
    loading = false
    if (!data) {
      error = "Couldn't load your games."
      return
    }
    games = [...games, ...data.games.filter(coachable)]
    cursor = data.nextCursor
  }
  onMount(more)
</script>

<Layout title="Coach">
  <main class="flex flex-grow min-h-0 flex-col gap-4 box-border w-full max-w-[720px] min-w-0 overflow-y-auto p-4 md:px-8 xl:px-11 md:py-10">
    <h2 class="hidden md:block m-0 font-display font-bold text-[48px] leading-none uppercase">Coach</h2>
    {#if !$enabled}
      <p class="text-[15px] text-text-muted">The coach isn't available yet.</p>
    {:else}
      <p class="text-[15px] text-text-muted">Your X01 games with double out. Open one to see where your finishing could be smarter.</p>
      {#if error}<ErrorText>{error}</ErrorText>{/if}
      {#if !loading && games.length === 0 && !cursor && !error}
        <EmptyState title="Nothing to review yet" text="Play an X01 game with double out to get a review.">
          {#snippet icon()}<Target size={24} />{/snippet}
          {#snippet actions()}<a class="underline" href="#/play">Play</a>{/snippet}
        </EmptyState>
      {/if}
      <ul class="m-0 p-0 list-none flex flex-col gap-2">
        {#each games as g (g.id)}
          {@const when = formatWhen(g.finishedAt, now)}
          {@const result = resultLabel(g)}
          {@const stat = historyStat(g)}
          {@const legs = legsPlayed(g)}
          <li>
            <a class="flex items-center justify-between gap-3 rounded-[12px] p-3 card hover:brightness-110" href="#/history/{g.id}?coach">
              <span class="flex min-w-0 flex-col gap-0.5">
                <span class="truncate font-semibold">{opponents(g)}</span>
                <span class="text-[13px] text-text-dim">{when.day} · {when.time} · {legs} {legs === 1 ? 'leg' : 'legs'}</span>
              </span>
              <span class="flex shrink-0 items-center gap-3">
                {#if stat}
                  <span class="text-[13px] text-text-muted">{stat.value} {stat.label}</span>
                {/if}
                <span class="text-[14px] {result.won ? 'text-accent' : 'text-text-dim'}">{result.text}</span>
              </span>
            </a>
          </li>
        {/each}
      </ul>
      {#if !loading && games.length === 0 && cursor && !error}
        <p class="m-0 self-center text-[14px] text-text-dim">No reviewable games in your latest X01 games yet</p>
      {/if}
      {#if cursor}
        <button
          type="button"
          onclick={() => void more()}
          disabled={loading}
          class="h-10 self-center rounded-lg border border-line-strong bg-transparent px-5 text-[15px] text-text disabled:opacity-60"
        >
          {loading ? 'Loading…' : 'Show more'}
        </button>
      {/if}
    {/if}
  </main>
</Layout>
