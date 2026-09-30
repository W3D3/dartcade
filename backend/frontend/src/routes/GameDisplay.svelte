<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { push } from 'svelte-spa-router'
  import ConfirmModal from '../lib/components/ConfirmModal.svelte'
  import { createSessionStore, type Snapshot } from '../lib/ws.js'
  import { getGameView } from '../lib/gameViews/index.js'
  import DartBoard from '../lib/components/DartBoard.svelte'
  import DartEntryPanel from '../lib/components/DartEntryPanel.svelte'
  import GameHeader from '../lib/components/GameHeader.svelte'
  import BullOffPanel from '../lib/components/BullOffPanel.svelte'
  import BoardLegend from '../lib/components/BoardLegend.svelte'
  import VisitBand from '../lib/components/VisitBand.svelte'
  import DartSlots from '../lib/components/DartSlots.svelte'
  import ControlBar from '../lib/components/ControlBar.svelte'
  import X01Panel from '../lib/components/X01Panel.svelte'
  import AtcPanel from '../lib/components/AtcPanel.svelte'
  import X01Row from '../lib/components/X01Row.svelte'
  import AtcRow from '../lib/components/AtcRow.svelte'
  import type { PillKind } from '../lib/components/pills.js'
  import { loadSettings, saveSettings, type GameSettings } from '../lib/gameSettings.js'
  import { createSounds } from '../lib/sounds.js'
  import { emptyHistory, trackVisits, type VisitHistory } from '../lib/visitHistory.js'
  import { x01Slots, atcSlots } from '../lib/dartSlots.js'
  import { gameState } from '../lib/gameState.js'
  import { x01Band, atcBand, atcAdvanced, bigDartIndex } from '../lib/visitBand.js'
  import { nextButton } from '../lib/controls.js'
  import { x01Player, atcPlayer } from '../lib/playerStats.js'
  import { atcTargetSegment, atcLeaders } from '../lib/atc.js'
  import { labelToSegment } from '../lib/dartUtils.js'
  import { api, type Segment, type UserAction } from '$lib/api'
  import type { AtcGame, X01Game } from '$lib/api/game-ws'

  // ── Settings and sound ────────────────────────────────────────────────────
  let settings = $state<GameSettings>(loadSettings(typeof localStorage === 'undefined' ? null : localStorage))
  $effect(() => { saveSettings(localStorage, settings) })
  const sounds = createSounds(() => settings.volume)

  // ── Session ───────────────────────────────────────────────────────────────
  let sessionId = $state('')
  let sessionStore: ReturnType<typeof createSessionStore> | null = null
  let snapshot = $state<Snapshot | null>(null)
  let history = $state.raw<VisitHistory>(emptyHistory())
  let unsubSnap: (() => void) | null = null

  let viewMode = $state<'board' | 'entry'>('board')
  let viewModeSetByUser = false
  let showEndConfirm = $state(false)
  /** Dart open in the correction popover; also highlighted on the board. */
  let correcting = $state<number | null>(null)

  onMount(() => {
    sessionId = window.location.hash.match(/\/session\/([^/]+)/)?.[1] ?? ''
    if (!sessionId) return
    sessionStore = createSessionStore(sessionId)
    unsubSnap = sessionStore.snapshot.subscribe(snap => {
      if (!snap) { snapshot = null; return }
      // Boardless sessions start on the keypad (once)
      if (!viewModeSetByUser && snap.boardId === null) { viewMode = 'entry'; viewModeSetByUser = true }
      const next = gameState(snap)
      const g = next.x01 ?? next.atc
      if (g) {
        const prev = gameState(snapshot)
        const pg = prev.x01 ?? prev.atc
        if (pg) playSounds(pg, g)
        history = trackVisits(history, g)
      }
      snapshot = snap
    })
  })
  onDestroy(() => { unsubSnap?.(); sessionStore?.destroy() })

  function playSounds(before: X01Game | AtcGame, after: X01Game | AtcGame) {
    const oldCount = before.currentVisitDarts.length
    const now = after.currentVisitDarts
    const bustNow = 'bustThisVisit' in after && after.bustThisVisit
    const bustBefore = 'bustThisVisit' in before && before.bustThisVisit
    if (bustNow && !bustBefore) {
      if (settings.soundBust) sounds.bust()
    } else if (now.length > oldCount) {
      const i = now.length - 1
      const hit = 'currentVisitHits' in after ? after.currentVisitHits.at(i) === true : (now.at(i)?.score ?? 0) > 0
      if (hit && settings.soundHit) sounds.hit()
      if (!hit && settings.soundMiss) sounds.miss()
    } else if (after.currentPlayer !== before.currentPlayer && settings.soundSwitch) {
      sounds.switchPlayer()
    }
  }

  // ── Game state ────────────────────────────────────────────────────────────
  const gameId = $derived(snapshot?.gameId ?? '')
  const boardId = $derived(snapshot?.boardId ?? null)
  const players = $derived(snapshot?.players ?? [])
  // The snapshot's game narrowed by game id; both null for a game this page doesn't know
  const current = $derived(gameState(snapshot))
  const x01 = $derived(current.x01)
  const atc = $derived(current.atc)
  const game = $derived(x01 ?? atc)
  const isX01 = $derived(x01 !== null)
  const view = $derived(getGameView(gameId))
  const currentPlayer = $derived(game?.currentPlayer ?? 0)
  const winner = $derived(game?.winner ?? null)
  const isActive = $derived(winner === null)
  const darts = $derived(game?.currentVisitDarts ?? [])
  const hits = $derived(atc?.currentVisitHits ?? [])
  const bust = $derived(x01?.bustThisVisit === true)
  // The visit is over (bust, checkout, win): no more darts until the next player
  const locked = $derived(x01?.visitLocked === true || winner !== null)
  const bullOff = $derived(x01?.phase === 'bulloff' ? x01.bullOff : null)
  const layout = $derived(players.length === 1 ? 'solo' : players.length === 2 ? 'duel' : 'party')
  const nextPlayer = $derived((currentPlayer + 1) % Math.max(players.length, 1))

  const x01Players = $derived(x01
    ? players.map((_, i) => x01Player(x01, i, history, { active: i === currentPlayer && isActive, suggest: settings.checkoutSuggestions, bust: i === currentPlayer && bust }))
    : [])
  const atcPlayers = $derived(atc ? players.map((_, i) => atcPlayer(atc, i)) : [])
  const leaders = $derived(atcLeaders(atc?.hitCounts ?? []))

  // ── Center column ─────────────────────────────────────────────────────────
  const outMode = $derived(x01?.config.outMode ?? 'double')
  const slots = $derived(isX01
    ? x01Slots({
        darts, outMode, bust,
        remaining: x01Players[currentPlayer]?.remaining ?? 0,
        opened: x01Players[currentPlayer]?.opened ?? true,
        suggest: settings.checkoutSuggestions && isActive,
      })
    : atcSlots({
        darts, hits, target: isActive ? atcPlayers[currentPlayer]?.target ?? null : null,
        multiplierAdvances: atc?.cfg.multiplierAdvances === true,
      }))

  const hitCount = $derived(atc?.hitCounts.at(currentPlayer) ?? 0)
  const visitStart = $derived(history.start.at(currentPlayer) ?? null)
  const band = $derived(isX01
    ? x01Band({
        darts, bust,
        left: x01Players[currentPlayer]?.remaining ?? 0,
        // What the engine actually took off, when the visit's start is known
        scored: !bust && visitStart !== null ? visitStart - (x01Players[currentPlayer]?.remaining ?? 0) : undefined,
      })
    : atcBand({
        dartCount: darts.length,
        advanced: atcAdvanced(hitCount, visitStart, hits),
        target: atcPlayers[currentPlayer]?.target ?? '',
      }))
  const popIndex = $derived(isX01 ? bigDartIndex(darts, { opened: x01Players[currentPlayer]?.opened ?? true, bust }) : null)

  const sequence = $derived(atc?.sequence ?? [])
  const targets = $derived(atc?.targets ?? [])
  const checkoutTargets = $derived(slots.filter(s => s.kind === 'suggested-next' || s.kind === 'suggested-later').map(s => s.label))
  const boardTarget = $derived(!isX01 && isActive ? atcTargetSegment(sequence, targets.at(currentPlayer)) : null)
  const boardNext = $derived(!isX01 && isActive && layout === 'duel' ? atcTargetSegment(sequence, targets.at(nextPlayer)) : null)
  const markers = $derived(!isX01 && isActive && layout === 'party' && settings.showMarkers
    ? players.map((p, i) => ({
        initial: p.name.trim().charAt(0).toUpperCase() || '?',
        segment: atcTargetSegment(sequence, targets.at(i)) ?? 0,
        isActive: i === currentPlayer,
      })).filter(m => m.segment > 0)
    : [])
  const legend = $derived.by((): { label: string; kind: 'current' | 'next' | 'others' }[] => {
    if (isX01 || !isActive || layout === 'solo') return []
    if (layout === 'party') return settings.showMarkers
      ? [{ label: 'Current target', kind: 'current' }, { label: "Others' targets", kind: 'others' }]
      : [{ label: 'Current target', kind: 'current' }]
    return [
      { label: `${players[currentPlayer]?.name} · ${atcPlayers[currentPlayer]?.target}`, kind: 'current' },
      { label: `${players[nextPlayer]?.name} · ${atcPlayers[nextPlayer]?.target}`, kind: 'next' },
    ]
  })

  function pillFor(i: number, rows: boolean): PillKind | null {
    if (winner === i) return 'winner'
    if (!isActive) return null
    if (layout === 'solo') return 'practice'
    if (i === currentPlayer) return 'throwing'
    if (rows && leaders.includes(i)) return 'leading'
    return i === nextPlayer ? 'up-next' : null
  }

  // Party rows: the X01 thrower's row is taller; rows keep a minimum height and scroll
  const rowTemplate = $derived(players
    .map((_, i) => (!isX01 ? 'minmax(110px, 1fr)' : isActive && i === currentPlayer ? 'minmax(150px, 1.55fr)' : 'minmax(96px, 1fr)'))
    .join(' '))

  // ── Actions ───────────────────────────────────────────────────────────────
  const send = (action: UserAction) => sessionStore?.send(action)
  const undo = () => send({ type: 'undo_dart' })
  const advance = () => send({ type: 'takeout' })
  const next = $derived(nextButton({ manual: boardId === null, dartCount: darts.length, locked, active: isActive }))
  const addManualDart = (segment: Segment) => send({ type: 'add_dart', segment })
  // Clicking the board keeps the exact spot, so the dart shows where it landed
  const addBoardDart = (hit: { segment: Segment; coords: { x: number; y: number } }) =>
    send({ type: 'add_dart', segment: hit.segment, coords: hit.coords })
  const correct = (dartIndex: number, label: string) =>
    send({ type: 'correct_dart', visitIndex: dartIndex, segment: labelToSegment(label) })
  // Any dart of the open visit can be dragged on the board to correct it
  const moveDart = (dartIndex: number, hit: { segment: Segment; coords: { x: number; y: number } }) =>
    send({ type: 'correct_dart', visitIndex: dartIndex, segment: hit.segment, coords: hit.coords })

  function setViewMode(m: 'board' | 'entry') {
    viewMode = m
    viewModeSetByUser = true
  }

  async function endSession() {
    if (!sessionId) return
    await api.DELETE('/api/sessions/{id}', { params: { path: { id: sessionId } } })
    void push('/')
  }
</script>

{#snippet center(variant: 'solo' | 'duel' | 'party')}
  {#if viewMode === 'entry'}
    <div class="flex-1 min-h-0 overflow-y-auto">
      <DartEntryPanel onDart={isActive ? addManualDart : () => {}} dartCount={darts.length} {locked} />
    </div>
  {:else}
    <!-- The board takes the height the column has left (capped by its width) -->
    <div class="flex-1 min-h-0 w-full [container-type:size] flex items-center justify-center">
      <div class="aspect-square" style="width: min(100cqw, 100cqh)">
        <DartBoard {darts} dim={!isX01} target={boardTarget} nextTarget={boardNext} playerMarkers={markers}
          checkoutTargets={isActive ? checkoutTargets : []}
          onBoardClick={isActive && !locked ? addBoardDart : undefined}
          selectedDart={correcting} onDartMove={isActive ? moveDart : undefined} />
      </div>
    </div>
    {#if legend.length}<BoardLegend items={legend} />{/if}
  {/if}

  {#if variant === 'solo'}
    <div class="grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)] gap-[10px] items-start">
      <DartSlots {slots} {popIndex} onCorrect={correct} bind:openDart={correcting} />
      {#if settings.visitSum}<VisitBand {band} compact />{/if}
    </div>
  {:else}
    {#if settings.visitSum}<VisitBand {band} />{/if}
    <DartSlots {slots} {popIndex} onCorrect={correct} bind:openDart={correcting} />
  {/if}

  <ControlBar canUndo={isActive && darts.length > 0} label={next.label} prominent={next.prominent} enabled={next.enabled}
    onUndo={undo} onNext={advance} />
{/snippet}

{#snippet panel(i: number)}
  {#if isX01}
    <X01Panel name={players[i]?.name ?? ''} p={x01Players[i]} active={i === currentPlayer && isActive}
      solo={layout === 'solo'} pill={pillFor(i, false)} chalkboard={settings.chalkboard} />
  {:else}
    <AtcPanel name={players[i]?.name ?? ''} p={atcPlayers[i]} active={i === currentPlayer && isActive}
      solo={layout === 'solo'} pill={pillFor(i, false)} />
  {/if}
{/snippet}

<div class="flex flex-col h-screen bg-bg text-text overflow-hidden">
  {#if !snapshot}
    <div class="flex-1 flex items-center justify-center">
      <span class="text-text-muted text-lg">Connecting…</span>
    </div>
  {:else}
    <GameHeader
      title={bullOff ? 'Bull-off' : view.title}
      meta={bullOff ? `Who throws first in ${view.title}` : view.meta(snapshot)}
      showViewToggle={!bullOff}
      {sessionId} {boardId} {gameId} bmStatus={snapshot.bmStatus} {viewMode}
      canEnd={winner === null}
      bind:settings
      onleave={() => push('/')}
      onend={() => showEndConfirm = true}
      onviewmode={setViewMode}
    />

    {#if bullOff}
      <BullOffPanel {players} {bullOff} manual={boardId === null} {send} />

    {:else if !game}
      <main class="flex-grow flex items-center justify-center">
        <p class="text-text-muted">Unsupported game</p>
      </main>

    {:else if layout === 'solo'}
      <main class="flex-grow min-h-0 box-border px-7 py-6 flex gap-6">
        {@render panel(0)}
        <div class="flex-1 min-w-[380px] min-h-0 flex flex-col gap-3">{@render center('solo')}</div>
      </main>

    {:else if layout === 'duel'}
      <main class="flex-grow min-h-0 box-border px-7 py-6 flex gap-6">
        {@render panel(0)}
        <div class="w-[560px] shrink-0 min-h-0 flex flex-col gap-3">{@render center('duel')}</div>
        {@render panel(1)}
      </main>

    {:else}
      <main class="flex-grow min-h-0 box-border px-7 py-6 flex gap-6">
        <div class="flex-1 min-w-0 min-h-0 grid gap-3 overflow-y-auto" style:grid-template-rows={rowTemplate}>
          {#each players as player, i (i)}
            {#if isX01}
              <X01Row name={player.name} p={x01Players[i]} active={i === currentPlayer && isActive} pill={pillFor(i, true)} />
            {:else}
              <AtcRow name={player.name} p={atcPlayers[i]} active={i === currentPlayer && isActive} pill={pillFor(i, true)} />
            {/if}
          {/each}
        </div>
        <aside class="w-[480px] shrink-0 min-h-0 flex flex-col gap-3" aria-label="Board">{@render center('party')}</aside>
      </main>
    {/if}

    <!-- Winner overlay (unchanged; a designed win state is out of scope) -->
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
