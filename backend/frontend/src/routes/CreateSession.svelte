<script lang="ts">
  import { ArrowRight, Check, Plus } from '@lucide/svelte'
  import { onMount } from 'svelte'
  import { push, querystring } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import BoardSelector from '$lib/components/BoardSelector.svelte'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import PlayerRow from '$lib/components/PlayerRow.svelte'
  import Tooltip from '$lib/components/Tooltip.svelte'
  import { api, type Board, type ConfigFieldMeta, type GameInfo } from '$lib/api'
  import { authClient } from '$lib/auth'
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
  const X01_DEFAULTS: Record<string, unknown> = {
    startScore: 501, inMode: 'straight', outMode: 'double',
    bullOff: 'off', bullValue: '25_50', maxRounds: 50, firstTo: 3,
  }

  type Config = Record<string, unknown>
  // A numeric config field, or its default when missing or not a number
  const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d)
  const initPrefs = loadPrefs(localStorage)

  let games = $state<GameInfo[]>([])
  let boards = $state<Board[]>([])
  let selectedMode = $state(initPrefs?.mode ?? 'atc')
  let boardId = $state(initPrefs?.boardId ?? '')
  let atcMeta = $state<Partial<Record<string, ConfigFieldMeta>>>({})
  let youName = $state('')
  let guests = $state<{ name: string }[]>([])
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

  // Persist whenever mode, config or board changes
  $effect(() => {
    savePrefs(localStorage, {
      mode: selectedMode,
      configs: { ...savedConfigs, [selectedMode]: config },
      boardId,
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
    const [gr, br, sr] = await Promise.all([
      api.GET('/api/gamemodes'),
      api.GET('/api/boards'),
      authClient.getSession(),
    ])
    if (!br.data) return   // 401 is redirected to login by the client
    games = gr.data?.modes ?? []
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
        error = res.error.error
        runningSessionId = res.response.status === 409 && 'sessionId' in res.error ? res.error.sessionId ?? null : null
        return
      }
      void push(`/session/${res.data.sessionId}`)
    } finally { loading = false }
  }
</script>

<Layout title="New game">
  {#snippet headerAction()}<BoardSelector {boards} bind:value={boardId} compact />{/snippet}
  <main class="flex flex-grow flex-col gap-4 md:gap-7 box-border min-w-0 overflow-y-auto p-4 md:p-[40px_44px]">

    <!-- Header (phones: the title and board chip are in the phone header) -->
    <header class="hidden md:flex items-end justify-between">
      <div class="flex flex-col gap-[6px]">
        <h1 class="m-0 font-display font-bold text-[48px] leading-none uppercase tracking-[0.02em]">
          New game
        </h1>
        <p class="m-0 text-[15px] text-text-muted">Choose a mode, set it up, throw the first dart.</p>
      </div>
      <BoardSelector {boards} bind:value={boardId} />
    </header>

    <div class="flex flex-col md:flex-row gap-4 md:gap-6 md:flex-grow md:min-h-0">
      <!-- Mode grid -->
      <div class="grid grid-cols-2 gap-[10px] md:flex-grow md:grid-rows-2 md:gap-4">
        {#each MODES as mode (mode.id)}
          {@const active = mode.id === selectedMode}
          {@const unavailable = !mode.available}
          <button type="button"
            onclick={() => { if (mode.available) selectMode(mode.id) }}
            disabled={unavailable}
            class="relative text-left box-border h-[92px] px-[14px] py-3 md:h-auto md:p-6 rounded-[12px] md:rounded-[14px] flex flex-col gap-[10px]
                   overflow-hidden transition-colors font-[inherit]
                   {unavailable
                     ? 'bg-surface-2 border border-line-2 opacity-40 cursor-not-allowed'
                     : active
                       ? 'bg-surface-active border-2 border-accent cursor-pointer'
                       : 'bg-surface-2 border border-line-2 cursor-pointer'}">
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
                  onclick={() => config = { ...config, maxRounds: Math.max(1, num(config.maxRounds, 50) - 1) }}
                  class="w-11 h-11 border border-line-3 rounded-[8px] bg-transparent text-text text-[20px]
                         cursor-pointer">−</button>
                <span class="w-12 md:w-[72px] text-center text-[15px]">
                  <strong class="font-display text-[24px]
                                 {isNonDefault('maxRounds') ? 'text-accent' : ''}">{config.maxRounds}</strong>
                </span>
                <button type="button" aria-label="More rounds"
                  onclick={() => config = { ...config, maxRounds: num(config.maxRounds, 50) + 1 }}
                  class="w-11 h-11 border border-line-3 rounded-[8px] bg-transparent text-text text-[20px]
                         cursor-pointer">+</button>
              </div>
            </div>

            <div class="flex justify-between items-center">
              <span class="text-[14px] font-medium text-[#d8d8ce]">First to</span>
              <div class="flex items-center gap-1">
                <button type="button" aria-label="Fewer legs"
                  onclick={() => config = { ...config, firstTo: Math.max(1, num(config.firstTo, 3) - 1) }}
                  class="w-11 h-11 border border-line-3 rounded-[8px] bg-transparent text-text text-[20px]
                         cursor-pointer">−</button>
                <span class="w-12 md:w-[72px] text-center text-[15px]">
                  <strong class="font-display text-[24px]
                                 {isNonDefault('firstTo') ? 'text-accent' : ''}">{config.firstTo}</strong> legs
                </span>
                <button type="button" aria-label="More legs"
                  onclick={() => config = { ...config, firstTo: num(config.firstTo, 3) + 1 }}
                  class="w-11 h-11 border border-line-3 rounded-[8px] bg-transparent text-text text-[20px]
                         cursor-pointer">+</button>
              </div>
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

        <!-- Players -->
        <div class="flex flex-col gap-2 pt-[18px] border-t border-line">
          <span class="text-[14px] font-medium text-[#d8d8ce]">Players</span>
          <PlayerRow index={1} name={youName} isYou />
          {#each guests as guest, i (i)}
            <PlayerRow index={i + 2} bind:name={guest.name}
              onRemove={() => guests = guests.filter((_, j) => j !== i)} />
          {/each}
          <button type="button" onclick={() => guests = [...guests, { name: '' }]}
            class="h-11 flex items-center justify-center gap-2 border border-dashed border-[#3e4239]
                   rounded-[10px] bg-transparent text-[#c9c9bf] text-[14px] cursor-pointer mt-1">
            <Plus size={16} />
            Add player
          </button>
        </div>

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
          <button type="button" onclick={start} disabled={loading || bullOffBlocked}
            title={bullOffBlocked ? 'Bull off needs at least two players' : undefined}
            class="h-12 md:h-14 flex items-center justify-center gap-[10px] bg-accent text-accent-fg
                   rounded-[10px] font-display font-bold text-[20px] md:text-[22px] tracking-[0.08em] uppercase
                   border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'Starting…' : 'Game on'}
            {#if !loading}
              <ArrowRight size={20} strokeWidth={2.2} />
            {/if}
          </button>
        </div>
      </aside>
    </div>
  </main>
</Layout>
