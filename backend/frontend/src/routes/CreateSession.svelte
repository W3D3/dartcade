<script lang="ts">
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import BoardSelector from '$lib/components/BoardSelector.svelte'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import PlayerRow from '$lib/components/PlayerRow.svelte'
  import Tooltip from '$lib/components/Tooltip.svelte'

  type Board = { id: string; name: string; online: boolean }
  type FieldMeta = { label: string; tooltip?: string; options?: { value: unknown; label: string }[] }
  type GameDef = { id: string; defaultConfig: Record<string, unknown>; configMeta: Record<string, FieldMeta> }

  const MODES = [
    { id: 'atc',        glyph: 'ATC',    name: 'Around the Clock', desc: 'Hit 1 through 20 in order, then finish on your chosen target.', available: true  },
    { id: 'x01',        glyph: 'X01',    name: '501',               desc: 'Count down from 501 and finish on a double.',                  available: true  },
    { id: 'soccer',     glyph: 'Soccer', name: 'Dart Soccer',       desc: 'Coming soon.',                                                 available: false },
    { id: 'tournament', glyph: 'R16',    name: 'Tournament',        desc: 'Coming soon.',                                                 available: false },
  ]

  const startScoreOptions = [
    { value: 301, label: '301' },
    { value: 501, label: '501' },
    { value: 701, label: '701' },
  ]
  const checkoutOptions = [
    { value: 'straight', label: 'Straight' },
    { value: 'double',   label: 'Double' },
    { value: 'master',   label: 'Master' },
  ]

  // ATC config fields in display order — populated from backend configMeta
  const ATC_FIELD_ORDER = ['finishOn', 'order', 'multiplierAdvances', 'throwAgainOnAllHit'] as const

  let games = $state<GameDef[]>([])
  let boards = $state<Board[]>([])
  let selectedMode = $state('atc')
  let boardId = $state('')
  let config = $state<Record<string, unknown>>({ startScore: 501, checkout: 'double', firstTo: 3 })
  let atcMeta = $state<Record<string, FieldMeta>>({})
  let youName = $state('')
  let guests = $state<{ name: string }[]>([{ name: '' }])
  let error = $state('')
  let loading = $state(false)

  onMount(async () => {
    const [gr, br, sr] = await Promise.all([
      fetch('/api/games'),
      fetch('/api/boards'),
      fetch('/api/auth/get-session'),
    ])
    if (br.status === 401) { push('/login'); return }
    const [gd, bd, sd] = await Promise.all([gr.json(), br.json(), sr.json()])
    games = gd.games ?? []
    boards = bd.boards ?? []
    if (boards.length) boardId = boards[0].id
    youName = sd.user?.name ?? sd.user?.email ?? 'You'

    const atcGame = games.find(g => g.id === 'atc')
    if (atcGame) {
      atcMeta = atcGame.configMeta
      config = { ...config, ...atcGame.defaultConfig }
    }
  })

  async function start() {
    error = ''
    const allPlayers = [
      { name: youName.trim() || 'Player 1' },
      ...guests.filter(g => g.name.trim()).map(g => ({ name: g.name.trim() })),
    ]
    if (!boardId) { error = 'Select a board first.'; return }
    const gameId = games.find(g => g.id === selectedMode)?.id
      ?? games.find(g => g.id.includes('501'))?.id
      ?? games[0]?.id
    if (!gameId) { error = 'No game found. Is the backend running?'; return }
    const resolvedConfig = selectedMode === 'atc'
      ? { finishOn: config.finishOn, order: config.order, multiplierAdvances: config.multiplierAdvances, throwAgainOnAllHit: config.throwAgainOnAllHit }
      : { startScore: config.startScore, checkout: config.checkout, firstTo: config.firstTo }
    loading = true
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId, gameId, config: resolvedConfig, players: allPlayers }),
      })
      if (!res.ok) { error = (await res.json()).error ?? 'Failed to start'; return }
      push(`/session/${(await res.json()).sessionId}`)
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
            onclick={() => { if (mode.available) selectedMode = mode.id }}
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
      <aside class="w-[400px] flex-shrink-0 box-border p-6 border border-line-2 rounded-[14px]
                    bg-[#151713] flex flex-col gap-[22px]">
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
              <SegmentedControl options={startScoreOptions} bind:value={config.startScore} />
            </fieldset>

            <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
              <legend class="text-[14px] font-medium text-[#d8d8ce] mb-2">Check-out</legend>
              <SegmentedControl options={checkoutOptions} bind:value={config.checkout} />
            </fieldset>

            <div class="flex justify-between items-center">
              <span class="text-[14px] font-medium text-[#d8d8ce]">First to</span>
              <div class="flex items-center gap-1">
                <button type="button" aria-label="Fewer legs"
                  onclick={() => config = {...config, firstTo: Math.max(1, (config.firstTo as number) - 1)}}
                  class="w-11 h-11 border border-line-3 rounded-[8px] bg-transparent text-text text-[20px]
                         cursor-pointer">−</button>
                <span class="w-[72px] text-center text-[15px]">
                  <strong class="font-display text-[24px]">{config.firstTo}</strong> legs
                </span>
                <button type="button" aria-label="More legs"
                  onclick={() => config = {...config, firstTo: (config.firstTo as number) + 1}}
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

        {#if error}<p class="m-0 text-[14px] text-live-text">{error}</p>{/if}

        <button type="button" onclick={start} disabled={loading}
          class="mt-auto h-14 flex items-center justify-center gap-[10px] bg-accent text-accent-fg
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
      </aside>
    </div>
  </main>
</Layout>
