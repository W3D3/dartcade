<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { writable } from 'svelte/store'
  import { createSessionStore } from '../lib/ws.js'
  import DartBoard from '../lib/components/DartBoard.svelte'
  import PlayerList from '../lib/components/PlayerList.svelte'
  import CorrectionPanel from '../lib/components/CorrectionPanel.svelte'

  // Stable store — always safe to subscribe to in the template.
  // Populated once onMount so params is guaranteed to be set.
  const snapshot = writable<any>(null)
  let sessionStore: ReturnType<typeof createSessionStore> | null = null
  let unsubSnap: (() => void) | null = null

  onMount(() => {
    // svelte-spa-router's params store is not yet set in Svelte 5 at onMount time.
    // Read the session ID from the hash directly instead.
    const match = window.location.hash.match(/\/session\/([^/]+)/)
    const id = match?.[1] ?? ''
    if (!id) return
    sessionStore = createSessionStore(id)
    unsubSnap = sessionStore.snapshot.subscribe(v => snapshot.set(v))
  })

  onDestroy(() => {
    unsubSnap?.()
    sessionStore?.destroy()
  })

  $: game = $snapshot?.game as any
  $: players = $snapshot?.players ?? []
  $: darts = game?.currentVisitDarts ?? []
  $: visitInProgress = darts.length > 0

  function undo() { sessionStore?.send({ type: 'undo_dart' }) }
  function correct(visitIndex: number, number: number, bed: string, multiplier: number) {
    sessionStore?.send({ type: 'correct_dart', visitIndex, segment: { name: `${bed[0]}${number}`, number, bed, multiplier } })
  }
</script>

<div class="max-w-2xl mx-auto p-4">
  {#if !$snapshot}
    <p class="text-gray-500">Connecting…</p>
  {:else}
    {#if game?.winner !== null && game?.winner !== undefined}
      <div class="bg-yellow-100 border border-yellow-400 rounded p-4 mb-4 text-center">
        <p class="text-xl font-bold">🎯 {players[game.winner]?.name} wins!</p>
      </div>
    {/if}

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <PlayerList {players} targets={game?.targets ?? []} currentPlayer={game?.currentPlayer ?? 0} winner={game?.winner ?? null} />
      </div>
      <div>
        <DartBoard {darts} />
      </div>
    </div>

    {#if visitInProgress && game?.winner === null}
      <div class="mt-4">
        <CorrectionPanel dartCount={darts.length} onUndo={undo} onCorrect={correct} />
      </div>
    {/if}
  {/if}
</div>
