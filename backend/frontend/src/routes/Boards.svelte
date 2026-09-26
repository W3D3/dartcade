<script lang="ts">
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import SideNav from '$lib/components/SideNav.svelte'
  import { Button } from '$lib/components/ui/button/index.js'

  type Board = {
    id: string; name: string; online: boolean; ip?: string
    cameras?: number; bridgeVersion?: string; totalGames?: number; latencyMs?: number
  }

  let boards = $state<Board[]>([])
  let selectedId = $state<string | null>(null)
  let selected = $derived(boards.find(b => b.id === selectedId) ?? null)

  onMount(async () => {
    const res = await fetch('/api/boards')
    if (res.status === 401) { push('/login'); return }
    const d = await res.json()
    boards = d.boards ?? []
    if (boards.length) selectedId = boards[0].id
  })

  const onlineCount = $derived(boards.filter(b => b.online).length)
</script>

<div class="flex h-screen bg-bg text-text overflow-hidden">
  <SideNav />

  <main class="flex flex-grow flex-col gap-7 box-border min-w-0 overflow-y-auto p-[40px_44px]">

    <!-- Header -->
    <header class="flex items-end justify-between">
      <div class="flex flex-col gap-[6px]">
        <h1 class="m-0 font-display font-bold text-[48px] leading-none uppercase tracking-[0.02em]">
          Boards
        </h1>
        <p class="m-0 text-[15px] text-text-muted">
          Autodarts boards linked through your Dartcade bridge ·
          <span class="text-text">{onlineCount} online</span> · {boards.length - onlineCount} offline
        </p>
      </div>
      <Button variant="primary" class="h-12 text-[18px]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Pair new board
      </Button>
    </header>

    <div class="flex gap-6 flex-grow min-h-0">
      <!-- Board grid -->
      <div class="flex-grow grid grid-cols-2 grid-rows-2 gap-4 content-start">
        {#each boards as board (board.id)}
          {@const active = board.id === selectedId}
          <button type="button" onclick={() => selectedId = board.id}
            class="text-left box-border p-[22px] rounded-[14px] flex flex-col gap-[18px] transition-colors
                   {active
                     ? 'bg-surface-2 border-2 border-accent'
                     : 'bg-surface-2 border border-line-2 hover:border-line'}">

            <div class="flex justify-between items-center">
              <span class="flex items-center gap-2 text-[13px] font-semibold
                           {board.online ? 'text-accent' : 'text-text-dim'}">
                <span class="w-2 h-2 rounded-full {board.online ? 'bg-accent' : 'bg-text-dim'}"></span>
                {board.online ? 'Online' : 'Offline'}
              </span>
              <!-- [PLACEHOLDER] latency from API -->
              <span class="font-mono text-[12px] text-text-dim">
                {board.latencyMs != null ? `${board.latencyMs} ms` : '— ms'}
              </span>
            </div>

            <div class="flex flex-col gap-1">
              <h2 class="m-0 font-display font-bold text-[32px] leading-none uppercase">{board.name}</h2>
              {#if board.ip}
                <span class="font-mono text-[13px] text-text-muted">{board.ip}</span>
              {/if}
            </div>

            <dl class="m-0 mt-auto grid grid-cols-3 gap-3 pt-4 border-t border-line-2">
              <!-- [PLACEHOLDER] cameras/bridgeVersion/totalGames from API -->
              <div>
                <dt class="text-[12px] text-text-dim">Cameras</dt>
                <dd class="mt-1 m-0 text-[15px] font-semibold">{board.cameras != null ? `${board.cameras} / 3` : '—'}</dd>
              </div>
              <div>
                <dt class="text-[12px] text-text-dim">Bridge</dt>
                <dd class="mt-1 m-0 text-[15px] font-semibold">{board.bridgeVersion ?? '—'}</dd>
              </div>
              <div>
                <dt class="text-[12px] text-text-dim">Games</dt>
                <dd class="mt-1 m-0 text-[15px] font-semibold">{board.totalGames ?? '—'}</dd>
              </div>
            </dl>
          </button>
        {:else}
          <div class="col-span-2 flex items-center justify-center h-40 rounded-[14px]
                      border border-dashed border-line-2 text-text-muted text-[15px]">
            No boards yet — pair one to get started
          </div>
        {/each}
      </div>

      <!-- Detail panel (shown when board selected) -->
      {#if selected}
        <aside class="w-[360px] flex-shrink-0 box-border p-6 border border-line-2 rounded-[14px]
                       bg-surface-2 flex flex-col gap-5">
          <h3 class="m-0 font-display font-bold text-[24px] uppercase">{selected.name}</h3>
          <!-- [PLACEHOLDER] camera tiles, event feed — needs board detail API -->
          <div class="flex flex-col gap-3">
            <div class="rounded-[10px] bg-[#0a0b09] h-24 flex items-center justify-center
                         text-text-dim text-[13px]">Camera feed — coming soon</div>
          </div>
          <div class="flex flex-col gap-1">
            {#if selected.ip}
              <div class="flex justify-between text-[14px]">
                <span class="text-text-dim">Board Manager IP</span>
                <span class="font-mono">{selected.ip}</span>
              </div>
            {/if}
            <div class="flex justify-between text-[14px]">
              <span class="text-text-dim">Bridge version</span>
              <span class="font-mono">{selected.bridgeVersion ?? '—'}</span>
            </div>
            <div class="flex justify-between text-[14px]">
              <span class="text-text-dim">Latency</span>
              <span class="font-mono">{selected.latencyMs != null ? `${selected.latencyMs} ms` : '—'}</span>
            </div>
          </div>
          <Button variant="destructive" class="mt-auto w-full">Unpair board</Button>
        </aside>
      {/if}
    </div>
  </main>
</div>
