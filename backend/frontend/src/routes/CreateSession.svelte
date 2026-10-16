<script lang="ts">
  // The Play page: pick a game and set it up. The lobby holds the people (spec: Every game is a
  // lobby): Choose players saves the game as your lobby's next game and goes there, opening a
  // lobby when you have none; New lobby starts over with a fresh one while you're alone in yours.
  // A member of someone else's lobby sees its planned game read-only.
  import { tick, untrack } from 'svelte'
  import { fly } from 'svelte/transition'
  import { ChevronLeft, Users } from '@lucide/svelte'
  import { push, querystring } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import GameCards from '$lib/components/GameCards.svelte'
  import GameSettings from '$lib/components/GameSettings.svelte'
  import PlayButton from '$lib/components/PlayButton.svelte'
  import InvitesBanner from '$lib/components/lobby/InvitesBanner.svelte'
  import ConnectBoardCard from '$lib/components/ConnectBoardCard.svelte'
  import { nextGameSummary } from '$lib/lobby/format'
  import { me } from '$lib/lobby/sockets'
  import { initialGameSelection } from '$lib/lobby/start'
  import { Button } from '$lib/components/ui/button/index.js'
  import { currentUser } from '$lib/auth'
  import {
    chosenGame as pickChosenGame,
    lobbyPath,
    offersNewLobby,
    playAction,
    playLabel,
    saveNextGame,
    startFreshLobby,
    type PlayAction,
  } from '$lib/lobby/play'
  import { loadPrefs, savePrefs } from '$lib/gamePrefs'
  import { loadSettings } from '$lib/gameSettings'
  import { GAME_CATEGORIES, GAME_MODES, gameModes, listedMode, shownModes, withDefaults } from '$lib/gameModes'

  // ── Preference persistence ──────────────────────────────────────────────────
  const X01_DEFAULTS: Record<string, unknown> = {
    format: 'singles',
    startScore: 501,
    inMode: 'straight',
    outMode: 'double',
    bullOff: 'off',
    bullValue: '25_50',
    maxRounds: 50,
    firstTo: 3,
  }

  type Config = Record<string, unknown>
  const initPrefs = loadPrefs(localStorage)
  // The account's New game defaults (Settings: Game preferences) pre-fill X01 over this device's
  // last setup. shortcut: read from the device's cache, which the account's settings fill after
  // sign-in; on a new device's very first open they may land after this page, until its next open.
  const account = loadSettings(localStorage)
  const x01Defaults: Config = {
    startScore: account.x01StartScore,
    outMode: account.x01OutMode,
    firstTo: account.x01FirstTo,
    bullOff: account.x01BullOff,
  }
  const initConfigs: Partial<Record<string, Config>> = {
    ...initPrefs?.configs,
    x01: { ...initPrefs?.configs.x01, ...x01Defaults },
  }

  // The backend's modes (defaults, settings meta), loaded once for this page and the lobby
  const games = $derived($gameModes)
  let selectedMode = $state(initPrefs?.mode ?? 'atc')
  // A game is picked: its settings show beside the games, which shrink to a list. The page
  // opens on every game; the saved mode's settings are still there once it's picked again.
  let open = $state(false)
  let error = $state('')
  let busy = $state(false)

  // X01's defaults are the form's own; the other modes take theirs from the backend
  const gameDefaults = $derived<Partial<Record<string, Config>>>({
    ...Object.fromEntries(games.filter(g => g.id !== 'x01').map(g => [g.id, g.defaultConfig])),
    x01: X01_DEFAULTS,
  })
  let savedConfigs = $state<Partial<Record<string, Config>>>(initConfigs)
  let config = $state<Record<string, unknown>>({
    ...X01_DEFAULTS,
    ...(initConfigs[initPrefs?.mode ?? 'atc'] ?? {}),
  })

  // Persist whenever mode or config changes
  $effect(() => {
    savePrefs(localStorage, {
      mode: selectedMode,
      configs: { ...savedConfigs, [selectedMode]: config },
    })
  })

  // Below lg picking a card swaps the cards for the chip row, and All the other way round: keep
  // focus (and the picked chip) in view instead of dropping it to the page.
  let gamesEl = $state<HTMLElement>()
  async function keepFocus(selector: string) {
    await tick()
    const el = gamesEl?.querySelector<HTMLElement>(selector)
    if (!el?.offsetParent) return
    el.scrollIntoView({ inline: 'nearest', block: 'nearest' })
    // Focus was on what just went away (removed, or hidden and not blurred yet)
    const active = document.activeElement
    if (!(active instanceof HTMLElement) || active === document.body || !active.offsetParent) el.focus()
  }
  function pick(id: string) {
    selectMode(id)
    void keepFocus('[data-chip][aria-pressed="true"]')
  }
  function allGames() {
    open = false
    void keepFocus(`[data-game="${selectedMode}"]`)
  }

  function selectMode(id: string) {
    savedConfigs = { ...savedConfigs, [selectedMode]: { ...config } }
    selectedMode = id
    config = { ...(gameDefaults[id] ?? {}), ...(savedConfigs[id] ?? {}) }
    open = true
  }

  // Re-apply with real defaults once the modes are known (at mount when already loaded).
  // Plain: applied once, and only the "loaded" flag is tracked, not the form.
  const modesLoaded = $derived(games.length > 0)
  let defaultsApplied = false
  $effect(() => {
    if (!modesLoaded || defaultsApplied) return
    defaultsApplied = true
    untrack(() => {
      // A saved mode that's no longer offered (its flag is off for you) falls back to one that is
      selectedMode = listedMode(selectedMode, games)
      config = { ...(gameDefaults[selectedMode] ?? {}), ...(savedConfigs[selectedMode] ?? {}) }
    })
  })

  // Your lobby, as /ws/me sums it up: the server decides which button you get
  const action = $derived<PlayAction>(playAction($me?.lobby ?? null))
  const lobbyGame = $derived($me?.lobby?.nextGame ?? null)
  const lobbyGameInfo = $derived(lobbyGame ? games.find(g => g.id === lobbyGame.gameId) : undefined)
  // The server's defaults, as the lobby's own cards use them
  const lobbyGameDefaults = $derived(lobbyGameInfo?.defaultConfig ?? {})
  // At least one seat in the current lobby is a bot: shows Bot speed in the settings form
  const lobbyHasBot = $derived($me?.lobby?.hasBot ?? false)

  // The host's form starts from the lobby's saved next game: applied once, the first time it's
  // known (after the defaults above), so the host's later edits here aren't overwritten by it.
  let lobbyGameApplied = false
  $effect(() => {
    if (lobbyGameApplied || !modesLoaded || action !== 'continue' || !lobbyGame) return
    lobbyGameApplied = true
    const saved = lobbyGame
    untrack(() => {
      const picked = initialGameSelection(saved, { mode: selectedMode, config }, m => gameDefaults[m])
      selectedMode = picked.mode
      config = picked.config
      open = true
    })
  })

  // A member of someone else's lobby can't edit: the page shows the lobby's planned game
  const canEditGame = $derived(action !== 'open')
  const displayMode = $derived(canEditGame ? selectedMode : (lobbyGame?.gameId ?? null))
  const showPanel = $derived(open || !canEditGame)
  const selectedInfo = $derived(games.find(g => g.id === selectedMode))
  const shown = $derived(GAME_MODES.find(m => m.id === displayMode))
  const shownName = $derived(shown?.name ?? displayMode ?? 'No game yet')
  const summary = $derived(
    canEditGame
      ? nextGameSummary({ gameId: selectedMode, config }, gameDefaults[selectedMode], null, selectedInfo?.configMeta)
      : nextGameSummary(lobbyGame, lobbyGameDefaults, null, lobbyGameInfo?.configMeta),
  )
  const invites = $derived($me?.invites.length ?? 0)

  // "Play on this board" on the Boards page (#/?board=): the lobby page moves your row there
  const boardFromLink = new URLSearchParams($querystring ?? '').get('board')
  // New lobby: only while you host a solo lobby with no game running (nobody gets left behind)
  const newLobby = $derived(offersNewLobby($me?.lobby ?? null))
  // Until /ws/me arrives the page doesn't know your lobby: no button yet, so nobody creates a
  // lobby they already have or saves over someone else's next game
  const loading = $derived($me === null)

  /** The picked mode and settings as the API takes them; null (with the error shown) if the backend has no such game. */
  function chosenGame(): { gameId: string; config: Record<string, unknown> } | null {
    const picked = pickChosenGame(games, selectedMode, config)
    if (!picked) error = 'No game found. Is the backend running?'
    return picked
  }

  async function toLobby() {
    if (busy || loading) return
    error = ''
    if (action === 'open') {
      void push(lobbyPath(boardFromLink))
      return
    }
    const picked = chosenGame()
    if (!picked) return
    busy = true
    try {
      const failed = await saveNextGame($me?.lobby?.id ?? null, picked)
      if (failed) error = failed
      else void push(lobbyPath(boardFromLink))
    } finally {
      busy = false
    }
  }

  /** New lobby: closes yours (your guests and bots go with it) and opens a fresh one with this game. */
  async function freshLobby() {
    const lobbyId = $me?.lobby?.id
    if (busy || loading || !lobbyId) return
    error = ''
    const picked = chosenGame()
    if (!picked) return
    busy = true
    try {
      const failed = await startFreshLobby(lobbyId, picked)
      if (failed) error = failed
      else void push(lobbyPath(boardFromLink))
    } finally {
      busy = false
    }
  }
</script>

<Layout title="New game">
  <main class="flex flex-grow flex-col gap-4 md:gap-[22px] box-border min-w-0 overflow-y-auto p-4 md:p-[30px_36px] xl:p-[36px_44px]">
    {#if invites > 0}<InvitesBanner count={invites} />{/if}
    <!-- Phones and tablets have no side nav, where desktops get this card -->
    <div class="xl:hidden empty:hidden"><ConnectBoardCard compact /></div>

    <!-- Header (phones: the title is in the phone header) -->
    <header class="flex items-end justify-between {showPanel ? 'max-md:hidden' : ''}">
      <div class="flex flex-col gap-[6px]">
        <h1 class="hidden md:block m-0 font-display font-bold text-[44px] xl:text-[48px] leading-none uppercase tracking-[0.02em]">
          New game
        </h1>
        <p class="m-0 text-[14px] md:text-[15px] text-text-muted">
          {#if !canEditGame}
            The host picks the game. You play it in the lobby.
          {:else if showPanel}
            Set up {shownName}, then choose who plays in the lobby.
          {:else}
            Pick a game. Players are chosen in the lobby next.
          {/if}
        </p>
      </div>
    </header>

    <!-- Every game; once one is picked, a list beside its settings from lg (only the settings below) -->
    <div class="flex flex-col lg:flex-row gap-[14px] md:gap-4 lg:gap-5 xl:gap-6 lg:flex-grow lg:min-h-0">
      <section
        aria-label="Games"
        bind:this={gamesEl}
        class="flex flex-col gap-[14px] min-w-0 transition-[width] duration-[450ms] ease-[cubic-bezier(.2,.8,.2,1)] {showPanel
          ? 'lg:w-[260px] xl:w-[300px] lg:flex-shrink-0'
          : 'w-full'}"
      >
        {#if showPanel && canEditGame}
          <Button variant="ghost" size="sm" class="hidden lg:flex self-start pl-2 pr-3 gap-[6px] font-semibold" onclick={allGames}>
            <ChevronLeft size={16} />All games
          </Button>
          <!-- Below lg the cards make way for a row of the games to switch between -->
          <div class="lg:hidden flex gap-[6px] overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-[2px]">
            <Button
              variant="ghost"
              size="sm"
              aria-label="All games"
              class="flex-shrink-0 h-10 px-[10px] gap-1 text-[13px] font-semibold"
              onclick={allGames}
            >
              <ChevronLeft size={16} />All
            </Button>
            {#each $shownModes.filter(m => m.available) as m (m.id)}
              {@const on = m.id === selectedMode}
              <Button
                variant="outline"
                data-chip
                aria-pressed={on}
                class="flex-shrink-0 px-[14px] border-line-2 bg-surface-panel font-display font-bold text-[16px] uppercase {on
                  ? 'border-2 border-accent bg-surface-picked'
                  : ''}"
                onclick={() => pick(m.id)}
              >
                {m.name}
              </Button>
            {/each}
          </div>
        {/if}
        <div class={showPanel ? 'hidden lg:block' : ''}>
          <GameCards selected={displayMode} open={showPanel} disabled={!canEditGame} onselect={pick} />
        </div>
      </section>

      {#if showPanel}
        <section
          aria-label="Game settings"
          in:fly={{ x: 40, duration: 450 }}
          class="w-full lg:flex-grow lg:max-w-[728px] xl:max-w-[780px] lg:min-w-0 box-border card md:rounded-[16px] flex flex-col lg:overflow-hidden"
        >
          <!-- Scrollable body: the game + its settings -->
          <div
            class="lg:flex-1 lg:min-h-0 lg:overflow-y-auto scrollbar-themed p-4 md:p-[26px_28px] pb-4 md:pb-4 flex flex-col gap-[18px] md:gap-[22px]"
          >
            <div class="flex items-center gap-3 md:gap-[18px] md:pb-[18px] md:border-b border-surface-paused">
              {#if shown}
                <span
                  aria-hidden="true"
                  class="w-14 h-[50px] md:w-20 md:h-[72px] flex-shrink-0 rounded-[9px] md:rounded-[10px] border border-line bg-cover bg-[75%_center]"
                  style:background-image={`url("${shown.img}")`}
                ></span>
                <span class="flex flex-col gap-1 min-w-0">
                  <span class="text-[11px] md:text-[12px] font-semibold label-caps text-text-dim"
                    >{GAME_CATEGORIES.find(c => c.id === shown.cat)?.name}</span
                  >
                  <h2 class="m-0 font-display font-bold text-[26px] md:text-[38px] leading-none uppercase">{shown.name}</h2>
                  <span class="text-[13px] md:text-[14px] text-text-muted">{shown.desc}</span>
                </span>
              {:else}
                <h2 class="m-0 font-display font-bold text-[26px] md:text-[38px] leading-none uppercase">{shownName}</h2>
              {/if}
            </div>

            {#if !canEditGame}
              {#if lobbyGame}
                <GameSettings
                  gameId={lobbyGame.gameId}
                  config={withDefaults(lobbyGame.config, lobbyGameDefaults)}
                  defaults={lobbyGameDefaults}
                  meta={lobbyGameInfo?.configMeta ?? {}}
                  teams={lobbyGameInfo?.teams ?? false}
                  hasBot={lobbyHasBot}
                  readonly
                  wide
                />
              {:else}
                <p class="m-0 p-4 border border-line-2 rounded-[10px] bg-surface-2 text-[14px] leading-[1.5] text-text-muted">
                  {$me?.lobby?.hostName ?? 'The host'} hasn't picked a game yet.
                </p>
              {/if}
            {:else}
              <GameSettings
                gameId={selectedMode}
                {config}
                defaults={gameDefaults[selectedMode] ?? {}}
                meta={selectedInfo?.configMeta ?? {}}
                teams={selectedInfo?.teams ?? false}
                hasBot={lobbyHasBot}
                wide
                onchange={(key: string, value: unknown) => (config = { ...config, [key]: value })}
              />
            {/if}
            {#if canEditGame && selectedMode === 'minigolf' && $currentUser?.isAdmin}
              <a href="#/admin/minigolf/courses" class="self-start text-[14px] font-semibold">Edit courses</a>
            {/if}
            <!-- Phones: the rules line closes the settings; the bar below holds only the button -->
            {#if summary}<span class="md:hidden text-[12px] text-text-dim">{summary} · players next, in the lobby</span>{/if}
          </div>

          <!-- Sticky bottom: the settings in one line, error + main button -->
          <div
            class="sticky -bottom-4 bg-bg md:static md:bg-transparent rounded-b-[16px] px-4 pb-6 md:px-7 md:pb-[26px] pt-[10px] md:pt-[18px] flex flex-col md:flex-row md:items-center md:gap-4 border-t border-surface-paused"
          >
            <span class="flex flex-col gap-[3px] min-w-0 md:flex-grow">
              {#if summary}<span class="hidden md:block text-[14px] font-semibold text-text">{summary}</span>{/if}
              <span class="hidden md:inline-flex items-center gap-[6px] text-[13px] text-text-dim">
                <Users size={14} aria-hidden="true" />Players, teams and throw order come next, in the lobby
              </span>
              {#if error}<span class="mb-2 md:mb-0 text-[14px] text-live-text">{error}</span>{/if}
            </span>
            <div class="flex flex-col gap-2 md:flex-shrink-0">
              <PlayButton label={loading ? 'Loading…' : playLabel(action)} {busy} disabled={loading} onclick={() => void toLobby()} />
              {#if newLobby && !loading}
                <Button variant="ghost" size="md" disabled={busy} onclick={() => void freshLobby()}>New lobby</Button>
              {/if}
            </div>
          </div>
        </section>
      {/if}
    </div>
  </main>
</Layout>
