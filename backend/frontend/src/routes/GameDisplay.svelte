<script lang="ts">
  import { deviceStore } from '$lib/storage'
  import { onMount, onDestroy, untrack } from 'svelte'
  import { push } from 'svelte-spa-router'
  import ConfirmModal from '../lib/components/ConfirmModal.svelte'
  import ErrorText from '../lib/components/ErrorText.svelte'
  import { createSessionStore, type Snapshot } from '../lib/ws.js'
  import { afterGameRoute, endControl, leaveRefused, winActions, type WinAction } from '../lib/endControl.js'
  import { getGameView } from '../lib/gameViews/index.js'
  import GameHeader from '../lib/components/GameHeader.svelte'
  import BullOffPanel from '../lib/components/BullOffPanel.svelte'
  import MinigolfMatch from '$lib/components/minigolf/MinigolfMatch.svelte'
  import P121Match from '$lib/components/p121/P121Match.svelte'
  import HiloMatch from '$lib/components/hilo/HiloMatch.svelte'
  import CricketMatch from '$lib/components/cricket/CricketMatch.svelte'
  import P121Summary from '$lib/components/p121/P121Summary.svelte'
  import { snapshotStandings } from '$lib/p121/summary'
  import { pendingRoll } from '$lib/minigolf/match'
  import ScoreMatch from '../lib/components/ScoreMatch.svelte'
  import { loadSettings, saveSettings, type GameSettings } from '../lib/gameSettings.js'
  import { derived, get, readable } from 'svelte/store'
  import { accountSettings, writeThrough } from '$lib/accountSettings'
  import { audioContext, createSounds } from '../lib/sounds.js'
  import { createSoundPacks } from '$lib/soundPacks'
  import { snapshotEvent, type DartEvent } from '$lib/dartEvents'
  import { profileOf } from '$lib/progress/profiles'
  import { legsOf } from '$lib/caller/calls'
  import { createSnapshotCaller, playDartSound } from '$lib/caller/snapshotCaller'
  import { createCaller } from '$lib/caller/player'
  import { voiceClips, type Clips } from '$lib/caller/voices'
  import { emptyHistory, trackVisits, type VisitHistory } from '../lib/visitHistory.js'
  import { bullOffOf, gameState } from '../lib/gameState.js'
  import { nextButton } from '../lib/controls.js'
  import { labelToSegment } from '../lib/dartUtils.js'
  import { me } from '$lib/lobby/sockets'
  import { debounced } from '$lib/utils'
  import { api, type Board, type Segment, type UserAction } from '$lib/api'
  import { isNarrowMatch, isPhone, isPortrait } from '$lib/viewport'
  import { matchLayout } from '$lib/matchLayout'
  import { matchView } from '$lib/matchView'
  import { canThrowNow, isMyTurn } from '$lib/turn'
  import type { NoticeMessage } from '$lib/api/game-ws'
  import { authClient } from '$lib/auth'
  import { centerState, picksView, isManualTurn, myBoard, myBoardsInUse, noticeLines, startsOnKeypad } from '$lib/remote'
  import NotTurnToast from '../lib/components/NotTurnToast.svelte'
  import { createToast } from '$lib/toast'
  import { Toast } from '$lib/components/ui/toast/index.js'
  import { cameraStillUrl, type CameraVersions } from '$lib/camera'
  import WinScreen from '../lib/components/WinScreen.svelte'
  import { flag } from '$lib/flags'
  import { sharedBoard, winMeta, winView } from '$lib/winScreen'
  import type { GameDetail } from '$lib/api'

  // ── Settings and sound ────────────────────────────────────────────────────
  let settings = $state<GameSettings>(loadSettings(deviceStore()))
  // The account's settings loading after this page opened (sign-in) win; the drawer's changes go to
  // the account too, or the next load would put the account's older values back
  const accountAtOpen = get(accountSettings)
  $effect(() => {
    const account = $accountSettings
    if (account && account !== accountAtOpen) untrack(() => (settings = { ...settings, ...account }))
  })
  $effect(() => {
    saveSettings(localStorage, settings)
    writeThrough($state.snapshot(settings))
  })
  const sounds = createSounds(() => settings.effectsVolume)

  // The caller (score-based games): the voice's clips start loading as soon as the caller is on (before the
  // first snapshot, so "Game on" isn't missed) and again when the voice changes. Calls wait for
  // them; the player drops a call overtaken by a newer one.
  const caller = createCaller(() => settings.volume)
  // Each thrower's sound pack (their profile's look; none for guests and bots); the caller ducks it
  const packs = createSoundPacks(() => settings.effectsVolume)
  let callerClips: Promise<Clips | null> = Promise.resolve(null)
  const snapshotCaller = createSnapshotCaller({ settings: () => settings, caller, clips: () => callerClips })
  $effect(() => {
    const on = settings.callerOn
    const voice = settings.callerVoice
    if (!on) {
      caller.stop()
      callerClips = Promise.resolve(null)
      return
    }
    callerClips = voiceClips(voice).catch(() => null)
  })
  // Browsers keep audio asleep until the page is tapped or typed on: wake it on the first one
  function wakeAudio() {
    audioContext()
    stopWaking()
  }
  function stopWaking() {
    window.removeEventListener('pointerdown', wakeAudio)
    window.removeEventListener('keydown', wakeAudio)
  }

  // ── Session ───────────────────────────────────────────────────────────────
  const progression = flag('progression.enabled')
  let sessionId = $state('')
  let sessionStore: ReturnType<typeof createSessionStore> | null = null
  let snapshot = $state<Snapshot | null>(null)
  let history = $state.raw<VisitHistory>(emptyHistory())
  let unsubSnap: (() => void) | null = null
  // The signed-in user: the host gets Abort while the game waits for someone
  let viewerId = $state<string | null>(null)
  // The viewer's own boards (fetched once), for the status/controls panel on whichever of
  // them are playing in this game (see myBoards below)
  let myOwnBoards = $state<Board[]>([])
  let unsubBoardStatus: (() => void) | undefined
  async function loadOwnBoards() {
    try {
      const { data } = await api.GET('/api/boards')
      // Owner-only controls (status/start/stop/reset/calibrate): exclude boards shared by a friend
      if (data) myOwnBoards = data.boards.filter(b => !b.sharedBy)
    } catch {
      /* keep the list */
    }
  }
  const refetchOwn = debounced(() => void loadOwnBoards(), 300)
  let unsubNotice: (() => void) | null = null
  let unsubError: (() => void) | null = null
  let unsubConnected: (() => void) | null = null
  let unsubCameras: (() => void) | null = null
  let unsubStale: (() => void) | null = null
  // A snapshot didn't parse (this tab predates a deploy): ask for a reload
  let stale = $state(false)
  // The sound pack of each seat's player, from their profile; read again only when the seats change
  let seatSounds = $state.raw<(string | null)[]>([])
  const seatUsers = $derived(snapshot?.seats.map(seat => seat.userId ?? '').join(',') ?? '')
  $effect(() => {
    const ids = seatUsers.split(',')
    if (!$progression || !seatUsers) {
      seatSounds = []
      return
    }
    return derived(
      ids.map(id => (id ? profileOf(id) : readable(null))),
      profiles => profiles.map(p => p?.look.sound ?? null),
    ).subscribe(v => (seatSounds = v))
  })
  // The game socket is open: entry is off while it reconnects (what's sent meanwhile is dropped)
  let connected = $state(false)
  // The newest camera still of each board and camera in this game
  let cameraVersions = $state.raw<CameraVersions>({})
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
    window.addEventListener('pointerdown', wakeAudio)
    window.addEventListener('keydown', wakeAudio)
    sessionId = window.location.hash.match(/\/session\/([^/]+)/)?.[1] ?? ''
    if (!sessionId) return
    sessionStore = createSessionStore(sessionId)
    unsubSnap = sessionStore.snapshot.subscribe(snap => {
      if (!snap) {
        snapshot = null
        return
      }
      // Without a board of your own you start on the keypad (once)
      if (!viewModeSetByUser && startsOnKeypad(snap)) {
        viewMode = 'entry'
        viewModeSetByUser = true
      }
      const next = gameState(snap)
      snapshotCaller.onSnapshot(snapshot, snap)
      if (snapshot) playSounds(snapshotEvent(snapshot, snap))
      // X01 sends its visits with the snapshot; Around the Clock still tracks them here
      if (next.atc) history = trackVisits(history, next.atc)
      snapshot = snap
    })
    unsubNotice = sessionStore.notice.subscribe(n => {
      if (n) toast.show(n)
    })
    unsubError = sessionStore.error.subscribe(e => {
      if (e?.action === 'forfeit' && leavePending) {
        leavePending = false
        endError = leaveRefused(snapshot)
      }
    })
    unsubConnected = sessionStore.connected.subscribe(up => {
      connected = up
      if (!up) leavePending = false
    })
    unsubCameras = sessionStore.cameras.subscribe(v => {
      cameraVersions = v
    })
    unsubStale = sessionStore.stale.subscribe(v => {
      stale = v
    })
    authClient
      .getSession()
      .then(r => {
        viewerId = r.data?.user.id ?? null
      })
      .catch(() => undefined)
    void loadOwnBoards()
    // A bridge reports back (/ws/me), e.g. the big screen started or stopped: the board controls follow
    unsubBoardStatus = me.boardStatus.subscribe(msg => {
      if (msg) refetchOwn.call()
    })
  })
  onDestroy(() => {
    unsubBoardStatus?.()
    refetchOwn.cancel()
    unsubSnap?.()
    unsubNotice?.()
    unsubError?.()
    unsubConnected?.()
    unsubCameras?.()
    unsubStale?.()
    toast.dismiss()
    sessionStore?.destroy()
    caller.stop()
    stopWaking()
  })

  function playSounds(e: DartEvent | null) {
    // A sound pack (yours for everyone, or the thrower's own) only replaces the beep
    playDartSound(e, settings, sounds, (ev, sound) => {
      const pack = settings.soundEffects ? (settings.soundPack ?? seatSounds[ev.seat] ?? 'sound.none') : 'sound.none'
      if (pack === 'sound.none') return false
      packs.play(pack, sound)
      return true
    })
  }

  // ── Game state ────────────────────────────────────────────────────────────
  const gameId = $derived(snapshot?.gameId ?? '')
  const boardId = $derived(snapshot?.boardId ?? null)
  // The viewer's own boards actually playing in this game, for the status/controls panel in the header
  const myBoards = $derived(myBoardsInUse(snapshot, myOwnBoards))
  const players = $derived(snapshot?.players ?? [])
  // The snapshot's game narrowed by game id; both null for a game this page doesn't know
  const current = $derived(gameState(snapshot))
  const x01 = $derived(current.x01)
  const minigolf = $derived(current.minigolf)
  const p121 = $derived(current.p121)
  const hilo = $derived(current.hilo)
  const cricket = $derived(current.cricket)
  const game = $derived(snapshot?.game ?? null)
  const isX01 = $derived(x01 !== null)
  // 121 ends on its session summary (P121Summary), not the win screen
  const p121Finished = $derived(p121 !== null && snapshot?.status === 'finished')
  const view = $derived(getGameView(gameId))
  const winner = $derived(game?.winner ?? null)
  // Until the session ends: a winning visit (Around the Clock names its winner on the dart)
  // stays open, correctable, until Finish game
  const isActive = $derived(snapshot?.status === 'active')
  const finishPending = $derived(snapshot?.finishPending === true)
  // The host ends the game for everyone; a player with seats leaves it (forfeits them);
  // a watcher with no seats gets neither. Only shown while the game isn't won.
  const control = $derived(endControl(snapshot, viewerId))
  const canEnd = $derived(isActive && control !== null)
  $effect(() => {
    if (!snapshot || snapshot.status === 'active') return
    // A successful Leave: the forfeit ended the session; go to the lobby, or home for a local game
    if (leavePending) {
      leavePending = false
      void push(afterGameRoute(snapshot))
    }
  })
  // Online: only the seat's controller enters its darts (a local game's owner controls every seat).
  // A bot seat's own controller (the host) controls it but doesn't throw for it: `myTurn` still
  // includes a bot seat (so Undo, below, stays reachable to fix a misdetected bot throw), but
  // `canThrow` — the live entry controls (keypad, board-click-to-score, Next/takeout) — excludes it.
  const myTurn = $derived(isMyTurn(snapshot))
  const canThrow = $derived(connected && isActive && canThrowNow(snapshot))
  // Remote games: what the centre shows when it isn't your turn, and where each seat throws
  const remote = $derived(centerState(snapshot, viewerId))
  const bots = $derived(snapshot?.seats.map(s => s.bot) ?? [])
  // The keypad: picked with Enter on your turn (also while your board is offline: the drawn board
  // takes manual darts too). Someone else's turn always shows the board, live.
  const keypad = $derived(picksView(remote) && viewMode === 'entry')
  const darts = $derived(game?.currentVisitDarts ?? [])
  // Camera view: the still of the chosen camera of the board the player up throws on (or null)
  const cameraSrc = $derived(cameraStillUrl(snapshot, settings.boardView, cameraVersions))
  // The visit is over (bust, checkout, win): no more darts until the next player
  // Read from the game's own fields, so a new game with a lockable visit needs no line here
  const locked = $derived((game !== null && 'visitLocked' in game && game.visitLocked) || winner !== null)
  const bullOff = $derived(bullOffOf(current))
  // The seats, the open visit and the board's highlights (X01 and Around the Clock): shared with the big screen
  const mv = $derived(matchView(snapshot, history, settings))
  const checkout = $derived(mv.checkout)
  const teams = $derived(mv.teams)
  const layout = $derived(matchLayout(players.length, $isPhone, teams.length > 0, $isNarrowMatch, $isPortrait))
  // ── Actions ───────────────────────────────────────────────────────────────
  const send = (action: UserAction) => sessionStore?.send(action)
  const undo = () => send({ type: 'undo_dart' })
  const advance = () => send({ type: 'takeout' })
  // Undo takes back the last dart, or with none open reopens the last visit (its thrower is up
  // again) — available whenever the viewer's own seat (bot included) is up, even though `canThrow`
  // excludes a bot: the host may still need to correct a misdetected bot throw.
  const canUndo = $derived(connected && isActive && myTurn && (darts.length > 0 || snapshot?.canUndoVisit === true))
  // A visit that wins a leg (not the match): same check as the leg-won caller line in endOfVisit
  // (Cricket's locked visit won the leg; nextPlayer is null when it wins the match)
  const legWon = $derived(
    (x01 !== null && x01.visitLocked && x01.scores[x01.currentPlayer] === 0 && legsOf(x01, x01.currentPlayer) + 1 < x01.firstTo) ||
      (cricket?.visitLocked === true && cricket.nextPlayer !== null),
  )
  const next = $derived(
    nextButton({ manual: isManualTurn(snapshot), dartCount: darts.length, locked, active: canThrow, finish: finishPending, legWon }),
  )
  const addManualDart = (segment: Segment) => send({ type: 'add_dart', segment })
  // Clicking the board keeps the exact spot, so the dart shows where it landed
  const addBoardDart = (hit: { segment: Segment; coords: { x: number; y: number } }) =>
    send({ type: 'add_dart', segment: hit.segment, coords: hit.coords })
  const correct = (dartIndex: number, label: string) =>
    canThrow && send({ type: 'correct_dart', visitIndex: dartIndex, segment: labelToSegment(label) })
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
    if (error) {
      endError = 'Could not end the game.'
      return
    }
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

  // ── Win screen ────────────────────────────────────────────────────────────
  // The saved game (X01 averages, checkouts, legs): it's in History by the time the won snapshot
  // arrives. Only the players can read it; everyone else sees what the snapshot has.
  let savedGame = $state.raw<GameDetail | null>(null)
  let savedFor = ''
  // The fetch failed: 121's summary falls back to the standings alone
  let savedFailed = $state(false)
  $effect(() => {
    // A forfeit finishes 121 without a winner, so it doesn't wait for one
    if (snapshot?.status !== 'finished' || (winner === null && !p121) || !(isX01 || p121) || snapshot.mySeats.length === 0) return
    const id = snapshot.sessionId
    if (savedFor === id) return
    savedFor = id
    savedFailed = false
    void api
      .GET('/api/games/{id}', { params: { path: { id } } })
      .then(({ data }) => {
        if (snapshot?.sessionId !== id) return
        if (data) savedGame = data
        else savedFailed = true
      })
      .catch(() => {
        if (snapshot?.sessionId === id) savedFailed = true
      })
  })
  // Minigolf's last stroke rolls before the win screen: it waits until the match screen says that roll is done
  let minigolfRolled = $state<string | null>(null)
  const minigolfHold = $derived(pendingRoll(minigolf, minigolfRolled) !== null)
  function minigolfRolledKey(key: string): void {
    minigolfRolled = key
  }
  const win = $derived(minigolfHold ? null : winView(snapshot, savedGame?.game.id === snapshot?.sessionId ? savedGame : null))
  // The win fanfare, once, when a game played here is won (not when opening a finished one)
  let sawPlay = false
  let fanfare = false
  $effect(() => {
    if (snapshot?.status === 'active') sawPlay = true
    if ((win || p121Finished) && sawPlay && !fanfare) {
      fanfare = true
      if (settings.soundWin) sounds.win()
    }
  })

  /** The win screen's button: the session is already finished and released, so a refused
   * DELETE here blocks nothing. Only the host sends it (anyone else's always 403s). */
  // The win screen's buttons (winActions). Rematch goes through the lobby page, which starts the
  // same game again (solo) or marks the host ready (shared) - see rematchStep
  const winButtons = $derived(winActions(snapshot, viewerId))
  const WIN_LABELS: Record<WinAction, string> = { rematch: 'Rematch', lobby: 'Back to lobby', play: 'Back to Play' }
  const WIN_ROUTES: Record<WinAction, string> = { rematch: '/lobby?rematch=1', lobby: '/lobby', play: '/' }
  async function finishWin(next: WinAction) {
    if (!sessionId) return
    // The host ends the game for everyone; a 404 means it was ended already, which is fine
    if (control === 'end') await api.DELETE('/api/sessions/{id}', { params: { path: { id: sessionId } } })
    void push(WIN_ROUTES[next])
  }
  const winSecondary = $derived(winButtons.secondary)
</script>

<div class="flex flex-col h-dvh bg-bg text-text overflow-hidden" data-layout={layout}>
  {#if !snapshot}
    <div class="flex-1 flex items-center justify-center">
      <span class="text-text-muted text-lg">Connecting…</span>
    </div>
  {:else}
    {#if win}
      <WinScreen
        view={win}
        title={view.title}
        meta={winMeta(snapshot)}
        lobbyName={snapshot.lobbyName}
        board={sharedBoard(snapshot)}
        saved={snapshot.mySeats.length > 0}
        primary={{
          label: WIN_LABELS[winButtons.primary],
          rematch: winButtons.primary === 'rematch',
          onclick: () => void finishWin(winButtons.primary),
        }}
        secondary={winSecondary ? { label: WIN_LABELS[winSecondary], onclick: () => void finishWin(winSecondary) } : null}
        onhistory={() => push(`/history/${sessionId}`)}
        xpSessionId={$progression && snapshot.mySeats.length > 0 ? sessionId : null}
        winnerId={$progression ? (snapshot.seats[win.competitors[0]?.seats[0] ?? -1]?.userId ?? null) : null}
      />
    {:else}
      <GameHeader
        title={bullOff ? 'Bull-off' : view.title}
        meta={bullOff ? `Who throws first in ${view.title}` : view.meta(snapshot)}
        showViewToggle={!bullOff && !minigolf && !p121Finished && picksView(remote)}
        boards={myBoards}
        {gameId}
        scoreBased={snapshot.scoreBased}
        {viewMode}
        compact={$isPhone}
        paused={remote.kind === 'waiting'}
        myBoard={myBoard(snapshot)}
        {canEnd}
        endMode={control ?? 'end'}
        bind:settings
        onleave={() => push(afterGameRoute(snapshot))}
        onend={() => (showEndConfirm = true)}
        onviewmode={setViewMode}
      />

      {#if endError}
        <div class="shrink-0 box-border px-7 py-2 border-b border-line bg-surface-1">
          <ErrorText>{endError}</ErrorText>
        </div>
      {/if}

      {#if p121 && p121Finished}
        {@const saved = savedGame?.game.id === snapshot.sessionId ? savedGame : null}
        <P121Summary
          detail={saved?.detail.mode === 'p121' ? saved.detail : null}
          {players}
          seat={snapshot.mySeats[0] ?? 0}
          missRule={p121.cfg.missRule}
          startTarget={p121.cfg.startTarget}
          standings={snapshotStandings(p121, players, snapshot.results)}
          loading={snapshot.mySeats.length > 0 && !savedFailed}
          primary={{
            label: winButtons.primary === 'rematch' ? 'Play again' : WIN_LABELS[winButtons.primary],
            onclick: () => void finishWin(winButtons.primary),
          }}
          secondary={winSecondary ? { label: WIN_LABELS[winSecondary], onclick: () => void finishWin(winSecondary) } : null}
        />
      {:else if bullOff}
        <BullOffPanel {players} {bots} {bullOff} manual={boardId === null} {send} />
      {:else if minigolf}
        <MinigolfMatch
          game={minigolf}
          {players}
          {darts}
          {canThrow}
          {locked}
          {canUndo}
          {next}
          onUndo={undo}
          onNext={advance}
          onBoardClick={addBoardDart}
          onrolled={minigolfRolledKey}
          {settings}
          host={snapshot?.ownerUserId === viewerId}
          manual={boardId === null}
          onNextHole={() => send({ type: 'minigolf_next_hole' })}
        />
      {:else if p121}
        <P121Match
          game={p121}
          {players}
          {darts}
          {layout}
          {canThrow}
          {locked}
          {canUndo}
          {next}
          onUndo={undo}
          onNext={advance}
          onBoardClick={addBoardDart}
          onCorrect={correct}
          onGiveUp={() => send({ type: 'p121_give_up' })}
          {settings}
          {checkout}
          {keypad}
          onDart={canThrow ? addManualDart : () => {}}
        />
      {:else if hilo}
        <HiloMatch
          game={hilo}
          {players}
          {darts}
          {layout}
          {canThrow}
          {locked}
          {canUndo}
          {next}
          onUndo={undo}
          onNext={advance}
          onBoardClick={addBoardDart}
          onCorrect={correct}
          {keypad}
          onDart={canThrow ? addManualDart : () => {}}
        />
      {:else if cricket}
        <CricketMatch
          game={cricket}
          {players}
          {darts}
          {layout}
          {canThrow}
          {locked}
          {canUndo}
          {next}
          onUndo={undo}
          onNext={advance}
          onBoardClick={addBoardDart}
          onCorrect={correct}
          {keypad}
          onDart={canThrow ? addManualDart : () => {}}
        />
      {:else if !game}
        <main class="flex-grow flex items-center justify-center">
          <p class="text-text-muted">Unsupported game</p>
        </main>
      {:else}
        <ScoreMatch
          {snapshot}
          {mv}
          {layout}
          bind:settings
          {remote}
          {keypad}
          {canThrow}
          {locked}
          {canUndo}
          {next}
          {cameraSrc}
          {cameraVersions}
          bind:correcting
          onUndo={undo}
          onNext={advance}
          onDart={addManualDart}
          onCorrect={correct}
          onBoardClick={addBoardDart}
          onDartMove={moveDart}
          onabort={() => (showEndConfirm = true)}
        />
      {/if}
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
    onconfirm={() => {
      showEndConfirm = false
      if (control === 'leave') leaveGame()
      else void endSession()
    }}
    oncancel={() => (showEndConfirm = false)}
  />
{/if}

{#if $toast}
  <!-- Keyed by the toast's id: a new notice restarts the bar -->
  {#key $toast.id}
    <NotTurnToast lines={noticeLines($toast.value)} compact={$isPhone} ondismiss={toast.dismiss} />
  {/key}
{/if}

{#if stale}
  <Toast tone="error" actionLabel="Reload" onaction={() => location.reload()}>Dartcade was updated. Reload to continue.</Toast>
{:else if snapshot && !connected}
  <Toast tone="error">Reconnecting…</Toast>
{/if}
