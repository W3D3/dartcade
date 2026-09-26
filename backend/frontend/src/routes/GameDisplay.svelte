<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { push } from 'svelte-spa-router'
  import ConfirmModal from '../lib/components/ConfirmModal.svelte'
  import { createSessionStore } from '../lib/ws.js'
  import { getGameView } from '../lib/gameViews/index.js'
  import DartBoard from '../lib/components/DartBoard.svelte'
  import PlayerCard from '../lib/components/PlayerCard.svelte'
  import PlayerListRow from '../lib/components/PlayerListRow.svelte'
  import CorrectionPanel from '../lib/components/CorrectionPanel.svelte'
  import { Badge } from '../lib/components/ui/badge/index.js'
  import { parseLabel } from '../lib/dartUtils.js'
  import BoardStatusPanel from '../lib/components/BoardStatusPanel.svelte'
  import GameSettingsPanel from '../lib/components/GameSettingsPanel.svelte'
  import { defaultSettings, type GameSettings } from '../lib/gameSettings.js'

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
  let showSettings = $state(false)
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
      const oldCount = prevDartCount
      const oldPlayer = prevCurrentPlayer
      updateVisitHistory(snap)
      if (settings.soundHit || settings.soundMiss || settings.soundSwitch) playSoundEvents(snap, oldCount, oldPlayer)
      snapshot = snap
    })
  })
  onDestroy(() => { unsubSnap?.(); sessionStore?.destroy() })

  function playSoundEvents(snap: import('../lib/ws.js').Snapshot, oldCount: number, oldPlayer: number) {
    const newDarts = (snap.game.currentVisitDarts ?? []) as any[]
    const newPlayer = snap.game.currentPlayer as number
    if (newDarts.length > oldCount) {
      const idx = newDarts.length - 1
      const hits = snap.game.currentVisitHits as boolean[] | undefined
      // Use per-dart hit tracking when available (ATC: true only if dart hit the target).
      // Fall back to score > 0 for games that don't populate currentVisitHits.
      const isHit = hits !== undefined ? hits[idx] === true : (newDarts[idx]?.score ?? 0) > 0
      if (isHit) { if (settings.soundHit) soundHit() }
      else { if (settings.soundMiss) soundMiss() }
    } else if (newPlayer !== oldPlayer) {
      if (settings.soundSwitch) soundSwitch()
    }
  }

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

  const gameId        = $derived(snapshot?.gameId ?? '')
  const players       = $derived(snapshot?.players ?? [])
  const game          = $derived(snapshot?.game ?? {})
  const currentPlayer = $derived((game.currentPlayer as number) ?? 0)
  const winner        = $derived((game.winner as number | null) ?? null)
  const currentDarts  = $derived((game.currentVisitDarts as any[]) ?? [])
  const visitHits     = $derived((game.currentVisitHits as boolean[] | undefined))
  const view          = $derived(getGameView(gameId))
  const highlights    = $derived(view.getBoardHighlights(game, currentPlayer))
  const subtitle      = $derived(view.getSubtitle?.(game, players.length) ?? '')
  const isMultiPlayer  = $derived(players.length > 2)
  const showVisitScore = $derived(view.showVisitScore ?? true)
  const bmStatus       = $derived(snapshot?.bmStatus ?? null)
  const bust           = $derived(!!(game.bustThisVisit))

  const dartItems = $derived(currentDarts.map((d: any) => ({
    label: d.segment?.name ?? 'Miss',
    score: d.score ?? 0,
  })))

  // Board markers: each player's target position (active player's shown as overlay, others as dots)
  const boardMarkers = $derived(
    isMultiPlayer && settings.showMarkers
      ? players.map((p, i) => ({
          initial: p.name?.[0]?.toUpperCase() ?? '?',
          segment: view.getBoardHighlights(game, i)[0] ?? 0,
          isActive: i === currentPlayer && winner === null,
        })).filter(m => m.segment > 0)
      : []
  )

  // Next player in rotation
  const nextPlayer = $derived((currentPlayer + 1) % Math.max(players.length, 1))

  // Player furthest ahead (highest hitCount) — ATC-specific, -1 if unavailable
  const leadingPlayerIndex = $derived((() => {
    const hitCounts = game.hitCounts as number[] | undefined
    if (!hitCounts || hitCounts.length === 0) return -1
    let maxHits = -1, leadIdx = -1
    hitCounts.forEach((h, i) => { if (h > maxHits) { maxHits = h; leadIdx = i } })
    return leadIdx
  })())

  // 2-player: ATC center legend
  const atcTargets = $derived(
    !isMultiPlayer && (game.targets as number[] | undefined) && players.length > 0
      ? (game.targets as number[]).map((t, i) => ({
          name: players[i]?.name ?? `Player ${i + 1}`,
          label: t === 22 ? 'Bull' : t === 21 ? '25' : t > 22 ? '✓' : String(t),
          isActive: i === currentPlayer,
        }))
      : null
  )

  function undo() { sessionStore?.send({ type: 'undo_dart' }) }

  function handleCorrect(dartIndex: number, label: string) {
    let segment: { name: string; number: number; bed: string; multiplier: number }
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
    <header class="h-16 flex-shrink-0 box-border px-6 flex items-center gap-5
                   border-b border-line bg-surface-1">
      <button type="button" onclick={leaveSession}
        class="flex items-center gap-2 h-9 px-3 border border-line-3 rounded-[8px]
               text-[#8a8e83] text-[13px] font-medium bg-transparent cursor-pointer shrink-0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6"/>
        </svg>
        Leave
      </button>

      <div class="flex flex-col justify-center min-w-0">
        <h1 class="m-0 font-display font-bold text-[22px] uppercase tracking-[0.05em] leading-none">
          {view.title}
        </h1>
        {#if subtitle}
          <span class="text-[12px] text-text-dim leading-none mt-[3px] truncate">{subtitle}</span>
        {/if}
      </div>

      <div class="ml-auto flex items-center gap-3 shrink-0">
        {#if winner === null}
          <button type="button" onclick={() => showEndConfirm = true}
            class="flex items-center gap-2 h-9 px-3 border border-line-3 rounded-[8px]
                   text-live-text text-[13px] font-medium bg-transparent cursor-pointer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
            End
          </button>
        {/if}
        <Badge variant="live">LIVE</Badge>
        <BoardStatusPanel {sessionId} {bmStatus} />

        <!-- Settings cog -->
        <div class="relative">
          <button type="button"
            onclick={() => showSettings = !showSettings}
            aria-label="Game settings"
            class="flex items-center justify-center w-9 h-9 rounded-[8px] border border-line-3
                   {showSettings ? 'bg-surface-2 text-text' : 'bg-transparent text-[#8a8e83]'}
                   cursor-pointer transition-colors hover:bg-surface-2 hover:text-text">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          {#if showSettings}
            <GameSettingsPanel
              {settings}
              onchange={s => { settings = s }}
              onclose={() => showSettings = false}
            />
          {/if}
        </div>
      </div>
    </header>

    {#if isMultiPlayer}
      <!-- ── Multi-player layout (>2 players) ── -->
      <div class="flex-grow min-h-0 box-border p-[20px_24px] flex gap-5">

        <!-- Player list: rows stretch to fill full height -->
        <div class="flex-[13] min-w-0 flex flex-col gap-3">
          {#each players as player, i}
            <div class="flex-1 min-h-0">
              <PlayerListRow
                {player}
                playerIndex={i}
                {game}
                {view}
                isActive={currentPlayer === i && winner === null}
                isWinner={winner === i}
                isNext={i === nextPlayer && i !== currentPlayer}
                isLeading={i === leadingPlayerIndex && i !== currentPlayer && i !== nextPlayer}
              />
            </div>
          {/each}
        </div>

        <!-- Board + controls column -->
        <div class="flex-[10] min-w-[380px] flex-shrink-0 flex flex-col gap-3">
          <DartBoard darts={currentDarts} selectedSegments={highlights} playerMarkers={boardMarkers} />

          <!-- Legend -->
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
              {game}
              {view}
              isActive={currentPlayer === 0 && winner === null}
              isWinner={winner === 0}
              previousVisits={perPlayerVisits[0] ?? []}
            />
          {/if}
        </div>

        <!-- Board + correction panel column: flex-1 so it scales with available space.
             Board SVG is capped by viewport height so it never overflows vertically. -->
        <div class="flex-1 min-w-[380px] flex flex-col items-center gap-3">
          <div class="w-full" style="max-width: min(100%, calc(100vh - 340px))">
            <DartBoard darts={currentDarts} selectedSegments={highlights} />
          </div>

          <!-- ATC target legend (2-player) -->
          {#if atcTargets}
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
              {game}
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
