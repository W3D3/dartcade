<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { push } from 'svelte-spa-router'
  import { createSessionStore } from '../lib/ws.js'
  import { getGameView } from '../lib/gameViews/index.js'
  import DartBoard from '../lib/components/DartBoard.svelte'
  import PlayerCard from '../lib/components/PlayerCard.svelte'
  import ThrowTracker from '../lib/components/ThrowTracker.svelte'
  import TopBar from '../lib/components/TopBar.svelte'
  import GameFooter from '../lib/components/GameFooter.svelte'

  let sessionId = ''
  let sessionStore: ReturnType<typeof createSessionStore> | null = null
  let snapshot: import('../lib/ws.js').Snapshot | null = null
  let unsubSnap: (() => void) | null = null

  // Per-player visit history — client-side only.
  // NOTE: resets on WS reconnect; cumulative stat tracking is a future feature.
  let perPlayerVisits: number[][] = []

  // Resync / history tracking state
  let prevDartCount = 0
  let prevCurrentPlayer = 0
  let prevDarts: any[] = []
  let visitOwner = 0

  onMount(() => {
    const match = window.location.hash.match(/\/session\/([^/]+)/)
    sessionId = match?.[1] ?? ''
    if (!sessionId) return
    sessionStore = createSessionStore(sessionId)
    unsubSnap = sessionStore.snapshot.subscribe(snap => {
      if (!snap) { snapshot = null; return }
      updateVisitHistory(snap)
      snapshot = snap
    })
  })

  onDestroy(() => { unsubSnap?.(); sessionStore?.destroy() })

  function updateVisitHistory(snap: import('../lib/ws.js').Snapshot) {
    const newDarts = (snap.game.currentVisitDarts ?? []) as any[]
    const newCount = newDarts.length
    const newPlayer = snap.game.currentPlayer as number

    if (prevDartCount === 0 && newCount > 0) {
      visitOwner = newPlayer
    }

    if (prevDartCount > 0 && newCount === 0) {
      // Distinguish takeout (player advances) from board.resync (player stays).
      const isTakeout = newPlayer !== prevCurrentPlayer
      if (isTakeout) {
        const total = prevDarts.reduce((s: number, d: any) => s + (d.score ?? 0), 0)
        if (!perPlayerVisits[visitOwner]) perPlayerVisits[visitOwner] = []
        perPlayerVisits[visitOwner] = [...perPlayerVisits[visitOwner], total]
        perPlayerVisits = [...perPlayerVisits]
      }
    }

    prevDartCount = newCount
    prevCurrentPlayer = newPlayer
    prevDarts = newDarts
  }

  $: gameId = snapshot?.gameId ?? ''
  $: players = snapshot?.players ?? []
  $: game = snapshot?.game ?? {}
  $: currentPlayer = (game.currentPlayer as number) ?? 0
  $: winner = (game.winner as number | null) ?? null
  $: currentDarts = (game.currentVisitDarts as any[]) ?? []
  $: view = getGameView(gameId)
  $: highlights = view.getBoardHighlights(game, currentPlayer)

  function undo() { sessionStore?.send({ type: 'undo_dart' }) }

  async function closeSession() {
    if (!sessionId) return
    await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
    push('/')
  }

  // bmRunning is not derivable from the game snapshot — board.status events aren't forwarded
  // to the browser WS. Always false for now; a future feature will push board status.
  let bmRunning = false
  let bmStatus = ''

  async function bmAction(action: 'start' | 'reset' | 'stop') {
    bmStatus = '…'
    try {
      const r = await fetch(`/api/board/${action}`, { method: 'POST' })
      bmStatus = r.ok ? `${action} ✓` : `${action} ${r.status}`
    } catch {
      bmStatus = 'error'
    }
    setTimeout(() => (bmStatus = ''), 2000)
  }
</script>

<div class="flex flex-col min-h-screen" style="background: #0b1628; color: #f1f5f9;">

  {#if !snapshot}
    <div class="flex-1 flex items-center justify-center">
      <span class="text-gray-500 text-lg">Connecting…</span>
    </div>

  {:else}

    <TopBar {gameId} {sessionId} onClose={closeSession} />
    <ThrowTracker darts={currentDarts} />

    <!-- 3-column main layout -->
    <!-- Only players[0] and players[1] get sidebar cards; 3+ players are silently omitted. -->
    <div class="flex-1 flex gap-4 p-4 min-h-0">

      <!-- Left player card (player 0) -->
      <div class="w-64 shrink-0 flex flex-col">
        {#if players[0]}
          <PlayerCard
            player={players[0]}
            playerIndex={0}
            {game}
            {view}
            isActive={currentPlayer === 0 && winner === null}
            isWinner={winner === 0}
            previousVisits={perPlayerVisits[0] ?? []}
          />
        {/if}
      </div>

      <!-- Dartboard center -->
      <div class="flex-1 flex items-center justify-center">
        <div class="w-full max-w-lg aspect-square">
          <DartBoard darts={currentDarts} highlightedSegments={highlights} />
        </div>
      </div>

      <!-- Right player card (player 1) -->
      <div class="w-64 shrink-0 flex flex-col">
        {#if players[1]}
          <PlayerCard
            player={players[1]}
            playerIndex={1}
            {game}
            {view}
            isActive={currentPlayer === 1 && winner === null}
            isWinner={winner === 1}
            previousVisits={perPlayerVisits[1] ?? []}
          />
        {/if}
      </div>
    </div>

    {#if winner !== null}
      <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div class="rounded-2xl px-10 py-8 text-center shadow-2xl pointer-events-auto"
          style="background: rgba(11,22,40,0.92); border: 1px solid rgba(255,255,255,0.12)">
          <p class="text-5xl mb-3">🏆</p>
          <p class="text-2xl font-bold text-white">{players[winner]?.name} wins!</p>
          <button on:click={closeSession}
            class="mt-6 px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors">
            Back to lobby
          </button>
        </div>
      </div>
    {/if}

    <GameFooter
      onUndo={undo}
      {bmRunning}
      {bmStatus}
      onBmAction={bmAction}
    />

  {/if}
</div>
