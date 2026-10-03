<script lang="ts">
  // The Play page: pick a game and set it up. The lobby holds the people (spec: Every game is a
  // lobby): the main button saves the game as your lobby's next game and goes there, opening a
  // lobby when you have none. A member of someone else's lobby sees its planned game read-only.
  import { untrack } from 'svelte'
  import { push, querystring } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import GameModeTiles from '$lib/components/GameModeTiles.svelte'
  import GameSettings from '$lib/components/GameSettings.svelte'
  import PlayButton from '$lib/components/PlayButton.svelte'
  import InvitesBanner from '$lib/components/lobby/InvitesBanner.svelte'
  import { gameName, nextGameSummary } from '$lib/lobby/format'
  import { me } from '$lib/lobby/sockets'
  import { initialGameSelection } from '$lib/lobby/start'
  import { lobbyPath, playAction, saveNextGame, type PlayAction } from '$lib/lobby/play'
  import { loadPrefs, savePrefs } from '$lib/gamePrefs'
  import { GAME_MODES, gameModes } from '$lib/gameModes'

  // ── Preference persistence ──────────────────────────────────────────────────
  const X01_DEFAULTS: Record<string, unknown> = {
    startScore: 501, inMode: 'straight', outMode: 'double',
    bullOff: 'off', bullValue: '25_50', maxRounds: 50, firstTo: 3,
  }

  type Config = Record<string, unknown>
  const initPrefs = loadPrefs(localStorage)

  // The backend's modes (defaults, settings meta), loaded once for this page and the lobby
  const games = $derived($gameModes)
  let selectedMode = $state(initPrefs?.mode ?? 'atc')
  let error = $state('')
  let busy = $state(false)

  const atcGame = $derived(games.find(g => g.id === 'atc'))
  const gameDefaults = $derived<Partial<Record<string, Config>>>(atcGame ? { x01: X01_DEFAULTS, atc: atcGame.defaultConfig } : { x01: X01_DEFAULTS })
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

  // Re-apply with real defaults once the modes are known (at mount when already loaded).
  // Plain: applied once, and only the "loaded" flag is tracked, not the form.
  const modesLoaded = $derived(games.length > 0)
  let defaultsApplied = false
  $effect(() => {
    if (!modesLoaded || defaultsApplied) return
    defaultsApplied = true
    untrack(() => { config = { ...(gameDefaults[selectedMode] ?? {}), ...(savedConfigs[selectedMode] ?? {}) } })
  })

  // Your lobby, as /ws/me sums it up: the server decides which button you get
  const action = $derived<PlayAction>(playAction($me?.lobby ?? null))
  const lobbyGame = $derived($me?.lobby?.nextGame ?? null)

  // The host's form starts from the lobby's saved next game: applied once, the first time it's
  // known (after the defaults above), so the host's later edits here aren't overwritten by it.
  let lobbyGameApplied = false
  $effect(() => {
    if (lobbyGameApplied || !modesLoaded || action !== 'continue' || !lobbyGame) return
    lobbyGameApplied = true
    const saved = lobbyGame
    untrack(() => {
      const picked = initialGameSelection(saved, { mode: selectedMode, config }, (m) => gameDefaults[m])
      selectedMode = picked.mode
      config = picked.config
    })
  })

  // A member of someone else's lobby can't edit: the mode grid shows the lobby's planned game
  const canEditGame = $derived(action !== 'open')
  const displayMode = $derived(canEditGame ? selectedMode : lobbyGame?.gameId ?? null)
  const setupName = $derived(canEditGame ? GAME_MODES.find(m => m.id === selectedMode)?.name : (displayMode ? gameName(displayMode) : 'No game yet'))
  const invites = $derived($me?.invites.length ?? 0)

  // "Play on this board" on the Boards page (#/?board=): the lobby page moves your row there
  const boardFromLink = new URLSearchParams($querystring ?? '').get('board')
  const LABELS: Record<PlayAction, string> = { create: 'Create lobby', continue: 'Continue in lobby', open: 'Open lobby' }

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

  async function toLobby() {
    if (busy) return
    error = ''
    if (action === 'open') { void push(lobbyPath(boardFromLink)); return }
    const picked = chosenGame()
    if (!picked) return
    busy = true
    try {
      const failed = await saveNextGame($me?.lobby?.id ?? null, picked)
      if (failed) error = failed
      else void push(lobbyPath(boardFromLink))
    } finally { busy = false }
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
        <p class="m-0 text-[15px] text-text-muted">Choose a mode and set it up. Your players gather in the lobby.</p>
      </div>
    </header>

    <div class="flex flex-col md:flex-row gap-4 md:gap-6 md:flex-grow md:min-h-0">
      <!-- Mode grid -->
      <GameModeTiles selected={displayMode} disabled={!canEditGame} onselect={selectMode} />

      <!-- Setup aside -->
      <aside class="w-full md:w-[400px] md:flex-shrink-0 box-border border border-line-2 rounded-[14px]
                    bg-[#151713] flex flex-col md:overflow-hidden">
        <!-- Scrollable body: title + config -->
        <div class="md:flex-1 md:min-h-0 md:overflow-y-auto scrollbar-themed p-4 md:p-6 pb-4 md:pb-4 flex flex-col gap-[22px]">
        <div class="flex flex-col gap-1">
          <span class="text-[12px] tracking-[0.1em] uppercase text-text-dim">Setup</span>
          <h2 class="m-0 font-display font-bold text-[32px] leading-none uppercase">
            {setupName}
          </h2>
        </div>

        {#if !canEditGame}
          <div class="p-4 border border-line-2 rounded-[10px] bg-surface-2 flex flex-col gap-1">
            {#if lobbyGame}
              <span class="text-[14px] leading-[1.5] text-text">{nextGameSummary(lobbyGame)}</span>
            {:else}
              <span class="text-[14px] leading-[1.5] text-text-muted">The host hasn't picked a game yet.</span>
            {/if}
          </div>
        {:else}
          <GameSettings gameId={selectedMode} {config} defaults={gameDefaults[selectedMode] ?? {}}
            meta={games.find(g => g.id === selectedMode)?.configMeta ?? {}}
            onchange={(key: string, value: unknown) => config = { ...config, [key]: value }} />
        {/if}

        </div><!-- end scrollable body -->

        <!-- Sticky bottom: error + main button -->
        <div class="sticky -bottom-4 bg-bg md:static md:bg-transparent rounded-b-[14px] px-4 pb-6 md:px-6 md:pb-6 pt-2 md:pt-3 flex flex-col gap-3 border-t border-line">
          {#if error}<p class="m-0 text-[14px] text-live-text">{error}</p>{/if}
          <PlayButton label={LABELS[action]} {busy} onclick={() => void toLobby()} />
        </div>
      </aside>
    </div>
  </main>
</Layout>
