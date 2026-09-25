<script lang="ts">
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import GameConfigForm from '../lib/components/GameConfigForm.svelte'
  import { Button } from '$lib/components/ui/button/index.js'

  type Board = { id: string; name: string; online: boolean }

  let games: { id: string; defaultConfig: Record<string, unknown> }[] = []
  let boards: Board[] = []
  let selectedGame = 'atc'
  let boardId = ''
  let config: Record<string, unknown> = {}
  let players: { name: string }[] = [{ name: '' }, { name: '' }]
  let error = ''
  let loading = false

  onMount(async () => {
    const [gamesRes, boardsRes] = await Promise.all([
      fetch('/api/games'),
      fetch('/api/boards'),
    ])
    if (boardsRes.status === 401) { push('/login'); return }
    const gamesData = await gamesRes.json()
    const boardsData = await boardsRes.json()
    games = gamesData.games
    boards = boardsData.boards
    if (games.length > 0) {
      selectedGame = games[0].id
      config = { ...games[0].defaultConfig }
    }
    if (boards.length > 0) boardId = boards[0].id
  })

  function addPlayer() { players = [...players, { name: '' }] }
  function removePlayer(i: number) { players = players.filter((_, j) => j !== i) }

  async function submit() {
    error = ''
    if (!boardId) { error = 'Select a board — or register one in Boards.'; return }
    const validPlayers = players.filter(p => p.name.trim())
    if (validPlayers.length < 1) { error = 'At least one player is required'; return }
    loading = true
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId, gameId: selectedGame, config, players: validPlayers }),
      })
      if (!res.ok) {
        const d = await res.json()
        error = d.error ?? 'Failed to create session'
        return
      }
      const { sessionId } = await res.json()
      push(`/session/${sessionId}`)
    } finally {
      loading = false
    }
  }

  const inputClass = 'w-full rounded-lg px-4 py-2 text-white border focus:outline-none focus:border-blue-500 transition-colors'
  const inputStyle = 'background: #0b1628; border-color: rgba(255,255,255,0.1);'
</script>

<div class="min-h-screen text-white p-6" style="background: #0b1628;">
  <div class="max-w-lg mx-auto">
    <div class="flex items-center justify-between mb-8">
      <h1 class="text-2xl font-bold tracking-tight">New Game</h1>
      <a href="#/boards" class="text-blue-400 hover:text-blue-300 text-sm transition-colors">Boards</a>
    </div>

    <div class="rounded-2xl p-6 space-y-5"
      style="background: #111d2e; border: 1px solid rgba(255,255,255,0.07)">

      <!-- Board selector -->
      <label class="block">
        <span class="text-sm text-gray-400 mb-1 block">Board</span>
        <select bind:value={boardId} class={inputClass} style={inputStyle}>
          {#each boards as b (b.id)}
            <option value={b.id}>{b.name} {b.online ? '🟢' : '⚫'}</option>
          {:else}
            <option disabled value="">No boards registered — add one in Boards</option>
          {/each}
        </select>
        {#if boards.length === 0}
          <a href="#/boards" class="text-blue-400 text-sm mt-1 inline-block hover:underline">→ Register a board</a>
        {/if}
      </label>

      <!-- Game selector -->
      <label class="block">
        <span class="text-sm text-gray-400 mb-1 block">Game</span>
        <select bind:value={selectedGame} class={inputClass} style={inputStyle}>
          {#each games as g}
            <option value={g.id}>{g.id.toUpperCase()}</option>
          {/each}
        </select>
      </label>

      <!-- Game config -->
      <div>
        <GameConfigForm gameId={selectedGame} bind:config />
      </div>

      <!-- Players -->
      <div>
        <p class="text-sm text-gray-400 mb-2">Players</p>
        {#each players as player, i}
          <div class="flex gap-2 mb-2">
            <input bind:value={player.name} placeholder="Player {i + 1}"
              class={inputClass} style={inputStyle} />
            {#if players.length > 1}
              <button on:click={() => removePlayer(i)}
                class="text-gray-600 hover:text-red-400 px-3 transition-colors">✕</button>
            {/if}
          </div>
        {/each}
        <button on:click={addPlayer} class="text-blue-400 hover:text-blue-300 text-sm transition-colors">+ Add player</button>
      </div>

      {#if error}<p class="text-red-400 text-sm">{error}</p>{/if}

      <Button on:click={submit} disabled={loading}
        class="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold">
        {loading ? 'Starting…' : 'Start Game'}
      </Button>
    </div>
  </div>
</div>
