<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { push } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Toast } from '$lib/components/ui/toast/index.js'
  import PairBoardModal from '$lib/components/PairBoardModal.svelte'

  type Board = {
    id: string; name: string; online: boolean; ip?: string | null
    bridgeVersion?: string | null; totalGames?: number; latencyMs?: number
  }
  type BmStatus = { status: string; running: boolean } | null

  let boards = $state<Board[]>([])
  let selectedId = $state<string | null>(null)
  let selected = $derived(boards.find(b => b.id === selectedId) ?? null)
  let cameraTs = $state(Date.now())
  let cameraInterval: ReturnType<typeof setInterval> | null = null
  let bmStatus = $state<BmStatus>(null)
  let bmStatusInterval: ReturnType<typeof setInterval> | null = null
  let busy = $state<string | null>(null)

  async function loadBmStatus(boardId: string) {
    try {
      const res = await fetch(`/api/boards/${boardId}/status`)
      if (!res.ok) { bmStatus = null; return }
      bmStatus = await res.json()
    } catch { bmStatus = null }
  }

  function startStatusPoll(boardId: string) {
    stopStatusPoll()
    loadBmStatus(boardId)
    bmStatusInterval = setInterval(() => loadBmStatus(boardId), 3000)
  }

  function stopStatusPoll() {
    if (bmStatusInterval) { clearInterval(bmStatusInterval); bmStatusInterval = null }
    bmStatus = null
  }

  $effect(() => {
    if (selected?.online && selected.id) startStatusPoll(selected.id)
    else stopStatusPoll()
  })

  async function runAction(action: string) {
    if (!selected) return
    busy = action
    try { await fetch(`/api/boards/${selected.id}/${action}`, { method: 'POST' }) }
    catch { /* ignore */ }
    finally {
      busy = null
      if (selected?.online) loadBmStatus(selected.id)
    }
  }

  let pairOpen = $state(false)
  let justPairedId = $state<string | null>(null)
  let toast = $state<{ name: string; boardId: string } | null>(null)
  let toastTimer: ReturnType<typeof setTimeout> | null = null
  let pairedTimer: ReturnType<typeof setTimeout> | null = null

  async function onPaired(info: { boardId: string; name: string }) {
    pairOpen = false
    // The board is already paired server-side; refresh the list, but still
    // surface success even if the refetch fails (e.g. session expired).
    try {
      const d = await fetch('/api/boards').then(r => r.json())
      boards = d.boards ?? []
      selectedId = info.boardId
    } catch { /* keep the current list; the toast still confirms the pair */ }
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
    stopStatusPoll()
  })

  const onlineCount = $derived(boards.filter(b => b.online).length)
  const isRunning = $derived(bmStatus?.running === true)

  const SPINNING = new Set(['Starting', 'Stopping', 'Calibrating'])
  const isSpinning = $derived(selected?.online && SPINNING.has(bmStatus?.status ?? ''))

  type DotColor = 'green' | 'yellow' | 'purple' | 'red' | 'gray'
  function bmDotColor(status: string | null, online: boolean): DotColor {
    if (!online) return 'gray'
    switch (status) {
      case 'Running': case 'Throw': case 'Starting': return 'green'
      case 'Takeout': case 'Takeout in progress': case 'Stopping': return 'yellow'
      case 'Calibrating': case 'Setup': return 'purple'
      case 'Stopped': case 'Error': case 'Offline': return 'red'
      default: return 'gray'
    }
  }
  const DOT_BG: Record<DotColor, string> = {
    green: 'bg-[#84cc16]', yellow: 'bg-[#facc15]', purple: 'bg-[#a78bfa]',
    red: 'bg-[#f87171]', gray: 'bg-[#4a4e45]',
  }
  const DOT_TEXT: Record<DotColor, string> = {
    green: 'text-[#84cc16]', yellow: 'text-[#facc15]', purple: 'text-[#a78bfa]',
    red: 'text-[#f87171]', gray: 'text-[#4a4e45]',
  }
  const dotColor = $derived(bmDotColor(bmStatus?.status ?? null, selected?.online ?? false))
  const dotBg    = $derived(DOT_BG[dotColor])
  const dotText  = $derived(DOT_TEXT[dotColor])
  const bmLabel  = $derived(bmStatus?.status ?? (selected?.online ? '—' : 'Offline'))
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
                <Badge variant="paired">Just paired</Badge>
              {:else}
                <span class="flex items-center gap-2 text-[13px] font-semibold
                             {board.online ? 'text-accent' : 'text-text-dim'}">
                  <span class="w-2 h-2 rounded-full {board.online ? 'bg-accent' : 'bg-text-dim'}"></span>
                  {board.online ? 'Online' : 'Offline'}
                </span>
                {#if justPaired}
                  <Badge variant="paired">Just paired</Badge>
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

          <!-- Board name + BM status -->
          <div class="flex items-center justify-between gap-3">
            <h3 class="m-0 font-display font-bold text-[24px] uppercase">{selected.name}</h3>
            {#if selected.online}
              <div class="flex items-center gap-[6px]">
                {#if isSpinning}
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="3" stroke-linecap="round" aria-hidden="true"
                    class="shrink-0 animate-spin {dotText}">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                {:else}
                  <span class="w-[7px] h-[7px] rounded-full shrink-0 {dotBg}"></span>
                {/if}
                <span class="text-[12px] font-medium {dotText}">{bmLabel}</span>
              </div>
            {/if}
          </div>

          <!-- Camera feeds -->
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

          <!-- Board controls -->
          {#if selected.online}
            <div class="flex flex-col gap-2">
              <!-- Start + Stop -->
              <div class="grid grid-cols-2 gap-2">
                <button type="button"
                  onclick={() => runAction('start')}
                  disabled={busy !== null || isRunning}
                  class="flex items-center justify-center gap-[6px] h-9 rounded-[8px] text-[13px] font-medium
                         border border-line-3 bg-transparent cursor-pointer font-[inherit] transition-colors
                         text-text hover:bg-surface-active disabled:opacity-35 disabled:cursor-not-allowed">
                  {#if busy === 'start'}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      stroke-width="2" stroke-linecap="round" aria-hidden="true" class="animate-spin">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                  {:else}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                  {/if}
                  Start
                </button>
                <button type="button"
                  onclick={() => runAction('stop')}
                  disabled={busy !== null || !isRunning}
                  class="flex items-center justify-center gap-[6px] h-9 rounded-[8px] text-[13px] font-medium
                         border border-line-3 bg-transparent cursor-pointer font-[inherit] transition-colors
                         text-text hover:bg-surface-active disabled:opacity-35 disabled:cursor-not-allowed">
                  {#if busy === 'stop'}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      stroke-width="2" stroke-linecap="round" aria-hidden="true" class="animate-spin">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                  {:else}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                    </svg>
                  {/if}
                  Stop
                </button>
              </div>

              <!-- Reset -->
              <button type="button"
                onclick={() => runAction('reset')}
                disabled={busy !== null}
                class="flex items-center justify-center gap-[6px] w-full h-9 rounded-[8px] text-[13px] font-medium
                       border border-line-3 bg-transparent cursor-pointer font-[inherit] transition-colors
                       text-text hover:bg-surface-active disabled:opacity-35 disabled:cursor-not-allowed">
                {#if busy === 'reset'}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round" aria-hidden="true" class="animate-spin">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                {:else}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                    <path d="M3 3v5h5"/>
                  </svg>
                {/if}
                Reset
              </button>

              <!-- Calibrate -->
              <button type="button"
                onclick={() => runAction('calibrate')}
                disabled={busy !== null}
                class="flex items-center justify-center gap-[6px] w-full h-9 rounded-[8px] text-[13px] font-medium
                       border border-line-3 bg-transparent cursor-pointer font-[inherit] transition-colors
                       text-text hover:bg-surface-active disabled:opacity-35 disabled:cursor-not-allowed">
                {#if busy === 'calibrate'}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round" aria-hidden="true" class="animate-spin">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                {:else}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                  </svg>
                {/if}
                Calibrate
              </button>
            </div>
          {/if}

          <!-- Board info -->
          <div class="flex flex-col gap-1">
            {#if selected.ip}
              <div class="flex justify-between items-center text-[14px]">
                <span class="text-text-dim">Board Manager</span>
                <a href="http://{selected.ip}" target="_blank" rel="noopener noreferrer"
                  class="font-mono text-accent hover:underline">
                  {selected.ip}
                </a>
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
    <Toast
      actionLabel="Play on it"
      onaction={() => { selectedId = toast!.boardId; toast = null }}
      onclose={() => { toast = null }}
    >
      <span class="text-text font-semibold">{toast.name}</span> is paired.
      It shows as online once all cameras report in.
    </Toast>
  {/if}
  </main>
</Layout>
