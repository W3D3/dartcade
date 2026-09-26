<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { push } from 'svelte-spa-router'
  import ConfirmModal from '../lib/components/ConfirmModal.svelte'
  import { createSessionStore } from '../lib/ws.js'
  import { getGameView } from '../lib/gameViews/index.js'
  import DartBoard from '../lib/components/DartBoard.svelte'
  import PlayerCard from '../lib/components/PlayerCard.svelte'
  import CorrectionPanel from '../lib/components/CorrectionPanel.svelte'
  import { Badge } from '../lib/components/ui/badge/index.js'
  import { parseLabel } from '../lib/dartUtils.js'
  import BoardStatusPanel from '../lib/components/BoardStatusPanel.svelte'

  let sessionId = $state('')
  let sessionStore: ReturnType<typeof createSessionStore> | null = null
  let snapshot = $state<import('../lib/ws.js').Snapshot | null>(null)
  let unsubSnap: (() => void) | null = null

  let perPlayerVisits = $state<number[][]>([])
  let showEndConfirm = $state(false)
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
    if (prevDartCount === 0 && newCount > 0) visitOwner = newPlayer
    if (prevDartCount > 0 && newCount === 0 && newPlayer !== prevCurrentPlayer) {
      const total = prevDarts.reduce((s: number, d: any) => s + (d.score ?? 0), 0)
      if (!perPlayerVisits[visitOwner]) perPlayerVisits[visitOwner] = []
      perPlayerVisits[visitOwner] = [...perPlayerVisits[visitOwner], total]
      perPlayerVisits = [...perPlayerVisits]
    }
    prevDartCount = newCount; prevCurrentPlayer = newPlayer; prevDarts = newDarts
  }

  const gameId = $derived(snapshot?.gameId ?? '')
  const players = $derived(snapshot?.players ?? [])
  const game = $derived(snapshot?.game ?? {})
  const currentPlayer = $derived((game.currentPlayer as number) ?? 0)
  const winner = $derived((game.winner as number | null) ?? null)
  const currentDarts = $derived((game.currentVisitDarts as any[]) ?? [])
  const view = $derived(getGameView(gameId))
  const highlights = $derived(view.getBoardHighlights(game, currentPlayer))

  const dartItems = $derived(currentDarts.map((d: any) => ({
    label: d.segment?.name ?? 'Miss',
    score: d.score ?? 0,
  })))

  function undo() { sessionStore?.send({ type: 'undo_dart' }) }

  function handleCorrect(dartIndex: number, label: string) {
    const parsed = parseLabel(label)
    sessionStore?.send({
      type: 'correct_dart',
      visitIndex: dartIndex,
      number: parsed.num,
      bed: parsed.mult === 3 ? 'Triple' : parsed.mult === 2 ? 'Double' : 'SingleOuter',
      multiplier: parsed.mult,
    })
  }

  function leaveSession() { push('/') }

  async function endSession() {
    if (!sessionId) return
    await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
    push('/')
  }
</script>

<div class="flex flex-col h-screen bg-bg text-text overflow-hidden">

  {#if !snapshot}
    <div class="flex-1 flex items-center justify-center">
      <span class="text-text-muted text-lg">Connecting…</span>
    </div>

  {:else}
    <!-- Header -->
    <header class="h-16 flex-shrink-0 box-border px-7 flex items-center gap-6
                   border-b border-line bg-surface-1">
      <button type="button" onclick={leaveSession}
        class="flex items-center gap-2 h-11 px-[14px] border border-line-3 rounded-[10px]
               text-[#c9c9bf] text-[14px] font-medium bg-transparent cursor-pointer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6"/>
        </svg>
        Leave
      </button>

      {#if winner === null}
        <button type="button" onclick={() => showEndConfirm = true}
          class="flex items-center gap-2 h-11 px-[14px] border border-line-3 rounded-[10px]
                 text-live-text text-[14px] font-medium bg-transparent cursor-pointer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
          End game
        </button>
      {/if}

      <div class="flex items-center gap-3">
        <h1 class="m-0 font-display font-bold text-[26px] uppercase tracking-[0.04em]">
          {gameId.toUpperCase()}
        </h1>
        <span class="text-[14px] text-text-muted">
          {(game.config as any)?.checkout ?? 'Double'} out
        </span>
      </div>

      <div class="ml-auto flex items-center gap-4">
        <Badge variant="live">LIVE</Badge>
        <BoardStatusPanel {sessionId} />
      </div>
    </header>

    <!-- Main content -->
    <div class="flex-grow min-h-0 box-border p-[24px_28px] flex gap-6">

      <!-- Player 0 -->
      <div class="flex-1 min-w-0">
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

      <!-- Board + correction panel column -->
      <div class="relative w-[560px] flex-shrink-0 flex flex-col items-center gap-[14px]">
        <DartBoard darts={currentDarts} highlightedSegments={highlights} />

        <CorrectionPanel darts={dartItems} onCorrect={handleCorrect} onUndo={undo}
          ontakeout={() => sessionStore?.send({ type: 'takeout' })} />
      </div>

      <!-- Player 1 -->
      <div class="flex-1 min-w-0">
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

    <!-- Winner overlay -->
    {#if winner !== null}
      <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div class="rounded-[18px] px-10 py-8 text-center pointer-events-auto
                    border border-line bg-[rgba(15,16,14,0.92)] [box-shadow:0_24px_60px_rgba(0,0,0,0.7)]">
          <p class="m-0 font-display font-bold text-[48px] text-accent uppercase mb-1">
            {players[winner]?.name} wins!
          </p>
          <button onclick={endSession}
            class="mt-6 h-[54px] px-8 rounded-[10px] bg-accent text-accent-fg font-display
                   font-bold text-xl uppercase tracking-widest border-0 cursor-pointer">
            Back to lobby
          </button>
        </div>
      </div>
    {/if}
  {/if}
</div>

{#if showEndConfirm}
  <ConfirmModal
    title="End this game?"
    body="The current game will be cancelled and all progress will be lost."
    confirmLabel="End game"
    danger
    onconfirm={endSession}
    oncancel={() => showEndConfirm = false} />
{/if}
