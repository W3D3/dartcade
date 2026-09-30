<script lang="ts">
  import { onMount } from 'svelte'
  import { push, querystring } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import BoardSelector from '$lib/components/BoardSelector.svelte'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import PlayerRow from '$lib/components/PlayerRow.svelte'
  import Tooltip from '$lib/components/Tooltip.svelte'
  import { api, type Board, type ConfigFieldMeta, type GameInfo } from '$lib/api'
  import { authClient } from '$lib/auth'

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
  const bullOffOptions = [
    { value: 'off', label: 'Off' },
    { value: 'wdc', label: 'WDC', tooltip: 'Re-throw if both darts land in the same scoring area (both outer bull or both inner bull).' },
    { value: 'pdc', label: 'PDC', tooltip: 'Inner bull always beats outer bull. Re-throw only if both hit the inner bull.' },
  ]
  const bullValueOptions = [
    { value: '25_50', label: '25 / 50' },
    { value: '50_50', label: '50 / 50' },
  ]

  // ATC config fields in display order — populated from backend configMeta
  const ATC_FIELD_ORDER = ['finishOn', 'order', 'multiplierAdvances', 'throwAgainOnAllHit'] as const

  // ── Preference persistence ──────────────────────────────────────────────────
  const PREFS_KEY = 'dartcade_game_prefs'
  const X01_DEFAULTS: Record<string, unknown> = {
    startScore: 501, inMode: 'straight', outMode: 'double',
    bullOff: 'off', bullValue: '25_50', maxRounds: 50, firstTo: 3,
  }

  type SavedPrefs = { mode: string; configs: Record<string, Record<string, unknown>>; boardId?: string }
  function loadPrefs(): SavedPrefs | null {
    try { const s = localStorage.getItem(PREFS_KEY); if (s) return JSON.parse(s) } catch {}
    return null
  }
  const initPrefs = loadPrefs()

  let games = $state<GameInfo[]>([])
  let boards = $state<Board[]>([])
  let selectedMode = $state(initPrefs?.mode ?? 'atc')
  let boardId = $state(initPrefs?.boardId ?? '')
  let atcMeta = $state<Record<string, ConfigFieldMeta>>({})
  let youName = $state('')
  let guests = $state<{ name: string }[]>([])
  let error = $state('')
  // Set when the server refuses because this user already has a game running
  let runningSessionId = $state<string | null>(null)
  let loading = $state(false)

  let gameDefaults = $state<Record<string, Record<string, unknown>>>({ x01: X01_DEFAULTS })
  let savedConfigs = $state<Record<string, Record<string, unknown>>>(initPrefs?.configs ?? {})
  let config = $state<Record<string, unknown>>({
    ...X01_DEFAULTS,
    ...(initPrefs?.configs?.[initPrefs?.mode ?? 'atc'] ?? {}),
  })

  // Persist whenever mode, config or board changes
  $effect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      mode: selectedMode,
      configs: { ...savedConfigs, [selectedMode]: config },
      boardId,
    }))
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
    const [gr, br, sr] = await Promise.all([
      api.GET('/api/games'),
      api.GET('/api/boards'),
      authClient.getSession(),
    ])
    if (!br.data) return   // 401 is redirected to login by the client
    games = gr.data?.games ?? []
    boards = br.data.boards
    // A board handed over from the Boards page ("Play on this board") wins over
    // the remembered one; a remembered board that was since unpaired is dropped.
    const preselect = new URLSearchParams($querystring ?? '').get('board')
    if (preselect && boards.some(b => b.id === preselect)) boardId = preselect
    else if (boardId && !boards.some(b => b.id === boardId)) boardId = ''
    youName = sr.data?.user.name ?? sr.data?.user.email ?? 'You'

    const atcGame = games.find(g => g.id === 'atc')
    if (atcGame) {
      atcMeta = atcGame.configMeta
      gameDefaults = { ...gameDefaults, atc: atcGame.defaultConfig }
    }

    // Re-apply with real defaults now that we have them
    config = { ...(gameDefaults[selectedMode] ?? {}), ...(savedConfigs[selectedMode] ?? {}) }
  })

  // Bull off decides who throws first, so it needs an opponent (the backend
  // rejects it too). Named guests count as players, same as in start().
  const playerCount = $derived(1 + guests.filter(g => g.name.trim()).length)
  const bullOffBlocked = $derived(
    selectedMode === 'x01' && (config.bullOff ?? 'off') !== 'off' && playerCount < 2
  )

  async function start() {
    if (bullOffBlocked) return
    error = ''
    runningSessionId = null
    const allPlayers = [
      { name: youName.trim() || 'Player 1' },
      ...guests.filter(g => g.name.trim()).map(g => ({ name: g.name.trim() })),
    ]
    const gameId = games.find(g => g.id === selectedMode)?.id
      ?? games.find(g => g.id.includes('501'))?.id
      ?? games[0]?.id
    if (!gameId) { error = 'No game found. Is the backend running?'; return }
    const resolvedConfig = selectedMode === 'atc'
      ? { finishOn: config.finishOn, order: config.order, multiplierAdvances: config.multiplierAdvances, throwAgainOnAllHit: config.throwAgainOnAllHit }
      : { startScore: config.startScore, inMode: config.inMode, outMode: config.outMode, bullOff: config.bullOff, bullValue: config.bullValue, maxRounds: config.maxRounds, firstTo: config.firstTo }
    loading = true
    try {
      const res = await api.POST('/api/sessions', {
        body: { boardId: boardId || null, gameId, config: resolvedConfig, players: allPlayers },
      })
      if (res.error) {
        const err: unknown = res.error
        error = typeof err === 'object' && err !== null && 'error' in err && typeof err.error === 'string'
          ? err.error
          : 'Failed to start'
        runningSessionId = res.response.status === 409
          && typeof err === 'object' && err !== null && 'sessionId' in err && typeof err.sessionId === 'string'
          ? err.sessionId
          : null
        return
      }
      push(`/session/${res.data.sessionId}`)
    } finally { loading = false }
  }
</script>

<Layout>
  <main class="flex flex-grow flex-col gap-7 box-border min-w-0 overflow-y-auto p-[40px_44px]">

    <!-- Header -->
    <header class="flex items-end justify-between">
      <div class="flex flex-col gap-[6px]">
        <h1 class="m-0 font-display font-bold text-[48px] leading-none uppercase tracking-[0.02em]">
          New game
        </h1>
        <p class="m-0 text-[15px] text-text-muted">Choose a mode, set it up, throw the first dart.</p>
      </div>
      <BoardSelector {boards} bind:value={boardId} />
    </header>

    <div class="flex gap-6 flex-grow min-h-0">
      <!-- Mode grid -->
      <div class="flex-grow grid grid-cols-2 grid-rows-2 gap-4">
        {#each MODES as mode}
          {@const active = mode.id === selectedMode}
          {@const unavailable = !mode.available}
          <button type="button"
            onclick={() => { if (mode.available) selectMode(mode.id) }}
            disabled={unavailable}
            class="relative text-left box-border p-6 rounded-[14px] flex flex-col gap-[10px]
                   overflow-hidden transition-colors font-[inherit]
                   {unavailable
                     ? 'bg-surface-2 border border-line-2 opacity-40 cursor-not-allowed'
                     : active
                       ? 'bg-surface-active border-2 border-accent cursor-pointer'
                       : 'bg-surface-2 border border-line-2 cursor-pointer'}">
            {#if active && !unavailable}
              <span class="absolute top-[18px] right-[18px] w-7 h-7 rounded-full bg-accent
                           flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0f100e" stroke-width="3"
                  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M5 12l5 5 9-10"/>
                </svg>
              </span>
            {/if}
            {#if unavailable}
              <span class="absolute top-[14px] right-[14px] text-[11px] font-medium tracking-[0.06em]
                           uppercase text-text-dim border border-line-3 rounded-[5px] px-[7px] py-[3px]">
                Soon
              </span>
            {/if}
            <span class="font-display font-bold text-[88px] leading-[0.9]
                         {active && !unavailable ? 'text-accent' : 'text-transparent [-webkit-text-stroke:1.5px_#5a5e53]'}">
              {mode.glyph}
            </span>
            <span class="mt-auto font-display font-bold text-[30px] uppercase tracking-[0.02em] text-text">
              {mode.name}
            </span>
            <span class="text-[15px] leading-[1.45] {active && !unavailable ? 'text-[#b4b5aa]' : 'text-text-muted'}">
              {mode.desc}
            </span>
          </button>
        {/each}
      </div>

      <!-- Setup aside -->
      <aside class="w-[400px] flex-shrink-0 box-border border border-line-2 rounded-[14px]
                    bg-[#151713] flex flex-col overflow-hidden">
        <!-- Scrollable body: title + config + players -->
        <div class="flex-1 min-h-0 overflow-y-auto scrollbar-themed p-6 pb-4 flex flex-col gap-[22px]">
        <div class="flex flex-col gap-1">
          <span class="text-[12px] tracking-[0.1em] uppercase text-text-dim">Setup</span>
          <h2 class="m-0 font-display font-bold text-[32px] leading-none uppercase">
            {MODES.find(m => m.id === selectedMode)?.name}
          </h2>
        </div>

        {#if selectedMode === 'x01'}
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
              <legend class="flex items-center gap-2 text-[14px] font-medium text-[#d8d8ce] mb-2">
                Bull off
                <Tooltip text="Throw one dart each to decide who goes first. Closest to bull wins." />
              </legend>
              <SegmentedControl options={bullOffOptions} bind:value={config.bullOff}
                defaultValue={X01_DEFAULTS.bullOff} />
              {#if bullOffBlocked}
                <p class="m-0 text-[13px] text-live-text">
                  Bull off needs at least two players. Add a player or turn it off.
                </p>
              {/if}
            </fieldset>

            <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
              <legend class="text-[14px] font-medium text-[#d8d8ce] mb-2">Bull value</legend>
              <SegmentedControl options={bullValueOptions} bind:value={config.bullValue}
                defaultValue={X01_DEFAULTS.bullValue} />
            </fieldset>

            <div class="flex justify-between items-center">
              <span class="flex items-center gap-2 text-[14px] font-medium text-[#d8d8ce]">Max rounds <Tooltip text="Maximum number of rounds before the game ends. The player with the lowest score wins if nobody checks out. Set higher for longer games." /></span>
              <div class="flex items-center gap-1">
                <button type="button" aria-label="Fewer rounds"
                  onclick={() => config = { ...config, maxRounds: Math.max(1, (config.maxRounds as number) - 1) }}
                  class="w-11 h-11 border border-line-3 rounded-[8px] bg-transparent text-text text-[20px]
                         cursor-pointer">−</button>
                <span class="w-[72px] text-center text-[15px]">
                  <strong class="font-display text-[24px]
                                 {isNonDefault('maxRounds') ? 'text-accent' : ''}">{config.maxRounds}</strong>
                </span>
                <button type="button" aria-label="More rounds"
                  onclick={() => config = { ...config, maxRounds: (config.maxRounds as number) + 1 }}
                  class="w-11 h-11 border border-line-3 rounded-[8px] bg-transparent text-text text-[20px]
                         cursor-pointer">+</button>
              </div>
            </div>

            <div class="flex justify-between items-center">
              <span class="text-[14px] font-medium text-[#d8d8ce]">First to</span>
              <div class="flex items-center gap-1">
                <button type="button" aria-label="Fewer legs"
                  onclick={() => config = { ...config, firstTo: Math.max(1, (config.firstTo as number) - 1) }}
                  class="w-11 h-11 border border-line-3 rounded-[8px] bg-transparent text-text text-[20px]
                         cursor-pointer">−</button>
                <span class="w-[72px] text-center text-[15px]">
                  <strong class="font-display text-[24px]
                                 {isNonDefault('firstTo') ? 'text-accent' : ''}">{config.firstTo}</strong> legs
                </span>
                <button type="button" aria-label="More legs"
                  onclick={() => config = { ...config, firstTo: (config.firstTo as number) + 1 }}
                  class="w-11 h-11 border border-line-3 rounded-[8px] bg-transparent text-text text-[20px]
                         cursor-pointer">+</button>
              </div>
            </div>
          </div>

        {:else if selectedMode === 'atc'}
          <div class="flex flex-col gap-[18px]">
            {#each ATC_FIELD_ORDER as fieldKey}
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
                    onchange={(v) => config = { ...config, [fieldKey]: v }} />
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

        <!-- Players -->
        <div class="flex flex-col gap-2 pt-[18px] border-t border-line">
          <span class="text-[14px] font-medium text-[#d8d8ce]">Players</span>
          <PlayerRow index={1} name={youName} isYou />
          {#each guests as guest, i}
            <PlayerRow index={i + 2} bind:name={guest.name}
              onRemove={() => guests = guests.filter((_, j) => j !== i)} />
          {/each}
          <button type="button" onclick={() => guests = [...guests, { name: '' }]}
            class="h-11 flex items-center justify-center gap-2 border border-dashed border-[#3e4239]
                   rounded-[10px] bg-transparent text-[#c9c9bf] text-[14px] cursor-pointer mt-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Add player
          </button>
        </div>

        </div><!-- end scrollable body -->

        <!-- Sticky bottom: error + start button -->
        <div class="px-6 pb-6 pt-3 flex flex-col gap-3 border-t border-line">
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
          <button type="button" onclick={start} disabled={loading || bullOffBlocked}
            title={bullOffBlocked ? 'Bull off needs at least two players' : undefined}
            class="h-14 flex items-center justify-center gap-[10px] bg-accent text-accent-fg
                   rounded-[10px] font-display font-bold text-[22px] tracking-[0.08em] uppercase
                   border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'Starting…' : 'Game on'}
            {#if !loading}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6"/>
              </svg>
            {/if}
          </button>
        </div>
      </aside>
    </div>
  </main>
</Layout>
