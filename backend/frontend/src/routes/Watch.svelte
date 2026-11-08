<script lang="ts">
  // Watch (#/watch/<game>): a friend's running game, view only. The match screen's own components under the
  // big screen's view-only props, a bar that says whose game this is, and when the game ends its result, then back.
  import { onDestroy, onMount, untrack } from 'svelte'
  import { push } from 'svelte-spa-router'
  import { accountSettings } from '$lib/accountSettings'
  import Result from '$lib/components/bigscreen/Result.svelte'
  import Live from '$lib/components/bigscreen/Live.svelte'
  import WatchBar from '$lib/components/watch/WatchBar.svelte'
  import { gameState } from '$lib/gameState'
  import { getGameView } from '$lib/gameViews'
  import { loadSettings } from '$lib/gameSettings'
  import { deviceStore } from '$lib/storage'
  import { emptyHistory, trackVisits, type VisitHistory } from '$lib/visitHistory'
  import { RESULT_SECONDS, watchState, watchTitle } from '$lib/watch/view'
  import { createSessionStore, type Snapshot } from '$lib/ws'

  let { params }: { params: { id: string } } = $props()

  // The game of the route is fixed for the page's life
  // svelte-ignore state_referenced_locally
  const store = createSessionStore(params.id, { watch: true })
  const { connected, stopped } = store
  let snapshot = $state<Snapshot | null>(null)
  const unsub = store.snapshot.subscribe(s => (snapshot = s))
  onDestroy(() => {
    unsub()
    store.destroy()
  })

  const settings = $derived({ ...loadSettings(deviceStore()), ...($accountSettings ?? {}) })
  // Around the Clock's visits are tracked here, as on the match screen
  let visits = $state.raw<VisitHistory>(emptyHistory())
  let prev: Snapshot | null = null
  $effect(() => {
    const atc = gameState(snapshot).atc
    if (atc)
      visits = trackVisits(
        untrack(() => (snapshot?.sessionId === prev?.sessionId ? visits : emptyHistory())),
        atc,
      )
    prev = snapshot
  })

  const phase = $derived(watchState(snapshot, $connected, $stopped))
  const view = $derived(snapshot ? getGameView(snapshot.gameId) : null)

  // Back to where the link was followed from; opened straight from a link there is no earlier page
  function leave() {
    if (history.length > 1) history.back()
    else void push('/friends')
  }

  // The result shows for a while, then the page leaves by itself
  let left = $state(RESULT_SECONDS)
  $effect(() => {
    if (phase !== 'over') return
    left = RESULT_SECONDS
    const t = setInterval(() => {
      left -= 1
      if (left <= 0) leave()
    }, 1000)
    return () => clearInterval(t)
  })
  onMount(() => window.scrollTo(0, 0))
</script>

<div class="flex h-dvh flex-col overflow-hidden bg-bg text-text ring-2 ring-inset ring-accent/40" data-testid="watch" data-state={phase}>
  {#if snapshot && (phase === 'live' || phase === 'offline' || phase === 'over')}
    <WatchBar
      title={watchTitle(snapshot)}
      game={view?.title ?? ''}
      meta={view?.meta(snapshot)}
      state={phase}
      watchers={snapshot.spectators}
      onleave={leave}
    />
    {#if phase === 'over'}
      <Result {snapshot} detail={null} countdown={`Back in ${left} s`} board={{ online: true }} />
    {:else}
      <Live {snapshot} board={{ online: true }} {settings} history={visits} bigHeader={false} />
    {/if}
  {:else}
    <div class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center" role="status">
      {#if phase === 'connecting'}
        <span class="text-lg text-text-muted">Connecting…</span>
      {:else}
        <p class="max-w-sm text-lg text-text">
          {phase === 'full'
            ? 'This game has as many watchers as it can have. Try again in a moment.'
            : "You can't watch this game. It may be over, or your friend has gone Invisible."}
        </p>
        <button type="button" class="h-11 cursor-pointer rounded-md border border-line-strong px-5 text-[15px] text-ink-2" onclick={leave}
          >Back</button
        >
      {/if}
    </div>
  {/if}
</div>
