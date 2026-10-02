<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { push } from 'svelte-spa-router'
  import ConfirmModal from '../lib/components/ConfirmModal.svelte'
  import { createSessionStore, type Snapshot } from '../lib/ws.js'
  import { getGameView } from '../lib/gameViews/index.js'
  import DartBoard from '../lib/components/DartBoard.svelte'
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
  import { activeSessionId } from '$lib/activeSession'
  import { isPhone } from '$lib/viewport'
  import { matchLayout } from '$lib/matchLayout'
  import { isMyTurn, upSeat } from '$lib/turn'
  import PhonePlayerRow from '../lib/components/PhonePlayerRow.svelte'
  import PhoneX01Card from '../lib/components/PhoneX01Card.svelte'
  import PhoneAtcCard from '../lib/components/PhoneAtcCard.svelte'
  import DartKeypad from '../lib/components/DartKeypad.svelte'
  import type { AtcGame, X01Game } from '$lib/api/game-ws'
  import { authClient } from '$lib/auth'
  import { centerState, myBoard, rowSub, seatLines } from '$lib/remote'

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
  // The signed-in user: the host gets Abort while the game waits for someone
  let viewerId = $state<string | null>(null)

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
    authClient.getSession().then(r => { viewerId = r.data?.user.id ?? null }).catch(() => undefined)
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
  $effect(() => { if (snapshot && snapshot.status !== 'active') void activeSessionId.refresh() })
  // Online: only the seat's controller enters its darts (a local game's owner controls every seat)
  const myTurn = $derived(isMyTurn(snapshot))
  const canThrow = $derived(isActive && myTurn)
  const throwerName = $derived(snapshot ? players[upSeat(snapshot)]?.name ?? '' : '')
  // Remote games: what the centre shows when it isn't your turn, and where each seat throws
  const remote = $derived(centerState(snapshot, viewerId))
  const lines = $derived(seatLines(snapshot))
  const darts = $derived(game?.currentVisitDarts ?? [])
  const hits = $derived(atc?.currentVisitHits ?? [])
  const bust = $derived(x01?.bustThisVisit === true)
  // The visit is over (bust, checkout, win): no more darts until the next player
  const locked = $derived(x01?.visitLocked === true || winner !== null)
  const bullOff = $derived(x01?.phase === 'bulloff' ? x01.bullOff : null)
  const layout = $derived(matchLayout(players.length, $isPhone))
  const nextPlayer = $derived((currentPlayer + 1) % Math.max(players.length, 1))
  // On a phone the players stay in seat order; when the turn passes, keep the thrower in view
  let phonePlayers = $state<HTMLDivElement | undefined>()
  // Changes when the turn passes or the view switches; the thrower's entry carries it
  const upKey = $derived(`${currentPlayer}-${viewMode}`)
  $effect(() => {
    phonePlayers?.querySelector(`[data-up="${upKey}"]`)?.scrollIntoView({ block: 'nearest' })
  })

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
  const boardNext = $derived(!isX01 && isActive && players.length === 2 ? atcTargetSegment(sequence, targets.at(nextPlayer)) : null)
  const markers = $derived(!isX01 && isActive && players.length > 2 && settings.showMarkers
    ? players.map((p, i) => ({
        initial: p.name.trim().charAt(0).toUpperCase() || '?',
        segment: atcTargetSegment(sequence, targets.at(i)) ?? 0,
        isActive: i === currentPlayer,
      })).filter(m => m.segment > 0)
    : [])
  const legend = $derived.by((): { label: string; kind: 'current' | 'next' | 'others' }[] => {
    if (isX01 || !isActive || players.length === 1) return []
    if (players.length > 2) return settings.showMarkers
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
    if (players.length === 1) return 'practice'
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
  const next = $derived(nextButton({ manual: boardId === null, dartCount: darts.length, locked, active: canThrow }))
  const addManualDart = (segment: Segment) => send({ type: 'add_dart', segment })
  // Clicking the board keeps the exact spot, so the dart shows where it landed
  const addBoardDart = (hit: { segment: Segment; coords: { x: number; y: number } }) =>
    send({ type: 'add_dart', segment: hit.segment, coords: hit.coords })
  // Phone keypad: with a thrown dart selected, the key replaces it; otherwise it adds a dart
  function keypadDart(segment: Segment) {
    if (correcting === null) { addManualDart(segment); return }
    send({ type: 'correct_dart', visitIndex: correcting, segment })
    correcting = null
  }
  const correct = (dartIndex: number, label: string) => canThrow &&
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
    void activeSessionId.refresh()
    void push('/')
  }
</script>

{#snippet waiting()}
  {#if isActive && !myTurn}
    <p role="status" class="shrink-0 m-0 h-9 flex items-center justify-center gap-2 rounded-[10px] bg-surface-panel border border-line-2 text-[14px] text-text-muted">
      <span class="w-2 h-2 rounded-full bg-accent animate-pulse" aria-hidden="true"></span>
      <strong class="text-text font-semibold">{throwerName}</strong> is throwing
    </p>
  {/if}
{/snippet}

{#snippet phoneCenter()}
  {@render waiting()}
  <!-- Phones: everything fits without scrolling; the board or keypad takes what's left -->
  {#if viewMode === 'board'}
    <div class="flex-1 min-h-[160px] w-full [container-type:size] flex items-center justify-center">
      <div class="aspect-square" style="width: min(100cqw, 100cqh)">
        <DartBoard {darts} dim={!isX01} target={boardTarget} nextTarget={boardNext} playerMarkers={markers}
          checkoutTargets={isActive ? checkoutTargets : []}
          onBoardClick={canThrow && !locked ? addBoardDart : undefined}
          selectedDart={correcting} onDartMove={canThrow ? moveDart : undefined} />
      </div>
    </div>
  {/if}
  <!-- relative: the board view's correction picker opens above this row, over the board, full width -->
  <div class="relative shrink-0 grid gap-2 items-start {settings.visitSum ? 'grid-cols-[minmax(0,3fr)_minmax(0,1fr)]' : 'grid-cols-1'}">
    <DartSlots {slots} {popIndex} onCorrect={correct} bind:openDart={correcting} showPopover={viewMode === 'board'} popoverAbove />
    {#if settings.visitSum}<VisitBand {band} compact />{/if}
  </div>
  {#if viewMode === 'entry'}
    <div class="flex-1 min-h-[220px]">
      <DartKeypad onDart={canThrow ? keypadDart : () => {}} dartCount={darts.length} {locked} replacing={correcting} disabled={!canThrow}
        canUndo={canThrow && darts.length > 0} onUndo={undo}
        nextLabel={next.label} nextEnabled={next.enabled} nextProminent={next.prominent} onNext={advance} />
    </div>
  {:else}
    <ControlBar compact canUndo={canThrow && darts.length > 0} label={next.label} prominent={next.prominent} enabled={next.enabled}
      onUndo={undo} onNext={advance} />
  {/if}
{/snippet}

{#snippet center(variant: 'solo' | 'duel' | 'party')}
  {@render waiting()}
  {#if viewMode === 'entry'}
    <div class="flex-1 min-h-0">
      <DartKeypad onDart={canThrow ? addManualDart : () => {}} dartCount={darts.length} {locked} disabled={!canThrow}
        canUndo={canThrow && darts.length > 0} onUndo={undo}
        nextLabel={next.label} nextEnabled={next.enabled} nextProminent={next.prominent} onNext={advance} />
    </div>
  {:else}
    <!-- The board takes the height the column has left (capped by its width) -->
    <div class="flex-1 min-h-0 w-full [container-type:size] flex items-center justify-center">
      <div class="aspect-square" style="width: min(100cqw, 100cqh)">
        <DartBoard {darts} dim={!isX01} target={boardTarget} nextTarget={boardNext} playerMarkers={markers}
          checkoutTargets={isActive ? checkoutTargets : []}
          onBoardClick={canThrow && !locked ? addBoardDart : undefined}
          selectedDart={correcting} onDartMove={canThrow ? moveDart : undefined} />
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

  {#if viewMode === 'board'}
    <ControlBar canUndo={canThrow && darts.length > 0} label={next.label} prominent={next.prominent} enabled={next.enabled}
      onUndo={undo} onNext={advance} />
  {/if}
{/snippet}

{#snippet panel(i: number)}
  {#if isX01}
    <X01Panel name={players[i]?.name ?? ''} p={x01Players[i]} active={i === currentPlayer && isActive}
      solo={layout === 'solo'} pill={pillFor(i, false)} seat={lines[i] ?? null} chalkboard={settings.chalkboard} />
  {:else}
    <AtcPanel name={players[i]?.name ?? ''} p={atcPlayers[i]} active={i === currentPlayer && isActive}
      solo={layout === 'solo'} pill={pillFor(i, false)} seat={lines[i] ?? null} />
  {/if}
{/snippet}

<div class="flex flex-col h-dvh bg-bg text-text overflow-hidden">
  {#if !snapshot}
    <div class="flex-1 flex items-center justify-center">
      <span class="text-text-muted text-lg">Connecting…</span>
    </div>
  {:else}
    <GameHeader
      title={bullOff ? 'Bull-off' : view.title}
      meta={bullOff ? `Who throws first in ${view.title}` : view.meta(snapshot)}
      showViewToggle={!bullOff}
      {sessionId} {boardId} {gameId} bmStatus={snapshot.bmStatus} {viewMode} compact={$isPhone}
      lobbyName={snapshot.lobbyName} paused={remote.kind === 'waiting'} myBoard={myBoard(snapshot)}
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

    {:else if layout === 'phone'}
      <main class="flex-grow min-h-0 overflow-hidden box-border px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] flex flex-col gap-2">
        <!-- Everyone in seat order; the thrower's entry is the active one (card on the board, a row with the keypad).
             Many players scroll, and the thrower is kept in view. -->
        <div bind:this={phonePlayers} class="shrink-0 max-h-[55%] overflow-y-auto flex flex-col gap-2">
          {#each players as player, i (i)}
            {@const up = i === currentPlayer}
            {@const line = lines[i] ?? null}
            <div data-up={up ? upKey : undefined}
              class={!up && viewMode === 'entry' ? '[@media(max-height:599px)]:hidden' : ''}>
              {#if up && viewMode === 'board'}
                {#if isX01}
                  <PhoneX01Card name={player.name} p={x01Players[i]} pill={pillFor(i, false)} seat={line} chalkboard={settings.chalkboard} />
                {:else}
                  <PhoneAtcCard name={player.name} p={atcPlayers[i]} pill={pillFor(i, false)} seat={line} />
                {/if}
              {:else if isX01}
                <PhonePlayerRow active={up} name={player.name} you={line?.you ?? false} pill={up ? null : pillFor(i, true)}
                  sub={rowSub(up ? (x01Players[i]?.canFinish ? `Throwing · can finish ${x01Players[i]?.canFinish}` : 'Throwing')
                    : i === nextPlayer ? (x01Players[i]?.canFinish ? `Up next · can finish ${x01Players[i]?.canFinish}` : 'Up next') : `Avg ${x01Players[i]?.avg ?? '0.0'}`, line)}
                  valueLabel="Left" value={String(x01Players[i]?.remaining ?? '')}
                  legs={{ total: x01Players[i]?.firstTo ?? 1, won: x01Players[i]?.legsWon ?? 0 }} />
              {:else}
                <PhonePlayerRow active={up} name={player.name} you={line?.you ?? false} pill={up ? null : pillFor(i, true)}
                  sub={rowSub(up ? `${atcPlayers[i]?.done ?? 0} of ${atcPlayers[i]?.total ?? 0} done` : i === nextPlayer ? 'Up next' : `${atcPlayers[i]?.done ?? 0} of ${atcPlayers[i]?.total ?? 0} done`, line)}
                  valueLabel="Target" value={atcPlayers[i]?.target ?? ''} />
              {/if}
            </div>
          {/each}
        </div>
        <div class="flex-1 min-h-0 flex flex-col gap-2">{@render phoneCenter()}</div>
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
              <X01Row name={player.name} p={x01Players[i]} active={i === currentPlayer && isActive} pill={pillFor(i, true)} seat={lines[i] ?? null} />
            {:else}
              <AtcRow name={player.name} p={atcPlayers[i]} active={i === currentPlayer && isActive} pill={pillFor(i, true)} seat={lines[i] ?? null} />
            {/if}
          {/each}
        </div>
        <aside class="w-[480px] shrink-0 min-h-0 flex flex-col gap-3" aria-label="Board">{@render center('party')}</aside>
      </main>
    {/if}

    <!-- Winner overlay (unchanged; a designed win state is out of scope) -->
    {#if winner !== null}
      <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div class="rounded-[18px] mx-4 px-6 py-6 md:mx-0 md:px-10 md:py-8 text-center pointer-events-auto
                    border border-line bg-[rgba(15,16,14,0.92)] [box-shadow:0_24px_60px_rgba(0,0,0,0.7)]">
          <p class="m-0 font-display font-bold text-[32px] md:text-[48px] text-accent uppercase mb-1">
            {players[winner]?.name} wins!
          </p>
          <button onclick={endSession}
            class="mt-6 h-[54px] px-6 md:px-8 rounded-[10px] bg-accent text-accent-fg font-display
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
