<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { push } from 'svelte-spa-router'
  import ConfirmModal from '../lib/components/ConfirmModal.svelte'
  import { createSessionStore } from '../lib/ws.js'
  import { getGameView } from '../lib/gameViews/index.js'
  import DartBoard from '../lib/components/DartBoard.svelte'
  import DartEntryPanel from '../lib/components/DartEntryPanel.svelte'
  import PlayerCard from '../lib/components/PlayerCard.svelte'
  import PlayerListRow from '../lib/components/PlayerListRow.svelte'
  import CorrectionPanel from '../lib/components/CorrectionPanel.svelte'
  import { parseLabel } from '../lib/dartUtils.js'
  import GameHeader from '../lib/components/GameHeader.svelte'
  import BullOffPanel from '../lib/components/BullOffPanel.svelte'
  import { defaultSettings, type GameSettings } from '../lib/gameSettings.js'
  import { api, type Segment, type BullOffView } from '$lib/api'

  // ── Settings (persisted to localStorage) ──────────────────────────────────
  const SETTINGS_KEY = 'dartcade_game_settings'
  function loadSettings(): GameSettings {
    try {
      const s = localStorage.getItem(SETTINGS_KEY)
      if (s) return { ...defaultSettings, ...JSON.parse(s) }
    } catch {}
    return { ...defaultSettings }
  }
  let settings = $state<GameSettings>(loadSettings())
  $effect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) })

  // ── Sound effects (Web Audio API) ─────────────────────────────────────────
  let audioCtx: AudioContext | null = null
  function getAudio(): AudioContext | null {
    if (typeof AudioContext === 'undefined') return null
    if (!audioCtx) audioCtx = new AudioContext()
    return audioCtx
  }
  function playTone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.25) {
    const ctx = getAudio(); if (!ctx) return
    const osc = ctx.createOscillator(), gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = type; osc.frequency.value = freq
    gain.gain.setValueAtTime(vol, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    osc.start(); osc.stop(ctx.currentTime + dur)
  }
  function soundHit()    { playTone(880, 0.12, 'sine', 0.3) }
  function soundMiss()   { playTone(200, 0.18, 'sawtooth', 0.18) }
  function soundSwitch() { playTone(440, 0.08, 'sine', 0.2) }

  let sessionId = $state('')
  let sessionStore: ReturnType<typeof createSessionStore> | null = null
  let snapshot = $state<import('../lib/ws.js').Snapshot | null>(null)
  let unsubSnap: (() => void) | null = null

  // ── View mode: 'board' shows the SVG, 'entry' shows DartEntryPanel ─────────
  let viewMode = $state<'board' | 'entry'>('board')
  let viewModeSetByUser = $state(false)

  let perPlayerVisits = $state<number[][]>([])
  let showEndConfirm = $state(false)
  let prevDartCount = 0
  let prevCurrentPlayer = 0
  let prevDarts: any[] = []
  let visitOwner = 0
  let prevTotalVisits: number[] = []

  onMount(() => {
    const match = window.location.hash.match(/\/session\/([^/]+)/)
    sessionId = match?.[1] ?? ''
    if (!sessionId) return
    sessionStore = createSessionStore(sessionId)
    unsubSnap = sessionStore.snapshot.subscribe(snap => {
      if (!snap) { snapshot = null; return }
      // Default to entry mode for boardless sessions (once, on first snapshot)
      if (!viewModeSetByUser && snap.boardId === null) {
        viewMode = 'entry'
        viewModeSetByUser = true
      }
      const oldCount = prevDartCount
      const oldPlayer = prevCurrentPlayer
      updateVisitHistory(snap)
      if (settings.soundHit || settings.soundMiss || settings.soundSwitch) playSoundEvents(snap, oldCount, oldPlayer)
      snapshot = snap
    })
  })
  onDestroy(() => { unsubSnap?.(); sessionStore?.destroy() })

  function playSoundEvents(snap: import('../lib/ws.js').Snapshot, oldCount: number, oldPlayer: number) {
    const g = snap.game as unknown as Record<string, unknown>
    const newDarts = (g.currentVisitDarts ?? []) as any[]
    const newPlayer = g.currentPlayer as number
    if (newDarts.length > oldCount) {
      const idx = newDarts.length - 1
      const hits = g.currentVisitHits as boolean[] | undefined
      const isHit = hits !== undefined ? hits[idx] === true : (newDarts[idx]?.score ?? 0) > 0
      if (isHit) { if (settings.soundHit) soundHit() }
      else { if (settings.soundMiss) soundMiss() }
    } else if (newPlayer !== oldPlayer) {
      if (settings.soundSwitch) soundSwitch()
    }
  }

  function updateVisitHistory(snap: import('../lib/ws.js').Snapshot) {
    const g = snap.game as unknown as Record<string, unknown>
    const newDarts = (g.currentVisitDarts ?? []) as any[]
    const newCount = newDarts.length
    const newPlayer = g.currentPlayer as number
    const snapTotalVisits = (g.totalVisits as number[] | undefined) ?? []

    if (prevDartCount === 0 && newCount > 0) visitOwner = newPlayer

    // Detect completed visit by totalVisits counter incrementing for visitOwner
    const prevOwnerVisits = prevTotalVisits[visitOwner] ?? 0
    const newOwnerVisits = snapTotalVisits[visitOwner] ?? 0
    if (newOwnerVisits > prevOwnerVisits) {
      const total = prevDarts.reduce((s: number, d: any) => s + (d.score ?? 0), 0)
      if (!perPlayerVisits[visitOwner]) perPlayerVisits[visitOwner] = []
      perPlayerVisits[visitOwner] = [...perPlayerVisits[visitOwner], total]
      perPlayerVisits = [...perPlayerVisits]
    }

    prevTotalVisits = [...snapTotalVisits]
    prevDartCount = newCount; prevCurrentPlayer = newPlayer; prevDarts = newDarts
  }

  const gameId        = $derived(snapshot?.gameId ?? '')
  const boardId       = $derived(snapshot?.boardId ?? null)
  const players       = $derived(snapshot?.players ?? [])
  const game          = $derived(snapshot?.game)
  const currentPlayer = $derived(game?.currentPlayer ?? 0)
  const winner        = $derived(game?.winner ?? null)
  const currentDarts  = $derived(game?.currentVisitDarts ?? [])
  const visitHits     = $derived(game && 'currentVisitHits' in game ? game.currentVisitHits : undefined)
  const bust          = $derived(!!game && 'bustThisVisit' in game && game.bustThisVisit)
  // Set while a bull off decides the throwing order (games wrapped with withBullOff)
  const bullOff       = $derived(game && 'bullOff' in game && game.phase === 'bulloff' ? game.bullOff : null)
  // The per-game view helpers (lib/gameViews) and player cards still take an untyped game
  const gameRecord    = $derived((game ?? {}) as Record<string, unknown>)
  const view          = $derived(getGameView(gameId))
  const highlights    = $derived(view.getBoardHighlights(gameRecord, currentPlayer))
  const subtitle      = $derived(view.getSubtitle?.(gameRecord, players.length) ?? '')
  const isMultiPlayer  = $derived(players.length > 2)
  const showVisitScore = $derived(view.showVisitScore ?? true)
  const bmStatus       = $derived(snapshot?.bmStatus ?? null)
  const isActive       = $derived(winner === null)

  const dartItems = $derived(currentDarts.map((d: any) => ({
    label: d.segment?.name ?? 'Miss',
    score: d.score ?? 0,
  })))

  const boardMarkers = $derived(
    isMultiPlayer && settings.showMarkers
      ? players.map((p, i) => ({
          initial: p.name?.[0]?.toUpperCase() ?? '?',
          segment: view.getBoardHighlights(gameRecord, i)[0] ?? 0,
          isActive: i === currentPlayer && winner === null,
        })).filter(m => m.segment > 0)
      : []
  )

  const nextPlayer = $derived((currentPlayer + 1) % Math.max(players.length, 1))

  const leadingPlayerIndex = $derived((() => {
    const hitCounts = gameRecord.hitCounts as number[] | undefined
    if (!hitCounts || hitCounts.length === 0) return -1
    let maxHits = -1, leadIdx = -1
    hitCounts.forEach((h, i) => { if (h > maxHits) { maxHits = h; leadIdx = i } })
    return leadIdx
  })())

  const atcTargets = $derived(
    !isMultiPlayer && (gameRecord.targets as number[] | undefined) && players.length > 0
      ? (gameRecord.targets as number[]).map((t, i) => ({
          name: players[i]?.name ?? `Player ${i + 1}`,
          label: t === 22 ? 'Bull' : t === 21 ? '25' : t > 22 ? '✓' : String(t),
          isActive: i === currentPlayer,
        }))
      : null
  )

  function undo() { sessionStore?.send({ type: 'undo_dart' }) }

  function addManualDart(seg: Segment) {
    sessionStore?.send({ type: 'add_dart', segment: seg })
  }

  function handleCorrect(dartIndex: number, label: string) {
    let segment: Segment
    if (label === 'Bull') {
      segment = { name: 'Bull', number: 50, bed: 'Double', multiplier: 1 }
    } else if (label === '25') {
      segment = { name: '25', number: 25, bed: 'Single', multiplier: 1 }
    } else if (label === 'Miss') {
      segment = { name: 'Miss', number: 0, bed: 'Outside', multiplier: 0 }
    } else {
      const parsed = parseLabel(label)
      segment = {
        name: label,
        number: parsed.num,
        bed: parsed.mult === 3 ? 'Triple' : parsed.mult === 2 ? 'Double' : 'SingleOuter',
        multiplier: parsed.mult,
      }
    }
    sessionStore?.send({ type: 'correct_dart', visitIndex: dartIndex, segment })
  }

  function leaveSession() { push('/') }

  async function endSession() {
    if (!sessionId) return
    await api.DELETE('/api/sessions/{id}', { params: { path: { id: sessionId } } })
    push('/')
  }

  function setViewMode(m: 'board' | 'entry') {
    viewMode = m
    viewModeSetByUser = true
  }
</script>

<div class="flex flex-col h-screen bg-bg text-text overflow-hidden">

  {#if !snapshot}
    <div class="flex-1 flex items-center justify-center">
      <span class="text-text-muted text-lg">Connecting…</span>
    </div>

  {:else}
    <GameHeader
      title={bullOff ? 'Bull-off' : view.title}
      subtitle={bullOff ? `Who throws first in ${view.title}` : subtitle}
      showViewToggle={!bullOff}
      {sessionId}
      {boardId}
      {bmStatus}
      {viewMode}
      canEnd={winner === null}
      bind:settings
      onleave={leaveSession}
      onend={() => showEndConfirm = true}
      onviewmode={setViewMode}
    />

    {#if bullOff}
      <BullOffPanel {players} {bullOff} manual={boardId === null}
        send={a => sessionStore?.send(a)} />

    {:else if isMultiPlayer}
      <!-- ── Multi-player layout (>2 players) ── -->
      <div class="flex-grow min-h-0 box-border p-[20px_24px] flex gap-5">

        <!-- Player list -->
        <div class="flex-[13] min-w-0 flex flex-col gap-3">
          {#each players as player, i}
            <div class="flex-1 min-h-0">
              <PlayerListRow
                {player}
                playerIndex={i}
                game={gameRecord}
                {view}
                isActive={currentPlayer === i && winner === null}
                isWinner={winner === i}
                isNext={i === nextPlayer && i !== currentPlayer}
                isLeading={i === leadingPlayerIndex && i !== currentPlayer && i !== nextPlayer}
              />
            </div>
          {/each}
        </div>

        <!-- Board/Entry + controls column -->
        <div class="flex-[10] min-w-[380px] flex-shrink-0 flex flex-col gap-3">
          {#if viewMode === 'entry'}
            <DartEntryPanel onDart={isActive ? addManualDart : () => {}} dartCount={currentDarts.length} />
          {:else}
            <DartBoard darts={currentDarts} selectedSegments={highlights} playerMarkers={boardMarkers}
              onSegmentClick={isActive ? addManualDart : undefined} />
            <div class="flex gap-5 text-[12px] text-text-dim justify-center">
              <span class="flex items-center gap-[6px]">
                <span class="w-[9px] h-[9px] rounded-full bg-accent shrink-0"></span>
                Current target
              </span>
              {#if settings.showMarkers}
                <span class="flex items-center gap-[6px]">
                  <span class="w-[9px] h-[9px] rounded-full bg-white shrink-0"></span>
                  Others' targets
                </span>
              {/if}
            </div>
          {/if}

          <CorrectionPanel darts={dartItems} hits={visitHits} onCorrect={handleCorrect} onUndo={undo}
            ontakeout={() => sessionStore?.send({ type: 'takeout' })} {showVisitScore} {bust} />
        </div>
      </div>

    {:else}
      <!-- ── 1-2 player layout ── -->
      <div class="flex-grow min-h-0 box-border p-[20px_24px] flex gap-5">

        <!-- Player 0 -->
        <div class="flex-1 min-w-0">
          {#if players[0]}
            <PlayerCard
              player={players[0]}
              playerIndex={0}
              game={gameRecord}
              {view}
              isActive={currentPlayer === 0 && winner === null}
              isWinner={winner === 0}
              previousVisits={perPlayerVisits[0] ?? []}
            />
          {/if}
        </div>

        <!-- Board/Entry + correction panel column -->
        <div class="flex-1 min-w-[380px] flex flex-col items-center gap-3">
          {#if viewMode === 'entry'}
            <div class="w-full">
              <DartEntryPanel onDart={isActive ? addManualDart : () => {}} dartCount={currentDarts.length} />
            </div>
          {:else}
            <div class="w-full" style="max-width: min(100%, calc(100vh - 340px))">
              <DartBoard darts={currentDarts} selectedSegments={highlights}
                onSegmentClick={isActive ? addManualDart : undefined} />
            </div>
          {/if}

          <!-- ATC target legend (2-player, board view only) -->
          {#if atcTargets && viewMode === 'board'}
            <div class="flex items-center justify-center gap-5 text-[12px]">
              {#each atcTargets as p}
                <span class="flex items-center gap-[6px]">
                  {#if p.isActive}
                    <span class="w-[9px] h-[9px] rounded-full bg-accent shrink-0"></span>
                  {:else}
                    <span class="w-[9px] h-[9px] rounded-full border border-line-3 shrink-0"></span>
                  {/if}
                  <span class="text-text-muted">{p.name}</span>
                  <span class="text-text-dim">·</span>
                  <span class="font-semibold text-text">{p.label}</span>
                </span>
              {/each}
            </div>
          {/if}

          <CorrectionPanel darts={dartItems} hits={visitHits} onCorrect={handleCorrect} onUndo={undo}
            ontakeout={() => sessionStore?.send({ type: 'takeout' })} {showVisitScore} {bust} />
        </div>

        <!-- Player 1 -->
        <div class="flex-1 min-w-0">
          {#if players[1]}
            <PlayerCard
              player={players[1]}
              playerIndex={1}
              game={gameRecord}
              {view}
              isActive={currentPlayer === 1 && winner === null}
              isWinner={winner === 1}
              previousVisits={perPlayerVisits[1] ?? []}
            />
          {/if}
        </div>
      </div>
    {/if}

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
