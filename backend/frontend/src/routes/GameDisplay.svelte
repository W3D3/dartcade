<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { writable } from 'svelte/store'
  import { push } from 'svelte-spa-router'
  import { createSessionStore } from '../lib/ws.js'
  import DartBoard from '../lib/components/DartBoard.svelte'

  const snapshot = writable<any>(null)
  let sessionStore: ReturnType<typeof createSessionStore> | null = null
  let unsubSnap: (() => void) | null = null
  let sessionId = ''

  onMount(() => {
    const match = window.location.hash.match(/\/session\/([^/]+)/)
    sessionId = match?.[1] ?? ''
    if (!sessionId) return
    sessionStore = createSessionStore(sessionId)
    unsubSnap = sessionStore.snapshot.subscribe(v => snapshot.set(v))
  })

  onDestroy(() => { unsubSnap?.(); sessionStore?.destroy() })

  $: game    = $snapshot?.game as any
  $: players = ($snapshot?.players ?? []) as { name: string }[]
  $: darts   = (game?.currentVisitDarts ?? []) as any[]
  $: visitScore = darts.reduce((s: number, d: any) => s + (d.score ?? 0), 0)
  $: currentPlayer = game?.currentPlayer ?? 0
  $: winner = game?.winner ?? null

  // ── ATC target label ─────────────────────────────────────────────────────────
  function targetLabel(t: number) {
    if (t > 22) return 'Done ✓'
    if (t === 22) return 'Bull 50'
    if (t === 21) return 'Bull 25'
    return String(t)
  }

  // ── Session controls ─────────────────────────────────────────────────────────
  async function closeSession() {
    if (!sessionId) return
    await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
    push('/')
  }

  // ── Board Manager controls ───────────────────────────────────────────────────
  let bmStatus = ''

  async function bmAction(action: 'start' | 'reset' | 'stop') {
    bmStatus = '…'
    try {
      const r = await fetch(`/api/board/${action}`, { method: 'POST' })
      bmStatus = r.ok ? action + ' ✓' : `${action} ${r.status}`
    } catch {
      bmStatus = 'error'
    }
    setTimeout(() => (bmStatus = ''), 2000)
  }

  // ── Correction (undo / correct dart) ─────────────────────────────────────────
  function undo() { sessionStore?.send({ type: 'undo_dart' }) }
</script>

<div class="min-h-screen bg-gray-950 text-gray-100" style="font-family: 'Segoe UI', system-ui, sans-serif;">

  {#if !$snapshot}
    <div class="flex items-center justify-center h-screen text-gray-500 text-lg">
      Connecting…
    </div>
  {:else}
    <!-- Header bar -->
    <div class="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
      <div class="flex items-center gap-3">
        <span class="text-xs uppercase tracking-widest text-gray-500">ATC</span>
        {#if winner !== null}
          <span class="text-yellow-400 font-bold">🏆 {players[winner]?.name} wins!</span>
        {:else}
          <span class="text-gray-300">
            <span class="text-white font-semibold">{players[currentPlayer]?.name}</span>'s turn
            — target <span class="font-mono text-blue-400">{targetLabel(game?.targets?.[currentPlayer] ?? 1)}</span>
          </span>
        {/if}
      </div>
      <div class="flex items-center gap-2 text-sm">
        {#if bmStatus}
          <span class="text-gray-400 text-xs mr-1">{bmStatus}</span>
        {/if}
        <button on:click={() => bmAction('start')}
          class="px-2 py-1 rounded bg-green-800 hover:bg-green-700 text-green-200 text-xs">Start</button>
        <button on:click={() => bmAction('reset')}
          class="px-2 py-1 rounded bg-yellow-800 hover:bg-yellow-700 text-yellow-200 text-xs">Reset</button>
        <button on:click={() => bmAction('stop')}
          class="px-2 py-1 rounded bg-orange-800 hover:bg-orange-700 text-orange-200 text-xs">Stop</button>
        <div class="w-px h-4 bg-gray-700 mx-1"></div>
        <button on:click={closeSession}
          class="px-2 py-1 rounded bg-red-900 hover:bg-red-800 text-red-300 text-xs">Close session</button>
      </div>
    </div>

    <!-- Main content -->
    <div class="flex gap-0" style="height: calc(100vh - 41px);">

      <!-- Left: dartboard -->
      <div class="flex items-center justify-center p-4" style="width: min(50vw, 50vh, 480px); flex-shrink: 0;">
        <DartBoard {darts} />
      </div>

      <!-- Right: players + visit -->
      <div class="flex-1 flex flex-col gap-4 p-4 overflow-y-auto">

        <!-- Players -->
        <div class="flex flex-col gap-2">
          {#each players as player, i}
            {@const isActive = currentPlayer === i && winner === null}
            {@const isWinner = winner === i}
            <div class="flex items-center gap-3 px-4 py-3 rounded-lg border
              {isWinner  ? 'border-yellow-500 bg-yellow-950'
             : isActive ? 'border-blue-500 bg-blue-950'
             : 'border-gray-800 bg-gray-900'}">
              {#if isActive}
                <span class="text-blue-400 text-xs">▶</span>
              {:else if isWinner}
                <span class="text-yellow-400 text-xs">🏆</span>
              {:else}
                <span class="w-3"></span>
              {/if}
              <span class="font-semibold w-32 truncate {isActive ? 'text-white' : 'text-gray-300'}">
                {player.name}
              </span>
              <span class="ml-auto font-mono text-lg {isActive ? 'text-blue-300' : 'text-gray-400'}">
                {targetLabel(game?.targets?.[i] ?? 1)}
              </span>
            </div>
          {/each}
        </div>

        <!-- Current visit -->
        <div class="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
          <div class="px-4 py-2 border-b border-gray-800 flex items-center justify-between">
            <span class="text-xs uppercase tracking-widest text-gray-500">Current visit</span>
            {#if darts.length > 0}
              <span class="text-sm font-mono text-yellow-400">+{visitScore}</span>
            {/if}
          </div>
          <div class="divide-y divide-gray-800">
            {#each darts as dart, i}
              {@const isMiss = dart.segment.bed === 'Outside' || dart.score === 0}
              <div class="flex items-center gap-3 px-4 py-2 text-sm">
                <span class="text-gray-600 text-xs w-4">{i + 1}</span>
                <span class="font-semibold font-mono {isMiss ? 'text-orange-400' : 'text-white'} w-12">
                  {dart.segment.name}
                </span>
                <span class="text-yellow-400 ml-auto font-mono">
                  {isMiss ? 'miss' : '+' + dart.score}
                </span>
              </div>
            {:else}
              <div class="px-4 py-3 text-gray-600 text-sm italic">Waiting for throw…</div>
            {/each}
          </div>
          {#if darts.length > 0 && winner === null}
            <div class="px-4 py-2 border-t border-gray-800">
              <button on:click={undo}
                class="text-xs text-gray-500 hover:text-gray-300 underline">Undo last dart</button>
            </div>
          {/if}
        </div>

      </div>
    </div>
  {/if}
</div>
