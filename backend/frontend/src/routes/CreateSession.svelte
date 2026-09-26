<script lang="ts">
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import SideNav from '$lib/components/SideNav.svelte'
  import { Button } from '$lib/components/ui/button/index.js'

  type Board = { id: string; name: string; online: boolean }
  type GameDef = { id: string; defaultConfig: Record<string, unknown> }

  const MODES = [
    { id: 'x01',        glyph: '501', name: '501',         desc: 'Classic X01, double out. First to finish wins the leg.' },
    { id: 'soccer',     glyph: '⚽',  name: 'Dart Soccer', desc: 'Coming soon.' },
    { id: 'challenges', glyph: '🎯', name: 'Challenges',  desc: 'Coming soon.' },
    { id: 'tournament', glyph: '🏆', name: 'Tournament',  desc: 'Coming soon.' },
  ]

  let games = $state<GameDef[]>([])
  let boards = $state<Board[]>([])
  let selectedMode = $state('x01')
  let boardId = $state('')
  let config = $state<Record<string, unknown>>({ startScore: 501, checkout: 'double', firstTo: 2 })
  let players = $state([{ name: '' }, { name: '' }])
  let error = $state('')
  let loading = $state(false)

  onMount(async () => {
    const [gr, br] = await Promise.all([fetch('/api/games'), fetch('/api/boards')])
    if (br.status === 401) { push('/login'); return }
    const gd = await gr.json(); const bd = await br.json()
    games = gd.games ?? []; boards = bd.boards ?? []
    if (boards.length) boardId = boards[0].id
  })

  const selectedBoard = $derived(boards.find(b => b.id === boardId))

  async function start() {
    error = ''
    const validPlayers = players.filter(p => p.name.trim())
    if (!boardId) { error = 'Select a board first.'; return }
    if (validPlayers.length < 1) { error = 'At least one player required.'; return }
    const gameId = games.find(g => g.id.includes('501') || g.id === selectedMode)?.id ?? games[0]?.id
    if (!gameId) { error = 'No game found. Is the backend running?'; return }
    loading = true
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId, gameId, config, players: validPlayers }),
      })
      if (!res.ok) { error = (await res.json()).error ?? 'Failed to start'; return }
      push(`/session/${(await res.json()).sessionId}`)
    } finally { loading = false }
  }
</script>

<div class="flex h-screen bg-bg text-text overflow-hidden">
  <SideNav />

  <main class="flex flex-grow flex-col gap-7 box-border min-w-0 overflow-y-auto p-[40px_44px]">

    <!-- Header -->
    <header class="flex items-end justify-between">
      <div class="flex flex-col gap-[6px]">
        <h1 class="m-0 font-display font-bold text-[48px] leading-none uppercase tracking-[0.02em]">
          New game
        </h1>
        <p class="m-0 text-[15px] text-text-muted">Choose a mode, set it up, throw the first dart.</p>
      </div>
      <!-- Board selector -->
      <select bind:value={boardId}
        class="h-12 px-4 bg-surface-2 border border-line-3 rounded-[10px] text-text text-[15px]
               font-medium cursor-pointer focus-visible:[outline:2px_solid_#c6f24e]">
        {#each boards as b (b.id)}
          <option value={b.id}>{b.name} {b.online ? '●' : '○'}</option>
        {:else}
          <option disabled value="">No boards — add one in Boards</option>
        {/each}
      </select>
    </header>

    <div class="flex gap-6 flex-grow min-h-0">
      <!-- Mode grid -->
      <div class="flex-grow grid grid-cols-2 grid-rows-2 gap-4">
        {#each MODES as mode}
          {@const active = mode.id === selectedMode}
          <button type="button" onclick={() => selectedMode = mode.id}
            class="relative text-left box-border p-6 rounded-[14px] flex flex-col gap-[10px]
                   cursor-pointer overflow-hidden transition-colors
                   {active ? 'bg-surface-active border-2 border-accent' : 'bg-surface-2 border border-line-2'}">
            {#if active}
              <span class="absolute top-[18px] right-[18px] w-7 h-7 rounded-full bg-accent flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0f100e" stroke-width="3"
                  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M5 12l5 5 9-10"/>
                </svg>
              </span>
            {/if}
            <span class="font-display font-bold text-[88px] leading-[0.9]
                         {active ? 'text-accent' : 'text-transparent [-webkit-text-stroke:1.5px_#5a5e53]'}">
              {mode.glyph}
            </span>
            <span class="mt-auto font-display font-bold text-[30px] uppercase tracking-[0.02em]">
              {mode.name}
            </span>
            <span class="text-[15px] leading-[1.45] {active ? 'text-[#b4b5aa]' : 'text-text-muted'}">
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
          <!-- Start score -->
          <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
            <legend class="text-[14px] font-medium text-[#d8d8ce] mb-1">Start score</legend>
            <div class="flex gap-1 p-1 bg-bg rounded-[10px]">
              {#each [301, 501, 701] as score}
                <button type="button" onclick={() => config = {...config, startScore: score}}
                  class="flex-1 h-11 rounded-[7px] text-[15px] font-medium transition-colors border-0
                         {config.startScore === score
                           ? 'bg-accent text-accent-fg font-bold'
                           : 'bg-transparent text-[#c9c9bf]'}">
                  {score}
                </button>
              {/each}
            </div>
          </fieldset>

          <!-- Checkout -->
          <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
            <legend class="text-[14px] font-medium text-[#d8d8ce] mb-1">Checkout</legend>
            <div class="flex gap-1 p-1 bg-bg rounded-[10px]">
              {#each [['double','Double out'],['master','Master out'],['straight','Straight']] as [val, label]}
                <button type="button" onclick={() => config = {...config, checkout: val}}
                  class="flex-1 h-11 rounded-[7px] text-[14px] font-medium transition-colors border-0
                         {config.checkout === val
                           ? 'bg-accent text-accent-fg font-bold'
                           : 'bg-transparent text-[#c9c9bf]'}">
                  {label}
                </button>
              {/each}
            </div>
          </fieldset>

          <!-- First to N legs -->
          <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
            <legend class="text-[14px] font-medium text-[#d8d8ce] mb-1">First to (legs)</legend>
            <div class="flex gap-2 flex-wrap">
              {#each [1,2,3,5,7] as n}
                <button type="button" onclick={() => config = {...config, firstTo: n}}
                  class="w-11 h-11 rounded-[10px] text-[15px] font-medium border transition-colors
                         {config.firstTo === n
                           ? 'bg-accent text-accent-fg border-accent font-bold'
                           : 'bg-transparent text-[#c9c9bf] border-line-3'}">
                  {n}
                </button>
              {/each}
            </div>
          </fieldset>
        {:else}
          <p class="text-text-muted text-[15px]">Setup options coming soon for this mode.</p>
        {/if}

        <!-- Players -->
        <div class="flex flex-col gap-3">
          <span class="text-[14px] font-medium text-[#d8d8ce]">Players</span>
          {#each players as player, i}
            <div class="flex gap-2 items-center">
              <span class="w-7 h-7 rounded-full bg-surface-active border border-line flex items-center
                           justify-center text-[13px] font-bold text-text-muted shrink-0">{i + 1}</span>
              <input bind:value={player.name} placeholder="Player {i + 1}"
                class="flex-grow h-11 px-3 bg-surface-2 border border-line-3 rounded-[10px] text-text
                       text-[15px] placeholder:text-text-dim outline-none
                       focus-visible:[outline:2px_solid_#c6f24e]" />
              {#if players.length > 1}
                <button type="button" onclick={() => players = players.filter((_, j) => j !== i)}
                  class="w-11 h-11 flex items-center justify-center text-text-dim hover:text-live-text
                         transition-colors border-0 bg-transparent cursor-pointer">✕</button>
              {/if}
            </div>
          {/each}
          <button type="button" onclick={() => players = [...players, { name: '' }]}
            class="self-start text-[14px] text-accent font-medium border-0 bg-transparent cursor-pointer p-0">
            + Add player
          </button>
        </div>

        {#if error}<p class="m-0 text-[14px] text-live-text">{error}</p>{/if}

        <Button variant="primary" onclick={start} disabled={loading} class="w-full mt-auto">
          {loading ? 'Starting…' : 'Start game'}
        </Button>
      </aside>
    </div>
  </main>
</div>
