<script lang="ts">
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'

  type Board = { id: string; name: string; hardwareId: string | null; online: boolean; createdAt: string }

  let boards: Board[] = []
  let newName = ''
  let adding = false
  let newToken = ''
  let copied = false
  let error = ''

  async function load() {
    const res = await fetch('/api/boards')
    if (res.status === 401) { push('/login'); return }
    boards = (await res.json()).boards
  }

  async function addBoard() {
    if (!newName.trim()) return
    adding = true
    error = ''
    try {
      const res = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) { error = 'Failed to create board'; return }
      const data = await res.json()
      newToken = data.token
      newName = ''
      await load()
    } finally {
      adding = false
    }
  }

  async function deleteBoard(id: string) {
    if (!confirm('Delete this board?')) return
    await fetch(`/api/boards/${id}`, { method: 'DELETE' })
    await load()
  }

  onMount(load)
</script>

<div class="min-h-screen bg-gray-950 text-white p-6 max-w-2xl mx-auto">
  <div class="flex items-center justify-between mb-8">
    <h1 class="text-2xl font-bold">My Boards</h1>
    <button on:click={() => push('/')} class="text-gray-400 hover:text-white text-sm">← Back</button>
  </div>

  {#if newToken}
    <div class="bg-yellow-900 border border-yellow-600 rounded-xl p-4 mb-6">
      <p class="text-yellow-300 text-sm font-semibold mb-2">Board token — copy this now, it won't be shown again:</p>
      <code class="block bg-gray-900 rounded p-3 text-green-400 text-sm break-all">{newToken}</code>
      <button
        on:click={() => { navigator.clipboard.writeText(newToken); copied = true }}
        class="mt-2 text-sm text-yellow-400 hover:text-yellow-200"
      >{copied ? '✓ Copied' : 'Copy to clipboard'}</button>
      <p class="text-gray-400 text-xs mt-2">Set <code>DARTCADE_BACKEND_URL=ws://&lt;host&gt;/bridge?token={newToken}</code> in your bridge config.</p>
      <button on:click={() => { newToken = ''; copied = false }} class="mt-3 text-xs text-gray-500 hover:text-gray-300">Dismiss</button>
    </div>
  {/if}

  <div class="flex gap-3 mb-6">
    <input bind:value={newName} placeholder="Board name (e.g. Living Room)"
      class="flex-1 bg-gray-800 rounded-lg px-4 py-2 border border-gray-700 focus:outline-none focus:border-orange-500"
      on:keydown={(e) => e.key === 'Enter' && addBoard()} />
    <button on:click={addBoard} disabled={adding || !newName.trim()}
      class="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 px-4 py-2 rounded-lg font-semibold transition-colors">
      Add
    </button>
  </div>
  {#if error}<p class="text-red-400 text-sm mb-4">{error}</p>{/if}

  <div class="space-y-3">
    {#each boards as board (board.id)}
      <div class="bg-gray-900 rounded-xl p-4 flex items-center justify-between">
        <div>
          <span class="font-semibold">{board.name}</span>
          <span class="ml-2 text-xs px-2 py-0.5 rounded-full {board.online ? 'bg-green-900 text-green-400' : 'bg-gray-800 text-gray-500'}">
            {board.online ? 'online' : 'offline'}
          </span>
          {#if board.hardwareId}
            <p class="text-gray-500 text-xs mt-1">{board.hardwareId}</p>
          {/if}
        </div>
        <button on:click={() => deleteBoard(board.id)}
          class="text-gray-600 hover:text-red-400 text-sm transition-colors">Delete</button>
      </div>
    {:else}
      <p class="text-gray-500 text-center py-8">No boards yet. Add one above.</p>
    {/each}
  </div>
</div>
