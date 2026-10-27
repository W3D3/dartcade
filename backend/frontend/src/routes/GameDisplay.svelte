<script lang="ts">
  import { deviceStore } from '$lib/storage'
  import { onMount, onDestroy, untrack } from 'svelte'
  import { push } from 'svelte-spa-router'
  import ConfirmModal from '../lib/components/ConfirmModal.svelte'
  import ErrorText from '../lib/components/ErrorText.svelte'
  import { createSessionStore, type Snapshot } from '../lib/ws.js'
  import { afterGameRoute, endControl, leaveRefused, winActions, type WinAction } from '../lib/endControl.js'
  import { getGameView } from '../lib/gameViews/index.js'
  import BoardOrKeypad from '../lib/components/match/BoardOrKeypad.svelte'
  import MatchFrame from '../lib/components/match/MatchFrame.svelte'
  import GameHeader from '../lib/components/GameHeader.svelte'
  import BullOffPanel from '../lib/components/BullOffPanel.svelte'
  import MinigolfMatch from '$lib/components/minigolf/MinigolfMatch.svelte'
  import P121Match from '$lib/components/p121/P121Match.svelte'
  import HiloMatch from '$lib/components/hilo/HiloMatch.svelte'
  import P121Summary from '$lib/components/p121/P121Summary.svelte'
  import { snapshotStandings } from '$lib/p121/summary'
  import { rollFor } from '$lib/minigolf/match'
  import BoardLegend from '../lib/components/BoardLegend.svelte'
  import VisitBand from '../lib/components/VisitBand.svelte'
  import DartSlots from '../lib/components/DartSlots.svelte'
  import ControlBar from '../lib/components/ControlBar.svelte'
  import X01Panel from '../lib/components/X01Panel.svelte'
  import AtcPanel from '../lib/components/AtcPanel.svelte'
  import X01Row from '../lib/components/X01Row.svelte'
  import X01Card from '../lib/components/X01Card.svelte'
  import AtcCard from '../lib/components/AtcCard.svelte'
  import TeamPanel from '../lib/components/TeamPanel.svelte'
  import AtcRow from '../lib/components/AtcRow.svelte'
  import type { PillKind } from '../lib/components/pills.js'
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
  import { x01Slots, atcSlots, boardCheckoutTargets } from '../lib/dartSlots.js'
  import { gameState } from '../lib/gameState.js'
  import { x01Band, atcBand, atcAdvanced, bigDartIndex } from '../lib/visitBand.js'
  import { nextButton } from '../lib/controls.js'
  import { x01Player, atcPlayer, x01Roll } from '../lib/playerStats.js'
  import { atcTargetSegment, atcLeaders } from '../lib/atc.js'
  import { labelToSegment } from '../lib/dartUtils.js'
  import { me } from '$lib/lobby/sockets'
  import { debounced } from '$lib/utils'
  import { api, type Board, type Segment, type UserAction } from '$lib/api'
  import { isNarrowMatch, isPhone, isPortrait, isWide } from '$lib/viewport'
  import { x01Teams } from '$lib/teams'
  import { matchLayout } from '$lib/matchLayout'
  import { canThrowNow, isMyTurn } from '$lib/turn'
  import PhonePlayerRow from '../lib/components/PhonePlayerRow.svelte'
  import PhoneX01Card from '../lib/components/PhoneX01Card.svelte'
  import PhoneAtcCard from '../lib/components/PhoneAtcCard.svelte'
  import type { NoticeMessage } from '$lib/api/game-ws'
  import { authClient } from '$lib/auth'
  import {
    boardCaption,
    centerState,
    picksView,
    isManualTurn,
    myBoard,
    myBoardsInUse,
    noticeLines,
    rowSub,
    seatLines,
    startsOnKeypad,
    turnStatus,
  } from '$lib/remote'
  import BoardCaption from '../lib/components/BoardCaption.svelte'
  import TurnStatusBar from '../lib/components/TurnStatusBar.svelte'
  import OfflineNotice from '../lib/components/OfflineNotice.svelte'
  import WaitingCard from '../lib/components/WaitingCard.svelte'
  import NotTurnToast from '../lib/components/NotTurnToast.svelte'
  import { createToast } from '$lib/toast'
  import { Toast } from '$lib/components/ui/toast/index.js'
  import { cameraStillUrl, type CameraVersions } from '$lib/camera'
  import BoardViewToggle from '../lib/components/BoardViewToggle.svelte'
  import WinScreen from '../lib/components/WinScreen.svelte'
  import { flag } from '$lib/flags'
  import { sharedBoard, winMeta, winView } from '$lib/winScreen'
  import type { GameDetail } from '$lib/api'
  import { initial } from '$lib/fmt'

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
      if (data) myOwnBoards = data.boards
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
  const atc = $derived(current.atc)
  const minigolf = $derived(current.minigolf)
  const p121 = $derived(current.p121)
  const hilo = $derived(current.hilo)
  const game = $derived(snapshot?.game ?? null)
  const isX01 = $derived(x01 !== null)
  // 121 ends on its session summary (P121Summary), not the win screen
  const p121Finished = $derived(p121 !== null && snapshot?.status === 'finished')
  const view = $derived(getGameView(gameId))
  const currentPlayer = $derived(game?.currentPlayer ?? 0)
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
  const lines = $derived(seatLines(snapshot))
  const bots = $derived(snapshot?.seats.map(s => s.bot) ?? [])
  const turn = $derived(turnStatus(remote))
  const caption = $derived(boardCaption(remote))
  // The keypad: picked with Enter on your turn (also while your board is offline: the drawn board
  // takes manual darts too). Someone else's turn always shows the board, live.
  const keypad = $derived(picksView(remote) && viewMode === 'entry')
  const darts = $derived(game?.currentVisitDarts ?? [])
  // Camera view: the still of the chosen camera of the board the player up throws on (or null)
  const cameraSrc = $derived(cameraStillUrl(snapshot, settings.boardView, cameraVersions))
  const hits = $derived(atc?.currentVisitHits ?? [])
  const bust = $derived(x01?.bustThisVisit === true)
  // The visit is over (bust, checkout, win): no more darts until the next player
  // Read from the game's own fields, so a new game with a lockable visit or a bull off needs no line here
  const locked = $derived((game !== null && 'visitLocked' in game && game.visitLocked) || winner !== null)
  const bullOff = $derived(game !== null && 'phase' in game && game.phase === 'bulloff' ? game.bullOff : null)
  // Checkout preferences: this device's for now; per player (from each seat's account) once they
  // can be set in Settings
  const checkout = $derived({ favouriteDouble: settings.favouriteDouble })
  // A team game (X01): one panel per team, sharing a score
  const teams = $derived(
    x01 ? x01Teams(x01, players, { suggest: settings.checkoutSuggestions, checkout, scoreUpdates: settings.scoreUpdates }) : [],
  )
  const layout = $derived(matchLayout(players.length, $isPhone, teams.length > 0, $isNarrowMatch, $isPortrait))
  // Portrait with teams or three or more: compact cards above the board, which give way to a waiting card
  const portraitCards = $derived(layout === 'portrait' && (teams.length > 0 || players.length > 2))
  // The server names who throws next (null when nobody does)
  const nextPlayer = $derived(x01?.nextPlayer ?? atc?.nextPlayer ?? null)
  // Around the Clock in a duel: the other player, whose target the board and its legend show too
  const atcOther = $derived((currentPlayer + 1) % Math.max(players.length, 1))
  // On a phone the players stay in seat order; when the turn passes, keep the thrower in view
  let phonePlayers = $state<HTMLDivElement | undefined>()
  // Changes when the turn passes or the view switches; the thrower's entry carries it
  const upKey = $derived(`${currentPlayer}-${keypad ? 'entry' : 'board'}`)
  $effect(() => {
    phonePlayers?.querySelector(`[data-up="${upKey}"]`)?.scrollIntoView({ block: 'nearest' })
  })

  const x01Players = $derived(
    x01
      ? players.map((_, i) =>
          x01Player(x01, i, {
            active: i === currentPlayer && isActive,
            suggest: settings.checkoutSuggestions,
            checkout,
            bust: i === currentPlayer && bust,
            scoreUpdates: settings.scoreUpdates,
          }),
        )
      : [],
  )
  const atcPlayers = $derived(atc ? players.map((_, i) => atcPlayer(atc, i)) : [])
  const leaders = $derived(atcLeaders(atc?.hitCounts ?? []))

  // ── Center column ─────────────────────────────────────────────────────────
  const outMode = $derived(x01?.config.outMode ?? 'double')
  const hitCount = $derived(atc?.hitCounts.at(currentPlayer) ?? 0)
  // X01 sends where the visit started; Around the Clock still tracks it in the browser
  const visitStart = $derived(x01 ? (x01.visitStartScores.at(currentPlayer) ?? null) : (history.start.at(currentPlayer) ?? null))
  const slots = $derived(
    isX01
      ? x01Slots({
          darts,
          outMode,
          bust,
          remaining: x01Players[currentPlayer]?.remaining ?? 0,
          opened: x01Players[currentPlayer]?.opened ?? true,
          suggest: settings.checkoutSuggestions && isActive,
          checkout,
        })
      : atcSlots({
          darts,
          hits,
          target: isActive ? (atcPlayers[currentPlayer]?.target ?? null) : null,
          multiplierAdvances: atc?.cfg.multiplierAdvances === true,
          walk: atc && visitStart !== null ? { sequence: atc.sequence, start: visitStart } : undefined,
        }),
  )

  const band = $derived(
    isX01
      ? x01Band({
          darts,
          bust,
          left: x01Players[currentPlayer]?.remaining ?? 0,
          // What the engine actually took off, when the visit's start is known
          scored: !bust && visitStart !== null ? visitStart - (x01Players[currentPlayer]?.remaining ?? 0) : undefined,
        })
      : atcBand({
          dartCount: darts.length,
          advanced: atcAdvanced(hitCount, visitStart, hits),
          target: atcPlayers[currentPlayer]?.target ?? '',
        }),
  )
  // Every finished visit: the visit sum starts over at 0 without rolling
  const visitKey = $derived((game?.totalVisits ?? []).reduce((a, v) => a + v, 0))
  const popIndex = $derived(isX01 ? bigDartIndex(darts, { opened: x01Players[currentPlayer]?.opened ?? true, bust }) : null)

  // Around the players and the board: tighter in the tablet band (md up to xl)
  const mainPad = 'px-5 py-[18px] gap-[18px] xl:px-7 xl:py-6 xl:gap-6'

  const sequence = $derived(atc?.sequence ?? [])
  const targets = $derived(atc?.targets ?? [])
  // Only the very next dart's suggestion is highlighted on the board itself; later darts in
  // the chain only show in the dart slots below it.
  const checkoutTargets = $derived(boardCheckoutTargets(slots, isX01))
  const boardTarget = $derived(!isX01 && isActive ? atcTargetSegment(sequence, targets.at(currentPlayer)) : null)
  const boardNext = $derived(!isX01 && isActive && players.length === 2 ? atcTargetSegment(sequence, targets.at(atcOther)) : null)
  const markers = $derived(
    !isX01 && isActive && players.length > 2 && settings.showMarkers
      ? players
          .map((p, i) => ({
            initial: initial(p.name),
            segment: atcTargetSegment(sequence, targets.at(i)) ?? 0,
            isActive: i === currentPlayer,
          }))
          .filter(m => m.segment > 0)
      : [],
  )
  const legend = $derived.by((): { label: string; kind: 'current' | 'next' | 'others' }[] => {
    if (isX01 || !isActive || players.length === 1) return []
    if (players.length > 2)
      return settings.showMarkers
        ? [
            { label: 'Current target', kind: 'current' },
            { label: "Others' targets", kind: 'others' },
          ]
        : [{ label: 'Current target', kind: 'current' }]
    return [
      { label: `${players[currentPlayer]?.name} · ${atcPlayers[currentPlayer]?.target}`, kind: 'current' },
      { label: `${players[atcOther]?.name} · ${atcPlayers[atcOther]?.target}`, kind: 'next' },
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
  const rowTemplate = $derived(
    players
      .map((_, i) => (!isX01 ? 'minmax(110px, 1fr)' : isActive && i === currentPlayer ? 'minmax(150px, 1.55fr)' : 'minmax(96px, 1fr)'))
      .join(' '),
  )

  // ── Actions ───────────────────────────────────────────────────────────────
  const send = (action: UserAction) => sessionStore?.send(action)
  const undo = () => send({ type: 'undo_dart' })
  const advance = () => send({ type: 'takeout' })
  // Undo takes back the last dart, or with none open reopens the last visit (its thrower is up
  // again) — available whenever the viewer's own seat (bot included) is up, even though `canThrow`
  // excludes a bot: the host may still need to correct a misdetected bot throw.
  const canUndo = $derived(connected && isActive && myTurn && (darts.length > 0 || snapshot?.canUndoVisit === true))
  // A visit that wins a leg (not the match): same check as the leg-won caller line in endOfVisit
  const legWon = $derived(
    x01 !== null && x01.visitLocked && x01.scores[x01.currentPlayer] === 0 && legsOf(x01, x01.currentPlayer) + 1 < x01.firstTo,
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
  const minigolfLastRoll = $derived(minigolf?.finished ? (rollFor(minigolf)?.key ?? null) : null)
  const minigolfHold = $derived(minigolfLastRoll !== null && minigolfLastRoll !== minigolfRolled)
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

{#snippet waitingCard(compact: boolean)}
  {#if remote.kind === 'waiting'}
    <WaitingCard
      name={remote.name}
      disconnectedAt={remote.disconnectedAt}
      canAbort={remote.canAbort}
      onabort={() => (showEndConfirm = true)}
      {compact}
    />
  {/if}
{/snippet}

{#snippet board(minHeight: string, maxWidth: string, keypadClass = 'min-h-0', onKey = false)}
  <BoardOrKeypad
    keypad={onKey}
    {darts}
    {canThrow}
    {locked}
    {canUndo}
    {next}
    onUndo={undo}
    onNext={advance}
    onBoardClick={addBoardDart}
    onDart={canThrow ? addManualDart : () => {}}
    onCorrect={correct}
    bind:openDart={correcting}
    board={{
      dim: !isX01,
      target: boardTarget,
      nextTarget: boardNext,
      playerMarkers: markers,
      checkoutTargets: isActive ? checkoutTargets : [],
      onDartMove: canThrow ? moveDart : undefined,
      cameraSrc,
    }}
    class={minHeight}
    square={maxWidth}
    {keypadClass}
  >
    {#snippet over()}<BoardViewToggle bind:settings {snapshot} {cameraVersions} />{/snippet}
  </BoardOrKeypad>
{/snippet}

{#snippet keypadView(keypadClass: string)}{@render board('', '', keypadClass, true)}{/snippet}

{#snippet portraitCenter()}
  <!-- Portrait (Match-Vertical): this visit and the slots in one strip, the controls, then the board fills the rest -->
  {#if remote.kind === 'play-offline'}<OfflineNotice board={remote.board} />{/if}
  <div class="shrink-0 grid gap-[10px] items-start {settings.visitSum ? 'grid-cols-[minmax(0,1.15fr)_minmax(0,3fr)]' : 'grid-cols-1'}">
    {#if settings.visitSum}<VisitBand {band} visit={visitKey} compact />{/if}
    <DartSlots {slots} {popIndex} onCorrect={correct} bind:openDart={correcting} />
  </div>
  {#if keypad}
    {@render keypadView('min-h-0')}
  {:else}
    {#if turn}
      <TurnStatusBar status={turn} />
    {:else}
      <ControlBar {canUndo} label={next.label} prominent={next.prominent} enabled={next.enabled} onUndo={undo} onNext={advance} />
    {/if}
    {#if remote.kind === 'waiting' && portraitCards}
      <!-- The cards have no room for it: the waiting card takes the board's place -->
      <div class="flex-1 min-h-0 flex rounded-[16px] bg-surface-panel border border-line-2">{@render waitingCard(false)}</div>
    {:else}
      {#if caption}<BoardCaption {caption} />{/if}
      {@render board('min-h-[200px]', '')}
      {#if legend.length}<BoardLegend items={legend} />{/if}
    {/if}
  {/if}
{/snippet}

{#snippet phoneCenter()}
  {#if remote.kind === 'play-offline'}<OfflineNotice board={remote.board} compact />{/if}
  <!-- Phones: everything fits without scrolling; the board, keypad or waiting card takes what's left -->
  {#if remote.kind === 'waiting'}
    <div class="flex-1 min-h-[160px] flex rounded-[16px] bg-surface-panel border border-line-2">{@render waitingCard(true)}</div>
  {:else if !keypad}
    {#if caption}<BoardCaption {caption} compact />{/if}
    {@render board('min-h-[160px]', '')}
  {/if}
  <!-- relative: the board view's correction picker opens above this row, over the board, full width -->
  <div class="relative shrink-0 grid gap-2 items-start {settings.visitSum ? 'grid-cols-[minmax(0,3fr)_minmax(0,1fr)]' : 'grid-cols-1'}">
    <DartSlots {slots} {popIndex} onCorrect={correct} bind:openDart={correcting} showPopover={!keypad} popoverAbove />
    {#if settings.visitSum}<VisitBand {band} visit={visitKey} compact />{/if}
  </div>
  {#if keypad}
    {@render keypadView('min-h-[220px]')}
  {:else if turn}
    <TurnStatusBar status={turn} compact />
  {:else}
    <ControlBar compact {canUndo} label={next.label} prominent={next.prominent} enabled={next.enabled} onUndo={undo} onNext={advance} />
  {/if}
{/snippet}

{#snippet center(variant: 'solo' | 'duel' | 'party')}
  {#if remote.kind === 'play-offline'}<OfflineNotice board={remote.board} />{/if}
  {#if keypad}
    {@render keypadView('min-h-0')}
  {:else if remote.kind === 'waiting' && variant === 'party'}
    <!-- Rows have no room for an overlay: the waiting card takes the board's place -->
    <div class="flex-1 min-h-0 flex rounded-[16px] bg-surface-panel border border-line-2">{@render waitingCard(false)}</div>
  {:else}
    {#if caption}<BoardCaption {caption} />{/if}
    {@render board('min-h-0', variant === 'duel' ? 'max-w-[400px] xl:max-w-none' : '')}
    {#if legend.length}<BoardLegend items={legend} />{/if}
  {/if}

  {#if variant === 'solo'}
    <div class="grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)] gap-[10px] items-start">
      <DartSlots {slots} {popIndex} onCorrect={correct} bind:openDart={correcting} />
      {#if settings.visitSum}<VisitBand {band} visit={visitKey} compact />{/if}
    </div>
  {:else}
    {#if settings.visitSum}<VisitBand {band} visit={visitKey} />{/if}
    <DartSlots {slots} {popIndex} onCorrect={correct} bind:openDart={correcting} />
  {/if}

  {#if !keypad}
    {#if turn}
      <TurnStatusBar status={turn} />
    {:else}
      <ControlBar {canUndo} label={next.label} prominent={next.prominent} enabled={next.enabled} onUndo={undo} onNext={advance} />
    {/if}
  {/if}
{/snippet}

{#snippet seatWaiting()}
  <!-- Below xl the two-player panels are 300 px: the compact card -->
  {@render waitingCard(!$isWide)}
{/snippet}

{#snippet panel(i: number)}
  {@const isWaiting = remote.kind === 'waiting' && remote.seat === i}
  {#if isX01}
    <X01Panel
      name={players[i]?.name ?? ''}
      bot={bots[i] ?? null}
      p={x01Players[i]}
      active={i === currentPlayer && isActive}
      solo={layout === 'solo'}
      portrait={layout === 'portrait'}
      pill={pillFor(i, false)}
      seat={lines[i] ?? null}
      chalkboard={settings.chalkboard}
      waiting={isWaiting ? seatWaiting : undefined}
    />
  {:else}
    <AtcPanel
      name={players[i]?.name ?? ''}
      bot={bots[i] ?? null}
      p={atcPlayers[i]}
      active={i === currentPlayer && isActive}
      solo={layout === 'solo'}
      portrait={layout === 'portrait'}
      pill={pillFor(i, false)}
      seat={lines[i] ?? null}
      waiting={isWaiting ? seatWaiting : undefined}
    />
  {/if}
{/snippet}

{#snippet duelPanel(i: number)}
  <!-- Tablets: a fixed 300 px panel; desktops lay the panel out as if the wrapper weren't there -->
  <div class="w-[300px] shrink-0 min-w-0 min-h-0 flex xl:contents">
    {@render panel(i)}
  </div>
{/snippet}

{#snippet teamWaiting()}{@render waitingCard(false)}{/snippet}

{#snippet teamPanel(t: number, compact: boolean)}
  {@const team = teams[t]}
  {#if team}
    <!-- A disconnected thrower's team: the waiting card covers the score, below the players
         (compact panels have no room: the board's place shows it instead) -->
    {@const awaySeat = remote.kind === 'waiting' ? remote.seat : null}
    {@const away = team.members.some(m => m.seat === awaySeat)}
    <TeamPanel
      {team}
      seats={lines}
      {bots}
      chalkboard={settings.chalkboard && !compact}
      {compact}
      overlay={away && !compact ? teamWaiting : undefined}
    />
  {/if}
{/snippet}

{#snippet phoneLayout()}
  <!-- Everyone in seat order; the thrower's entry is the active one (card on the board, a row with the keypad).
       Many players scroll, and the thrower is kept in view. -->
  <div bind:this={phonePlayers} class="shrink-0 max-h-[55%] overflow-y-auto flex flex-col gap-2">
    {#if teams.length}
      <!-- Teams: side by side, compact; with the keypad on a short screen only the throwing team's -->
      <div class="grid grid-cols-2 gap-2 items-stretch">
        {#each teams as team, t (team.id)}
          <div
            data-up={team.active ? upKey : undefined}
            class="flex min-w-0 {!team.active && keypad ? '[@media(max-height:599px)]:hidden' : ''}"
          >
            {@render teamPanel(t, true)}
          </div>
        {/each}
      </div>
    {:else}
      {#each players as player, i (i)}
        {@const up = i === currentPlayer}
        {@const line = lines[i] ?? null}
        <div data-up={up ? upKey : undefined} class={!up && keypad ? '[@media(max-height:599px)]:hidden' : ''}>
          {#if up && !keypad}
            {#if isX01}
              <PhoneX01Card name={player.name} p={x01Players[i]} pill={pillFor(i, false)} seat={line} chalkboard={settings.chalkboard} />
            {:else}
              <PhoneAtcCard name={player.name} p={atcPlayers[i]} pill={pillFor(i, false)} seat={line} />
            {/if}
          {:else if isX01}
            <PhonePlayerRow
              active={up}
              name={player.name}
              bot={bots[i] ?? null}
              you={line?.you ?? false}
              pill={up ? null : pillFor(i, true)}
              sub={rowSub(
                up
                  ? x01Players[i]?.canFinish
                    ? `Throwing · can finish ${x01Players[i]?.canFinish}`
                    : 'Throwing'
                  : i === nextPlayer
                    ? x01Players[i]?.canFinish
                      ? `Up next · can finish ${x01Players[i]?.canFinish}`
                      : 'Up next'
                    : `Avg ${x01Players[i]?.avg ?? '0.0'}`,
                line,
              )}
              valueLabel="Left"
              value={String(x01Players[i]?.shown ?? '')}
              roll={x01Players[i] ? x01Roll(x01Players[i]) : {}}
              legs={{ total: x01Players[i]?.firstTo ?? 1, won: x01Players[i]?.legsWon ?? 0 }}
            />
          {:else}
            <PhonePlayerRow
              active={up}
              name={player.name}
              bot={bots[i] ?? null}
              you={line?.you ?? false}
              pill={up ? null : pillFor(i, true)}
              sub={rowSub(
                up
                  ? `${atcPlayers[i]?.done ?? 0} of ${atcPlayers[i]?.total ?? 0} done`
                  : i === nextPlayer
                    ? 'Up next'
                    : `${atcPlayers[i]?.done ?? 0} of ${atcPlayers[i]?.total ?? 0} done`,
                line,
              )}
              valueLabel="Target"
              value={atcPlayers[i]?.target ?? ''}
              roll={{ normal: 'up', progress: atcPlayers[i]?.done }}
            />
          {/if}
        </div>
      {/each}
    {/if}
  </div>
  <div class="flex-1 min-h-0 flex flex-col gap-2">{@render phoneCenter()}</div>
{/snippet}

{#snippet portraitLayout()}
  <!-- The players side by side on top (many scroll, the thrower kept in view), the board below -->
  <div
    bind:this={phonePlayers}
    class="shrink-0 max-h-[45%] overflow-y-auto grid gap-3 lg:gap-4 {players.length === 1 && !teams.length ? 'grid-cols-1' : 'grid-cols-2'}"
  >
    {#if teams.length}
      {#each teams as team, t (team.id)}
        <div data-up={team.active ? upKey : undefined} class="flex min-w-0">{@render teamPanel(t, true)}</div>
      {/each}
    {:else}
      {#each players as player, i (i)}
        <div data-up={i === currentPlayer ? upKey : undefined} class="flex min-w-0">
          {#if !portraitCards}
            {@render panel(i)}
          {:else if isX01}
            <X01Card
              name={player.name}
              bot={bots[i] ?? null}
              p={x01Players[i]}
              active={i === currentPlayer && isActive}
              pill={pillFor(i, true)}
              seat={lines[i] ?? null}
            />
          {:else}
            <AtcCard
              name={player.name}
              bot={bots[i] ?? null}
              p={atcPlayers[i]}
              active={i === currentPlayer && isActive}
              pill={pillFor(i, true)}
              seat={lines[i] ?? null}
            />
          {/if}
        </div>
      {/each}
    {/if}
  </div>
  {@render portraitCenter()}
{/snippet}

{#snippet soloLayout()}
  {@render panel(0)}
  <div class="flex-1 min-w-[380px] min-h-0 flex flex-col gap-3">{@render center('solo')}</div>
{/snippet}

{#snippet teamsLayout()}
  <div class="col-start-1 row-start-1 min-w-0 min-h-0 flex">{@render teamPanel(0, !$isWide)}</div>
  <div class="col-start-2 row-start-1 min-h-0 flex flex-col gap-3 {$isWide ? '' : 'row-span-2'}">
    {@render center($isWide ? 'duel' : 'party')}
  </div>
  <div class="min-w-0 min-h-0 flex {$isWide ? 'col-start-3 row-start-1' : 'col-start-1 row-start-2'}">
    {@render teamPanel(1, !$isWide)}
  </div>
{/snippet}

{#snippet duelLayout()}
  {@render duelPanel(0)}
  <div class="flex-1 min-w-0 xl:w-[560px] xl:flex-none min-h-0 flex flex-col gap-[10px] xl:gap-3">{@render center('duel')}</div>
  {@render duelPanel(1)}
{/snippet}

{#snippet partyLayout()}
  <div class="flex-1 min-w-0 min-h-0 grid gap-3 overflow-y-auto" style:grid-template-rows={rowTemplate}>
    {#each players as player, i (i)}
      {#if isX01}
        <X01Row
          name={player.name}
          bot={bots[i] ?? null}
          p={x01Players[i]}
          active={i === currentPlayer && isActive}
          pill={pillFor(i, true)}
          seat={lines[i] ?? null}
        />
      {:else}
        <AtcRow
          name={player.name}
          bot={bots[i] ?? null}
          p={atcPlayers[i]}
          active={i === currentPlayer && isActive}
          pill={pillFor(i, true)}
          seat={lines[i] ?? null}
        />
      {/if}
    {/each}
  </div>
  <aside class="w-[400px] xl:w-[480px] shrink-0 min-h-0 flex flex-col gap-3" aria-label="Board">{@render center('party')}</aside>
{/snippet}

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
      {:else if !game}
        <main class="flex-grow flex items-center justify-center">
          <p class="text-text-muted">Unsupported game</p>
        </main>
      {:else}
        <MatchFrame
          {layout}
          phone={phoneLayout}
          portrait={portraitLayout}
          solo={soloLayout}
          teams={teamsLayout}
          duel={duelLayout}
          party={partyLayout}
          phoneScroll={false}
          side={{
            duel: `${mainPad} flex`,
            party: `${mainPad} flex`,
            teams: `px-7 py-6 grid gap-6 ${$isWide ? 'grid-cols-[minmax(0,1fr)_560px_minmax(0,1fr)] grid-rows-1' : 'grid-cols-[minmax(0,1fr)_480px] grid-rows-2'}`,
          }}
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
