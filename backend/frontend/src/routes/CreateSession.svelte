<script lang="ts">
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import GameConfigForm from '../lib/components/GameConfigForm.svelte'

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
</script>

<div class="max-w-lg mx-auto p-6">
  <div class="flex items-center justify-between mb-4">
    <h1 class="text-2xl font-bold">New Game</h1>
    <a href="#/boards" class="text-gray-400 hover:text-white text-sm">Boards</a>
  </div>

  <label class="block mb-4">
    <span class="text-sm text-gray-400">Board</span>
    <select bind:value={boardId}
      class="w-full mt-1 bg-gray-800 text-white rounded-lg px-4 py-2 border border-gray-700 focus:outline-none focus:border-orange-500">
      {#each boards as b (b.id)}
        <option value={b.id}>{b.name} {b.online ? '🟢' : '⚫'}</option>
      {:else}
        <option disabled value="">No boards registered — add one in Boards</option>
      {/each}
    </select>
    {#if boards.length === 0}
      <a href="#/boards" class="text-orange-400 text-sm mt-1 inline-block hover:underline">→ Register a board</a>
    {/if}
  </label>

  <label class="block mb-4">
    Game
    <select bind:value={selectedGame} class="block w-full border rounded p-2 mt-1">
      {#each games as g}
        <option value={g.id}>{g.id.toUpperCase()}</option>
      {/each}
    </select>
  </label>

  <div class="mb-4">
    <GameConfigForm gameId={selectedGame} bind:config />
  </div>

  <div class="mb-4">
    <p class="font-semibold mb-2">Players</p>
    {#each players as player, i}
      <div class="flex gap-2 mb-2">
        <input bind:value={player.name} placeholder="Player {i + 1}" class="border rounded p-2 flex-1" />
        {#if players.length > 1}
          <button on:click={() => removePlayer(i)} class="text-red-500 px-2">✕</button>
        {/if}
      </div>
    {/each}
    <button on:click={addPlayer} class="text-blue-600 text-sm">+ Add player</button>
  </div>

  {#if error}<p class="text-red-600 mb-2">{error}</p>{/if}

  <button on:click={submit} disabled={loading}
    class="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50">
    {loading ? 'Starting…' : 'Start Game'}
  </button>
</div>
