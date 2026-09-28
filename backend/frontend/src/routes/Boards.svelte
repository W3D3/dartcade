<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { push } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import PairBoardModal from '$lib/components/PairBoardModal.svelte'

  type Board = {
    id: string; name: string; online: boolean; ip?: string
    bridgeVersion?: string | null; totalGames?: number; latencyMs?: number
  }

  let boards = $state<Board[]>([])
  let selectedId = $state<string | null>(null)
  let selected = $derived(boards.find(b => b.id === selectedId) ?? null)
  let cameraTs = $state(Date.now())
  let cameraInterval: ReturnType<typeof setInterval> | null = null

  let pairOpen = $state(false)
  let justPairedId = $state<string | null>(null)
  let toast = $state<{ name: string; boardId: string } | null>(null)
  let toastTimer: ReturnType<typeof setTimeout> | null = null
  let pairedTimer: ReturnType<typeof setTimeout> | null = null

  async function onPaired(info: { boardId: string; name: string }) {
    pairOpen = false
    const d = await fetch('/api/boards').then(r => r.json())
    boards = d.boards ?? []
    selectedId = info.boardId
    justPairedId = info.boardId
    toast = info
    if (toastTimer) clearTimeout(toastTimer)
    if (pairedTimer) clearTimeout(pairedTimer)
    toastTimer = setTimeout(() => { toast = null }, 8000)
    pairedTimer = setTimeout(() => { justPairedId = null }, 12000)
  }

  onMount(async () => {
    const res = await fetch('/api/boards')
    if (res.status === 401) { push('/login'); return }
    const d = await res.json()
    boards = d.boards ?? []
    if (boards.length) selectedId = boards[0].id
    cameraInterval = setInterval(() => { cameraTs = Date.now() }, 1000)
  })
  onDestroy(() => {
    if (cameraInterval) clearInterval(cameraInterval)
    if (toastTimer) clearTimeout(toastTimer)
    if (pairedTimer) clearTimeout(pairedTimer)
  })

  const onlineCount = $derived(boards.filter(b => b.online).length)
</script>

<Layout>

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
      <Button variant="primary" class="h-12 text-[18px]" onclick={() => { pairOpen = true }}>
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
          {@const justPaired = board.id === justPairedId}
          <button type="button" onclick={() => selectedId = board.id}
            class="text-left box-border p-[22px] rounded-[14px] flex flex-col gap-[18px] transition-colors
                   {justPaired
                     ? 'bg-surface-2 border-2 border-accent'
                     : active
                       ? 'bg-surface-2 border-2 border-accent'
                       : 'bg-surface-2 border border-line-2 hover:border-line'}">

            <div class="flex justify-between items-center">
              {#if justPaired && !board.online}
                <span class="flex items-center gap-2 text-[13px] font-semibold text-text-muted">
                  <span class="w-2 h-2 rounded-full border border-accent border-t-transparent animate-spin"></span>
                  Connecting cameras…
                </span>
                <span class="px-2 py-0.5 rounded-full bg-accent text-accent-fg text-[11px] font-bold uppercase tracking-wide">
                  Just paired
                </span>
              {:else}
                <span class="flex items-center gap-2 text-[13px] font-semibold
                             {board.online ? 'text-accent' : 'text-text-dim'}">
                  <span class="w-2 h-2 rounded-full {board.online ? 'bg-accent' : 'bg-text-dim'}"></span>
                  {board.online ? 'Online' : 'Offline'}
                </span>
                {#if justPaired}
                  <span class="px-2 py-0.5 rounded-full bg-accent text-accent-fg text-[11px] font-bold uppercase tracking-wide">
                    Just paired
                  </span>
                {/if}
              {/if}
              {#if !justPaired}
                <!-- [PLACEHOLDER] latency from API -->
                <span class="font-mono text-[12px] text-text-dim">
                  {board.latencyMs != null ? `${board.latencyMs} ms` : '— ms'}
                </span>
              {/if}
            </div>

            <div class="flex flex-col gap-1">
              <h2 class="m-0 font-display font-bold text-[32px] leading-none uppercase">{board.name}</h2>
              {#if board.ip}
                <span class="font-mono text-[13px] text-text-muted">{board.ip}</span>
              {/if}
            </div>

            <dl class="m-0 mt-auto grid grid-cols-2 gap-3 pt-4 border-t border-line-2">
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
          <div class="flex flex-col gap-2">
            {#if selected.online}
              {#each [0, 1, 2] as camIndex (camIndex)}
                <div class="rounded-[10px] overflow-hidden bg-[#0a0b09] aspect-video">
                  <img
                    src="/api/boards/{selected.id}/camera/{camIndex}?t={cameraTs}"
                    alt="Camera {camIndex}"
                    class="w-full h-full object-cover"
                    onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                </div>
              {/each}
            {:else}
              <div class="rounded-[10px] bg-[#0a0b09] h-24 flex items-center justify-center
                           text-text-dim text-[13px]">Board offline</div>
            {/if}
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

  {#if pairOpen}
    <PairBoardModal onclose={() => { pairOpen = false }} onpaired={onPaired} />
  {/if}

  <!-- Success toast -->
  {#if toast}
    <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3
                px-4 py-3 rounded-[12px] bg-surface-1 border border-line-2 shadow-xl max-w-[92vw]">
      <span class="flex-shrink-0 w-6 h-6 rounded-full bg-accent text-accent-fg flex items-center justify-center">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
      <span class="text-[14px] text-text-muted">
        <span class="text-text font-semibold">{toast.name}</span> is paired.
        It shows as online once all cameras report in.
      </span>
      <button
        type="button"
        onclick={() => { selectedId = toast!.boardId; toast = null }}
        class="flex-shrink-0 text-[14px] text-accent font-semibold hover:underline"
      >
        Play on it
      </button>
    </div>
  {/if}
  </main>
</Layout>
