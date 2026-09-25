<script lang="ts">
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import { Button } from '$lib/components/ui/button/index.js'

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

<div class="min-h-screen text-white p-6 max-w-2xl mx-auto" style="background: #0b1628;">
  <div class="flex items-center justify-between mb-8">
    <h1 class="text-2xl font-bold tracking-tight">My Boards</h1>
    <button on:click={() => push('/')} class="text-gray-500 hover:text-white text-sm transition-colors">← Back</button>
  </div>

  {#if newToken}
    <div class="rounded-xl p-4 mb-6"
      style="background: rgba(234,179,8,0.08); border: 1px solid rgba(234,179,8,0.25)">
      <p class="text-yellow-300 text-sm font-semibold mb-2">Board token — copy this now, it won't be shown again:</p>
      <code class="block rounded-lg p-3 text-green-400 text-sm break-all" style="background: rgba(0,0,0,0.4)">{newToken}</code>
      <button
        on:click={() => { navigator.clipboard.writeText(newToken); copied = true }}
        class="mt-2 text-sm text-yellow-400 hover:text-yellow-200 transition-colors"
      >{copied ? '✓ Copied' : 'Copy to clipboard'}</button>
      <p class="text-gray-500 text-xs mt-2">Set <code>DARTCADE_BACKEND_URL=ws://&lt;host&gt;/bridge?token={newToken}</code> in your bridge config.</p>
      <button on:click={() => { newToken = ''; copied = false }} class="mt-3 text-xs text-gray-600 hover:text-gray-400 transition-colors">Dismiss</button>
    </div>
  {/if}

  <div class="flex gap-3 mb-6">
    <input bind:value={newName} placeholder="Board name (e.g. Living Room)"
      class="flex-1 rounded-lg px-4 py-2 text-white border focus:outline-none focus:border-blue-500 transition-colors"
      style="background: #0b1628; border-color: rgba(255,255,255,0.1);"
      on:keydown={(e) => e.key === 'Enter' && addBoard()} />
    <Button onclick={addBoard} disabled={adding || !newName.trim()}
      class="bg-blue-600 hover:bg-blue-500 text-white font-semibold">
      Add
    </Button>
  </div>
  {#if error}<p class="text-red-400 text-sm mb-4">{error}</p>{/if}

  <div class="space-y-3">
    {#each boards as board (board.id)}
      <div class="rounded-xl p-4 flex items-center justify-between"
        style="background: #111d2e; border: 1px solid rgba(255,255,255,0.07)">
        <div>
          <span class="font-semibold">{board.name}</span>
          <span class="ml-2 text-xs px-2 py-0.5 rounded-full
            {board.online ? 'bg-green-900/60 text-green-400' : 'text-gray-500'}"
            style={board.online ? '' : 'background: rgba(255,255,255,0.05)'}>
            {board.online ? 'online' : 'offline'}
          </span>
          {#if board.hardwareId}
            <p class="text-gray-600 text-xs mt-1">{board.hardwareId}</p>
          {/if}
        </div>
        <button on:click={() => deleteBoard(board.id)}
          class="text-gray-700 hover:text-red-400 text-sm transition-colors">Delete</button>
      </div>
    {:else}
      <p class="text-gray-600 text-center py-8">No boards yet. Add one above.</p>
    {/each}
  </div>
</div>
