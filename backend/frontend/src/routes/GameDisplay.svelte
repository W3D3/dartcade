<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte'
  import { push } from 'svelte-spa-router'
  import ConfirmModal from '../lib/components/ConfirmModal.svelte'
  import ErrorText from '../lib/components/ErrorText.svelte'
  import { createSessionStore, type Snapshot } from '../lib/ws.js'
  import { afterGameRoute, endControl, leaveRefused } from '../lib/endControl.js'
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
  import { isPhone } from '$lib/viewport'
  import { matchLayout } from '$lib/matchLayout'
  import { isMyTurn } from '$lib/turn'
  import PhonePlayerRow from '../lib/components/PhonePlayerRow.svelte'
  import PhoneX01Card from '../lib/components/PhoneX01Card.svelte'
  import PhoneAtcCard from '../lib/components/PhoneAtcCard.svelte'
  import DartKeypad from '../lib/components/DartKeypad.svelte'
  import type { AtcGame, NoticeMessage, X01Game } from '$lib/api/game-ws'
  import { authClient } from '$lib/auth'
  import { boardCaption, centerState, isManualTurn, myBoard, noticeLines, rowSub, seatLines, startsOnKeypad, turnStatus } from '$lib/remote'
  import BoardCaption from '../lib/components/BoardCaption.svelte'
  import TurnStatusBar from '../lib/components/TurnStatusBar.svelte'
  import OfflineNotice from '../lib/components/OfflineNotice.svelte'
  import WaitingCard from '../lib/components/WaitingCard.svelte'
  import NotTurnToast from '../lib/components/NotTurnToast.svelte'
  import { createToast } from '$lib/toast'

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
  let unsubNotice: (() => void) | null = null
  let unsubError: (() => void) | null = null
  let unsubConnected: (() => void) | null = null
  // "Not your turn": a dart on your board while someone else is up (6 s, the newest wins)
  const toast = createToast<NoticeMessage>(6000)

  // Board or keypad as last picked on this device; until then the game decides (see below)
  const savedView = untrack(() => settings.inputView)
  let viewMode = $state<'board' | 'entry'>(savedView ?? 'board')
  let viewModeSetByUser = savedView !== null
  let showEndConfirm = $state(false)
  // A non-host's Leave game: sent over the socket, confirmed by the next snapshot (seats
  // forfeited, status no longer active); the server's error means it failed (you control every
  // seat left, so only the host can end it), and a dropped socket forgets it.
  let leavePending = $state(false)
  let endError = $state<string | null>(null)
  /** Dart open in the correction popover; also highlighted on the board. */
  let correcting = $state<number | null>(null)

  onMount(() => {
    sessionId = window.location.hash.match(/\/session\/([^/]+)/)?.[1] ?? ''
    if (!sessionId) return
    sessionStore = createSessionStore(sessionId)
    unsubSnap = sessionStore.snapshot.subscribe(snap => {
      if (!snap) { snapshot = null; return }
      // Without a board of your own you start on the keypad (once)
      if (!viewModeSetByUser && startsOnKeypad(snap)) { viewMode = 'entry'; viewModeSetByUser = true }
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
    unsubNotice = sessionStore.notice.subscribe(n => { if (n) toast.show(n) })
    unsubError = sessionStore.error.subscribe(e => {
      if (e?.action === 'forfeit' && leavePending) { leavePending = false; endError = leaveRefused(snapshot) }
    })
    unsubConnected = sessionStore.connected.subscribe(up => { if (!up) leavePending = false })
    authClient.getSession().then(r => { viewerId = r.data?.user.id ?? null }).catch(() => undefined)
  })
  onDestroy(() => { unsubSnap?.(); unsubNotice?.(); unsubError?.(); unsubConnected?.(); toast.dismiss(); sessionStore?.destroy() })

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
  // The host ends the game for everyone; a player with seats leaves it (forfeits them);
  // a watcher with no seats gets neither. Only shown while the game isn't won.
  const control = $derived(endControl(snapshot, viewerId))
  const canEnd = $derived(isActive && control !== null)
  $effect(() => {
    if (!snapshot || snapshot.status === 'active') return
    // A successful Leave: the forfeit ended the session; go to the lobby, or home for a local game
    if (leavePending) { leavePending = false; void push(afterGameRoute(snapshot)) }
  })
  // Online: only the seat's controller enters its darts (a local game's owner controls every seat)
  const myTurn = $derived(isMyTurn(snapshot))
  const canThrow = $derived(isActive && myTurn)
  // Remote games: what the centre shows when it isn't your turn, and where each seat throws
  const remote = $derived(centerState(snapshot, viewerId))
  const lines = $derived(seatLines(snapshot))
  const turn = $derived(turnStatus(remote))
  const caption = $derived(boardCaption(remote))
  // The keypad: picked with Enter on your turn, or forced while your board is offline.
  // Someone else's turn always shows the board, live.
  const keypad = $derived(remote.kind === 'play-offline' || (remote.kind === 'play' && viewMode === 'entry'))
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
  const upKey = $derived(`${currentPlayer}-${keypad ? 'entry' : 'board'}`)
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
  const next = $derived(nextButton({ manual: isManualTurn(snapshot), dartCount: darts.length, locked, active: canThrow }))
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
    settings.inputView = m
  }

  /** The host: ends the game for everyone. Stays on the page, with an error, on refusal. */
  async function endSession() {
    if (!sessionId) return
    endError = null
    const { error } = await api.DELETE('/api/sessions/{id}', { params: { path: { id: sessionId } } })
    if (error) { endError = 'Could not end the game.'; return }
    void push(afterGameRoute(snapshot))
  }

  /** Anyone else with seats: forfeits them over the game socket. Confirmed by the next
   * snapshot (see the effect above); the server's forbidden notice is handled the same way. */
  function leaveGame() {
    if (!snapshot) return
    endError = null
    leavePending = true
    send({ type: 'forfeit', seats: snapshot.mySeats })
  }

  /** The winner overlay's own button (unchanged; a designed win state is out of scope): the
   * session is already finished and released, so a refused DELETE here blocks nothing. Only
   * the host sends it (anyone else's always 403s). */
  async function backToLobbyAfterWin() {
    if (!sessionId) return
    const route = afterGameRoute(snapshot)
    if (control === 'end') await api.DELETE('/api/sessions/{id}', { params: { path: { id: sessionId } } })
    void push(route)
  }
</script>

{#snippet waitingCard(compact: boolean)}
  {#if remote.kind === 'waiting'}
    <WaitingCard name={remote.name} disconnectedAt={remote.disconnectedAt} canAbort={remote.canAbort}
      onabort={() => showEndConfirm = true} {compact} />
  {/if}
{/snippet}

{#snippet phoneCenter()}
  {#if remote.kind === 'play-offline'}<OfflineNotice board={remote.board} compact />{/if}
  <!-- Phones: everything fits without scrolling; the board, keypad or waiting card takes what's left -->
  {#if remote.kind === 'waiting'}
    <div class="flex-1 min-h-[160px] flex rounded-[16px] bg-surface-panel border border-line-2">{@render waitingCard(true)}</div>
  {:else if !keypad}
    {#if caption}<BoardCaption {caption} compact />{/if}
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
    <DartSlots {slots} {popIndex} onCorrect={correct} bind:openDart={correcting} showPopover={!keypad} popoverAbove />
    {#if settings.visitSum}<VisitBand {band} compact />{/if}
  </div>
  {#if keypad}
    <div class="flex-1 min-h-[220px]">
      <DartKeypad onDart={canThrow ? keypadDart : () => {}} dartCount={darts.length} {locked} replacing={correcting} disabled={!canThrow}
        canUndo={canThrow && darts.length > 0} onUndo={undo}
        nextLabel={next.label} nextEnabled={next.enabled} nextProminent={next.prominent} onNext={advance} />
    </div>
  {:else if turn}
    <TurnStatusBar status={turn} compact />
  {:else}
    <ControlBar compact canUndo={canThrow && darts.length > 0} label={next.label} prominent={next.prominent} enabled={next.enabled}
      onUndo={undo} onNext={advance} />
  {/if}
{/snippet}

{#snippet center(variant: 'solo' | 'duel' | 'party')}
  {#if remote.kind === 'play-offline'}<OfflineNotice board={remote.board} />{/if}
  {#if keypad}
    <div class="flex-1 min-h-0">
      <DartKeypad onDart={canThrow ? addManualDart : () => {}} dartCount={darts.length} {locked} disabled={!canThrow}
        canUndo={canThrow && darts.length > 0} onUndo={undo}
        nextLabel={next.label} nextEnabled={next.enabled} nextProminent={next.prominent} onNext={advance} />
    </div>
  {:else if remote.kind === 'waiting' && variant === 'party'}
    <!-- Rows have no room for an overlay: the waiting card takes the board's place -->
    <div class="flex-1 min-h-0 flex rounded-[16px] bg-surface-panel border border-line-2">{@render waitingCard(false)}</div>
  {:else}
    {#if caption}<BoardCaption {caption} />{/if}
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

  {#if !keypad}
    {#if turn}
      <TurnStatusBar status={turn} />
    {:else}
      <ControlBar canUndo={canThrow && darts.length > 0} label={next.label} prominent={next.prominent} enabled={next.enabled}
        onUndo={undo} onNext={advance} />
    {/if}
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

{#snippet duelPanel(i: number)}
  <!-- A disconnected thrower's panel is covered by the waiting card, below the name row -->
  <div class="relative flex-1 min-w-0 min-h-0 flex">
    {@render panel(i)}
    {#if remote.kind === 'waiting' && remote.seat === i}
      <div class="absolute left-0 right-0 bottom-0 top-[104px] rounded-b-[18px] bg-surface-panel/90 flex">{@render waitingCard(false)}</div>
    {/if}
  </div>
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
      showViewToggle={!bullOff && remote.kind === 'play'}
      {sessionId} {boardId} {gameId} bmStatus={snapshot.bmStatus} {viewMode} compact={$isPhone}
      lobbyName={snapshot.lobbyName} paused={remote.kind === 'waiting'} myBoard={myBoard(snapshot)}
      {canEnd}
      endMode={control ?? 'end'}
      bind:settings
      onleave={() => push(afterGameRoute(snapshot))}
      onend={() => showEndConfirm = true}
      onviewmode={setViewMode}
    />

    {#if endError}
      <div class="shrink-0 box-border px-7 py-2 border-b border-line bg-surface-1">
        <ErrorText>{endError}</ErrorText>
      </div>
    {/if}

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
              class={!up && keypad ? '[@media(max-height:599px)]:hidden' : ''}>
              {#if up && !keypad}
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
        {@render duelPanel(0)}
        <div class="w-[560px] shrink-0 min-h-0 flex flex-col gap-3">{@render center('duel')}</div>
        {@render duelPanel(1)}
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
          <button onclick={backToLobbyAfterWin}
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
    title={control === 'leave' ? 'Leave the game?' : 'End this game?'}
    body={control === 'leave'
      ? 'Your seats forfeit and are placed last; the others are ranked by their score so far.'
      : 'The current game will be cancelled and all progress will be lost.'}
    confirmLabel={control === 'leave' ? 'Leave game' : 'End game'}
    danger
    onconfirm={() => { showEndConfirm = false; if (control === 'leave') leaveGame(); else void endSession() }}
    oncancel={() => showEndConfirm = false} />
{/if}

{#if $toast}
  <!-- Keyed by the toast's id: a new notice restarts the bar -->
  {#key $toast.id}
    <NotTurnToast lines={noticeLines($toast.value)} compact={$isPhone} ondismiss={toast.dismiss} />
  {/key}
{/if}
