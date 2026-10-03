<script lang="ts">
  // The Play page: pick a game, set it up, Game on. It always plays in your lobby, and opens
  // one when you have none. While the lobby is solo the players are edited right here.
  import { ArrowRight, Check } from '@lucide/svelte'
  import { onMount } from 'svelte'
  import { push, querystring } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import Tooltip from '$lib/components/Tooltip.svelte'
  import Stepper from '$lib/components/Stepper.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import LobbyPlayersCard from '$lib/components/lobby/LobbyPlayersCard.svelte'
  import SoloPlayers from '$lib/components/lobby/SoloPlayers.svelte'
  import InvitesBanner from '$lib/components/lobby/InvitesBanner.svelte'
  import StartAnywayConfirm from '$lib/components/lobby/StartAnywayConfirm.svelte'
  import type { Lobby } from '$lib/api/lobby-ws'
  import { api, type ConfigFieldMeta, type GameInfo } from '$lib/api'
  import { currentUser } from '$lib/auth'
  import { describeConflict } from '$lib/lobby/input'
  import { gameName, nextGameSummary } from '$lib/lobby/format'
  import { hasBullOff, hostName as hostNameOf, isHost, myRow, type OwnBoard } from '$lib/lobby/rules'
  import { createLobby } from '$lib/lobby/create'
  import { createLobbyStore, me } from '$lib/lobby/sockets'
  import { initialGameSelection, startGame } from '$lib/lobby/start'
  import { activeSessionId } from '$lib/activeSession'
  import { loadPrefs, savePrefs } from '$lib/gamePrefs'

  const MODES = [
    { id: 'atc',        glyph: 'ATC',    name: 'Around the Clock', desc: 'Hit 1 through 20 in order, then finish on your chosen target.', available: true  },
    { id: 'x01',        glyph: 'X01',    name: 'X01',               desc: 'Count down from your chosen score. Configure check-in, check-out, and bull off.', available: true  },
    { id: 'soccer',     glyph: 'Soccer', name: 'Dart Soccer',       desc: 'Coming soon.',                                                 available: false },
    { id: 'tournament', glyph: 'R16',    name: 'Tournament',        desc: 'Coming soon.',                                                 available: false },
  ]

  const startScoreOptions = [
    { value: 301, label: '301' },
    { value: 501, label: '501' },
    { value: 701, label: '701' },
  ]
  const inOutOptions = [
    { value: 'straight', label: 'Straight' },
    { value: 'double',   label: 'Double'   },
    { value: 'master',   label: 'Master'   },
  ]
  const bullValueOptions = [
    { value: '25_50', label: '25 / 50' },
    { value: '50_50', label: '50 / 50' },
  ]

  // ATC config fields in display order — populated from backend configMeta
  const ATC_FIELD_ORDER = ['finishOn', 'order', 'multiplierAdvances', 'throwAgainOnAllHit'] as const

  // ── Preference persistence ──────────────────────────────────────────────────
  const X01_DEFAULTS: Record<string, unknown> = {
    startScore: 501, inMode: 'straight', outMode: 'double',
    bullOff: 'off', bullValue: '25_50', maxRounds: 50, firstTo: 3,
  }

  type Config = Record<string, unknown>
  // A numeric config field, or its default when missing or not a number
  const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d)
  const initPrefs = loadPrefs(localStorage)

  let games = $state<GameInfo[]>([])
  // Your paired boards, for the board menus on your rows; null until loaded
  let ownBoards = $state<OwnBoard[] | null>(null)
  let selectedMode = $state(initPrefs?.mode ?? 'atc')
  let atcMeta = $state<Partial<Record<string, ConfigFieldMeta>>>({})
  let error = $state('')
  // Set when the server refuses because this user already has a game running
  let runningSessionId = $state<string | null>(null)
  let loading = $state(false)

  let gameDefaults = $state<Partial<Record<string, Config>>>({ x01: X01_DEFAULTS })
  let savedConfigs = $state<Partial<Record<string, Config>>>(initPrefs?.configs ?? {})
  let config = $state<Record<string, unknown>>({
    ...X01_DEFAULTS,
    ...(initPrefs?.configs[initPrefs.mode] ?? {}),
  })

  // Persist whenever mode or config changes
  $effect(() => {
    savePrefs(localStorage, {
      mode: selectedMode,
      configs: { ...savedConfigs, [selectedMode]: config },
    })
  })

  function selectMode(id: string) {
    savedConfigs = { ...savedConfigs, [selectedMode]: { ...config } }
    selectedMode = id
    config = { ...(gameDefaults[id] ?? {}), ...(savedConfigs[id] ?? {}) }
  }

  function isNonDefault(key: string): boolean {
    const def = gameDefaults[selectedMode]
    return !!def && key in def && config[key] !== def[key]
  }

  onMount(async () => {
    const [gr, br] = await Promise.all([api.GET('/api/gamemodes'), api.GET('/api/boards')])
    if (!br.data) return   // 401 is redirected to login by the client
    games = gr.data?.modes ?? []
    ownBoards = br.data.boards.map(b => ({ id: b.id, name: b.name }))

    const atcGame = games.find(g => g.id === 'atc')
    if (atcGame) {
      atcMeta = atcGame.configMeta
      gameDefaults = { ...gameDefaults, atc: atcGame.defaultConfig }
    }

    // Re-apply with real defaults now that we have them
    config = { ...(gameDefaults[selectedMode] ?? {}), ...(savedConfigs[selectedMode] ?? {}) }
  })

  // "Game on" starts your lobby's game with its players (spec: Every game is a lobby)
  let lobby = $state<Lobby | null>(null)
  const viewerId = $derived($currentUser?.id ?? null)
  // Only the id: reading it off $me here would reopen the socket on every /ws/me push
  const lobbyId = $derived($me?.lobby?.id ?? null)

  // Your lobby exists when you need it: if the first /ws/me state this page sees has no lobby,
  // open one. Only that first one: a later "no lobby" may be a join in progress (the server
  // closes your solo lobby, then adds you to the other), so then Start playing opens one on a
  // tap. Members of someone else's lobby have theirs. Two tabs may both open one: the server
  // keeps one, and the other's in_lobby refusal just means /ws/me brings it.
  const meKnown = $derived($me !== null)
  const noLobby = $derived($me !== null && $me.lobby === null)
  // Plain, not state: only guards against a second request and nothing on screen reads it
  let opening = false
  // Plain: the first state is handled once, and the effect mustn't re-run for it
  let firstStateSeen = false
  let openError = $state('')
  async function openLobby() {
    if (opening) return
    opening = true
    openError = ''
    try {
      const created = await createLobby()
      if (!created.ok && !created.inLobby) openError = created.message
    } finally { opening = false }
  }
  $effect(() => {
    if (!meKnown || firstStateSeen) return
    firstStateSeen = true
    if (noLobby) void openLobby()
  })
  // "No lobby" that lasts (not a join passing through, not the one being opened): offer Start playing
  let showStart = $state(false)
  $effect(() => {
    if (!noLobby) { showStart = false; return }
    const t = setTimeout(() => { showStart = true }, 1500)
    return () => clearTimeout(t)
  })

  $effect(() => {
    const id = lobbyId
    if (!id) { lobby = null; return }
    const store = createLobbyStore(id)
    const unsub = store.lobby.subscribe(l => { lobby = l })
    return () => { unsub(); store.destroy() }
  })
  const lobbyHost = $derived(lobby !== null && isHost(lobby, viewerId))
  const hostName = $derived((lobby && hostNameOf(lobby)) ?? 'The host')
  const invites = $derived($me?.invites.length ?? 0)
  let confirmNames = $state<string[] | null>(null)

  // The host's form starts from the lobby's saved next game — applied once, the first time it's
  // known (at mount, or once the lobby snapshot arrives after), so the host's later edits here
  // aren't overwritten by it. A member never edits, so their view reads straight off `lobby`
  // below instead of going through this.
  let appliedLobbyGame = $state(false)
  $effect(() => {
    if (appliedLobbyGame || !lobbyHost || !lobby?.nextGame) return
    const picked = initialGameSelection(lobby.nextGame, { mode: selectedMode, config }, (m) => gameDefaults[m])
    selectedMode = picked.mode
    config = picked.config
    appliedLobbyGame = true
  })

  // What the mode grid and the setup form show: a member can't edit, so it's always the
  // lobby's own next game, live; the host and the local-only flow edit their own picks.
  const canEditGame = $derived(!lobby || lobbyHost)
  const displayMode = $derived(canEditGame ? selectedMode : lobby?.nextGame?.gameId ?? null)
  const setupName = $derived(canEditGame ? MODES.find(m => m.id === selectedMode)?.name : (displayMode ? gameName(displayMode) : 'No game yet'))

  // "Play on this board" on the Boards page (#/?board=): put yourself on that board, once your
  // lobby and boards are known. Plain, not state: the effect clears it once it's handled.
  let boardFromLink = new URLSearchParams($querystring ?? '').get('board')
  const mine = $derived(lobby ? myRow(lobby, viewerId) : null)
  const myRowId = $derived(mine?.id ?? null)
  const myBoardId = $derived(mine?.boardId ?? null)
  const openLobbyId = $derived(lobby?.id ?? null)
  $effect(() => {
    const target = boardFromLink
    const id = openLobbyId, personId = myRowId, current = myBoardId, boards = ownBoards
    if (!target || !id || !personId || !boards) return
    boardFromLink = null
    if (current === target || !boards.some(b => b.id === target)) return
    void api.PATCH('/api/lobbies/{id}/people/{personId}', { params: { path: { id, personId } }, body: { boardId: target } })
      .then(({ error: refusal }) => { if (refusal) error = describeConflict(refusal) })
  })

  // The lobby's throw order decides who throws first (the server ignores the form's bull off
  // setting), and Bull-off needs a game that has one. Who plays is the server's to check: its
  // refusal shows like any other.
  const startGameId = $derived(canEditGame ? selectedMode : lobby?.nextGame?.gameId ?? null)
  const orderProblem = $derived.by(() => {
    if (!lobby || lobby.throwOrder !== 'bulloff' || hasBullOff(startGameId)) return null
    const fix = lobby.solo ? 'Pick another throw order.' : 'Change the throw order in the lobby.'
    return `${startGameId ? gameName(startGameId) : 'This game'} has no bull off. ${fix}`
  })

  /** The picked mode and settings as the API takes them; null (with the error shown) if the backend has no such game. */
  function chosenGame(): { gameId: string; config: Record<string, unknown> } | null {
    const gameId = games.find(g => g.id === selectedMode)?.id
      ?? games.find(g => g.id.includes('501'))?.id
      ?? games[0]?.id
    if (!gameId) { error = 'No game found. Is the backend running?'; return null }
    const settings = selectedMode === 'atc'
      ? { finishOn: config.finishOn, order: config.order, multiplierAdvances: config.multiplierAdvances, throwAgainOnAllHit: config.throwAgainOnAllHit }
      : { startScore: config.startScore, inMode: config.inMode, outMode: config.outMode, bullOff: config.bullOff, bullValue: config.bullValue, maxRounds: config.maxRounds, firstTo: config.firstTo }
    return { gameId, config: settings }
  }

  async function startInLobby(force = false) {
    if (!lobby || orderProblem) return
    const id = lobby.id
    error = ''
    runningSessionId = null
    const picked = chosenGame()
    if (!picked) return
    loading = true
    try {
      // Confirming "start anyway" repeats only the start: the next game is already saved
      if (!force) {
        const set = await api.PATCH('/api/lobbies/{id}', { params: { path: { id } }, body: { nextGame: picked } })
        if (set.error) { error = describeConflict(set.error); return }
      }
      const outcome = await startGame(id, { force })
      if (outcome.kind === 'started') { void activeSessionId.refresh(); void push(`/session/${outcome.sessionId}`) }
      else if (outcome.kind === 'confirm') confirmNames = outcome.notReady
      else { error = outcome.message; runningSessionId = outcome.sessionId }
    } finally { loading = false }
  }
</script>

<Layout title="New game">
  <main class="flex flex-grow flex-col gap-4 md:gap-7 box-border min-w-0 overflow-y-auto p-4 md:p-[40px_44px]">

    {#if invites > 0}<InvitesBanner count={invites} />{/if}

    <!-- Header (phones: the title is in the phone header) -->
    <header class="hidden md:flex items-end justify-between">
      <div class="flex flex-col gap-[6px]">
        <h1 class="m-0 font-display font-bold text-[48px] leading-none uppercase tracking-[0.02em]">
          New game
        </h1>
        <p class="m-0 text-[15px] text-text-muted">Choose a mode, set it up, throw the first dart.</p>
      </div>
    </header>

    <div class="flex flex-col md:flex-row gap-4 md:gap-6 md:flex-grow md:min-h-0">
      <!-- Mode grid -->
      <div class="grid grid-cols-2 gap-[10px] md:flex-grow md:grid-rows-2 md:gap-4">
        {#each MODES as mode (mode.id)}
          {@const active = mode.id === displayMode}
          {@const unavailable = !mode.available}
          <button type="button"
            onclick={() => { if (mode.available && canEditGame) selectMode(mode.id) }}
            disabled={unavailable || !canEditGame}
            class="relative text-left box-border h-[92px] px-[14px] py-3 md:h-auto md:p-6 rounded-[12px] md:rounded-[14px] flex flex-col gap-[10px]
                   overflow-hidden transition-colors font-[inherit]
                   {unavailable
                     ? 'bg-surface-2 border border-line-2 opacity-40 cursor-not-allowed'
                     : active
                       ? `bg-surface-active border-2 border-accent ${canEditGame ? 'cursor-pointer' : 'cursor-default'}`
                       : `bg-surface-2 border border-line-2 ${canEditGame ? 'cursor-pointer' : 'cursor-default'}`}">
            {#if active && !unavailable}
              <span class="absolute top-2 right-2 w-6 h-6 md:top-[18px] md:right-[18px] md:w-7 md:h-7 rounded-full bg-accent
                           flex items-center justify-center">
                <Check size={16} strokeWidth={3} />
              </span>
            {/if}
            {#if unavailable}
              <span class="absolute top-[14px] right-[14px] text-[11px] font-medium tracking-[0.06em]
                           uppercase text-text-dim border border-line-3 rounded-[5px] px-[7px] py-[3px]">
                Soon
              </span>
            {/if}
            <span class="font-display font-bold text-[34px] md:text-[88px] leading-[0.9]
                         {active && !unavailable ? 'text-accent' : 'text-transparent [-webkit-text-stroke:1.5px_#5a5e53]'}">
              {mode.glyph}
            </span>
            <span class="mt-auto font-display font-bold text-[18px] md:text-[30px] uppercase tracking-[0.02em] text-text">
              {mode.name}
            </span>
            <span class="hidden md:block text-[15px] leading-[1.45] {active && !unavailable ? 'text-[#b4b5aa]' : 'text-text-muted'}">
              {mode.desc}
            </span>
          </button>
        {/each}
      </div>

      <!-- Setup aside -->
      <aside class="w-full md:w-[400px] md:flex-shrink-0 box-border border border-line-2 rounded-[14px]
                    bg-[#151713] flex flex-col md:overflow-hidden">
        <!-- Scrollable body: title + config + players -->
        <div class="md:flex-1 md:min-h-0 md:overflow-y-auto scrollbar-themed p-4 md:p-6 pb-4 md:pb-4 flex flex-col gap-[22px]">
        <div class="flex flex-col gap-1">
          <span class="text-[12px] tracking-[0.1em] uppercase text-text-dim">Setup</span>
          <h2 class="m-0 font-display font-bold text-[32px] leading-none uppercase">
            {setupName}
          </h2>
        </div>

        {#if !canEditGame}
          <div class="p-4 border border-line-2 rounded-[10px] bg-surface-2 flex flex-col gap-1">
            {#if lobby?.nextGame}
              <span class="text-[14px] leading-[1.5] text-text">{nextGameSummary(lobby.nextGame)}</span>
            {:else}
              <span class="text-[14px] leading-[1.5] text-text-muted">{hostName} hasn't picked a game yet.</span>
            {/if}
          </div>

        {:else if selectedMode === 'x01'}
          <div class="flex flex-col gap-[18px]">
            <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
              <legend class="text-[14px] font-medium text-[#d8d8ce] mb-2">Start score</legend>
              <SegmentedControl options={startScoreOptions} bind:value={config.startScore}
                defaultValue={X01_DEFAULTS.startScore} />
            </fieldset>

            <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
              <legend class="text-[14px] font-medium text-[#d8d8ce] mb-2">Check-in</legend>
              <SegmentedControl options={inOutOptions} bind:value={config.inMode}
                defaultValue={X01_DEFAULTS.inMode} />
            </fieldset>

            <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
              <legend class="text-[14px] font-medium text-[#d8d8ce] mb-2">Check-out</legend>
              <SegmentedControl options={inOutOptions} bind:value={config.outMode}
                defaultValue={X01_DEFAULTS.outMode} />
            </fieldset>

            <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
              <legend class="text-[14px] font-medium text-[#d8d8ce] mb-2">Bull value</legend>
              <SegmentedControl options={bullValueOptions} bind:value={config.bullValue}
                defaultValue={X01_DEFAULTS.bullValue} />
            </fieldset>

            <div class="flex justify-between items-center">
              <span class="flex items-center gap-2 text-[14px] font-medium text-[#d8d8ce]">Max rounds <Tooltip text="Maximum number of rounds before the game ends. The player with the lowest score wins if nobody checks out. Set higher for longer games." /></span>
              <Stepper value={num(config.maxRounds, 50)} label="rounds" highlight={isNonDefault('maxRounds')}
                onchange={(n) => config = { ...config, maxRounds: n }} />
            </div>

            <div class="flex justify-between items-center">
              <span class="text-[14px] font-medium text-[#d8d8ce]">First to</span>
              <Stepper value={num(config.firstTo, 3)} label="legs" unit={(n) => (n === 1 ? 'leg' : 'legs')} highlight={isNonDefault('firstTo')}
                onchange={(n) => config = { ...config, firstTo: n }} />
            </div>
          </div>

        {:else if selectedMode === 'atc'}
          <div class="flex flex-col gap-[18px]">
            {#each ATC_FIELD_ORDER as fieldKey (fieldKey)}
              {@const meta = atcMeta[fieldKey]}
              {#if meta?.options}
                <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
                  <legend class="flex items-center gap-2 text-[14px] font-medium text-[#d8d8ce] mb-2">
                    {meta.label}
                    {#if meta.tooltip}
                      <Tooltip text={meta.tooltip} />
                    {/if}
                  </legend>
                  <SegmentedControl
                    options={meta.options}
                    value={config[fieldKey]}
                    defaultValue={gameDefaults['atc']?.[fieldKey]}
                    onchange={(v: unknown) => config = { ...config, [fieldKey]: v }} />
                </fieldset>
              {/if}
            {/each}
          </div>

        {:else}
          <div class="p-4 border border-dashed border-[#3e4239] rounded-[10px] text-[14px]
                      leading-[1.5] text-text-muted">
            [{MODES.find(m => m.id === selectedMode)?.name} options — rules and settings to be defined]
          </div>
        {/if}

        {#if lobby && lobby.solo}
          <SoloPlayers {lobby} {viewerId} ownBoards={ownBoards ?? []} gameId={startGameId} />
        {:else if lobby}
          <LobbyPlayersCard {lobby} />
        {:else}
          <div class="flex flex-col items-start gap-2 pt-[18px] border-t border-line">
            <span class="text-[14px] font-medium text-ink-soft">Players</span>
            {#if openError}<ErrorText class="text-[13px]">{openError}</ErrorText>{/if}
            {#if showStart || openError}
              <span class="text-[13px] text-text-muted">You're not in a lobby.</span>
              <Button variant="accent" onclick={() => void openLobby()}>Start playing</Button>
            {:else}
              <span class="text-[13px] text-text-muted">Opening your lobby…</span>
            {/if}
          </div>
        {/if}

        </div><!-- end scrollable body -->

        <!-- Sticky bottom: error + start button -->
        <div class="sticky -bottom-4 bg-bg md:static md:bg-transparent rounded-b-[14px] px-4 pb-6 md:px-6 md:pb-6 pt-2 md:pt-3 flex flex-col gap-3 border-t border-line">
          {#if error}
            <p class="m-0 flex items-center justify-between gap-3 text-[14px] text-live-text">
              {error}
              {#if runningSessionId}
                <button type="button" onclick={() => push(`/session/${runningSessionId}`)}
                  class="h-9 px-3 rounded-[8px] border border-line-3 bg-transparent text-text text-[13px]
                         font-medium cursor-pointer font-[inherit] hover:bg-surface-active">
                  Return to game
                </button>
              {/if}
            </p>
          {/if}
          {#if lobbyHost && orderProblem}
            <p class="m-0 text-[13px] text-live-text">{orderProblem}</p>
          {/if}
          {#if lobby && !lobbyHost}
            <p class="m-0 h-12 md:h-14 flex items-center justify-center text-[15px] text-text-muted">{hostName} starts the game</p>
          {:else}
            <button type="button" onclick={() => void startInLobby()} disabled={!lobby || loading || orderProblem !== null}
              title={orderProblem ?? undefined}
              class="h-12 md:h-14 flex items-center justify-center gap-[10px] bg-accent text-accent-fg
                     rounded-[10px] font-display font-bold text-[20px] md:text-[22px] tracking-[0.08em] uppercase
                     border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Starting…' : 'Game on'}
              {#if !loading}<ArrowRight size={20} strokeWidth={2.2} />{/if}
            </button>
          {/if}
        </div>
      </aside>
    </div>
  </main>
</Layout>

{#if confirmNames}
  {@const names = confirmNames}
  <StartAnywayConfirm {names}
    onconfirm={() => { confirmNames = null; void startInLobby(true) }} oncancel={() => confirmNames = null} />
{/if}
