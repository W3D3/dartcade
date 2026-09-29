<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { push } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Toast } from '$lib/components/ui/toast/index.js'
  import PairBoardModal from '$lib/components/PairBoardModal.svelte'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'

  type Board = {
    id: string; name: string; online: boolean; ip?: string | null
    bridgeVersion?: string | null; totalGames?: number; latencyMs?: number
    createdAt?: string | null; bmUrl?: string | null
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

  // Live event feed (recent bridge events, polled)
  type Segment = { name: string; multiplier: number }
  type BoardEvent = { at: string; kind: string; data: { dart?: { segment?: Segment; score?: number } } }
  let events = $state<BoardEvent[]>([])
  let eventsInterval: ReturnType<typeof setInterval> | null = null
  let eventsEl = $state<HTMLDivElement | null>(null)

  async function loadEvents(boardId: string) {
    try {
      const res = await fetch(`/api/boards/${boardId}/events`)
      if (!res.ok) return
      const d = await res.json()
      if (boardId === selectedId) events = d.events ?? []
    } catch { /* keep last known feed */ }
  }

  $effect(() => {
    const id = selectedId
    events = []
    if (!id) return
    loadEvents(id)
    eventsInterval = setInterval(() => loadEvents(id), 1500)
    return () => { if (eventsInterval) clearInterval(eventsInterval); eventsInterval = null }
  })

  // Keep the feed pinned to the newest event
  $effect(() => {
    if (events.length && eventsEl) eventsEl.scrollTop = eventsEl.scrollHeight
  })

  const EVENT_VERB: Record<string, string> = {
    'dart.detected': 'throw', 'dart.corrected': 'fix',
    'takeout.started': 'takeout', 'visit.cleared': 'reset',
  }
  function fmtTime(iso: string) {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? '--:--:--' : d.toLocaleTimeString('en-GB', { hour12: false })
  }
  // "0.4.2" / "v0.4.2" → "v0.4.2"; non-semver builds (e.g. "dev") as-is
  function fmtVersion(v?: string | null) {
    if (!v) return null
    return /^v?\d/.test(v) ? `v${v.replace(/^v/, '')}` : v
  }

  // host:port of the Board Manager, falling back to the bare IP
  function bmHost(b: Board) {
    try { if (b.bmUrl) return new URL(b.bmUrl).host } catch { /* fall through */ }
    return b.ip ?? ''
  }
  function fmtDate(iso?: string | null) {
    if (!iso) return '—'
    const d = new Date(iso)
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  // Camera tiles: dot turns accent once a frame has loaded
  let camOk = $state<Record<number, boolean>>({})
  $effect(() => { selectedId; camOk = {} })

  // Rename
  let editing = $state(false)
  let draftName = $state('')
  function startEdit() { if (!selected) return; draftName = selected.name; editing = true }
  async function saveName() {
    if (!editing || !selected) return
    editing = false
    const name = draftName.trim()
    if (!name || name === selected.name) return
    const id = selected.id
    const res = await fetch(`/api/boards/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }),
    }).catch(() => null)
    if (res?.ok) boards = boards.map(b => b.id === id ? { ...b, name } : b)
  }
  $effect(() => { selectedId; editing = false })

  // Unpair
  let confirmUnpair = $state(false)
  let unpairError = $state<string | null>(null)
  $effect(() => { selectedId; unpairError = null })
  async function unpair() {
    confirmUnpair = false
    if (!selected) return
    const id = selected.id
    const res = await fetch(`/api/boards/${id}`, { method: 'DELETE' }).catch(() => null)
    if (!res?.ok) {
      unpairError = res?.status === 409 ? 'Board has an active session' : 'Could not unpair board'
      return
    }
    boards = boards.filter(b => b.id !== id)
    selectedId = boards[0]?.id ?? null
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
  const listening = $derived(selected?.online && isRunning)
</script>

{#snippet control(action: string, label: string, blocked: boolean, icon: import('svelte').Snippet)}
  <button type="button"
    onclick={() => runAction(action)}
    disabled={busy !== null || blocked}
    class="flex items-center justify-center gap-[6px] h-9 rounded-[8px] text-[12px] font-medium
           border border-line-3 bg-transparent cursor-pointer font-[inherit] transition-colors
           text-text hover:bg-surface-active disabled:opacity-35 disabled:cursor-not-allowed">
    {#if busy === action}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" aria-hidden="true" class="animate-spin">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
    {:else}
      {@render icon()}
    {/if}
    {label}
  </button>
{/snippet}

{#snippet startIcon()}
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
{/snippet}
{#snippet stopIcon()}
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
  </svg>
{/snippet}
{#snippet resetIcon()}
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
  </svg>
{/snippet}
{#snippet calibrateIcon()}
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
  </svg>
{/snippet}

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
                {#if board.latencyMs != null}
                  <span class="font-mono text-[12px] text-text-dim">{board.latencyMs} ms</span>
                {:else}
                  <Badge variant="soon">Latency · soon</Badge>
                {/if}
              {/if}
            </div>

            <div class="flex flex-col gap-1">
              <h2 class="m-0 font-display font-bold text-[32px] leading-none uppercase">{board.name}</h2>
              {#if board.ip}
                <span class="font-mono text-[13px] text-text-muted">{bmHost(board)}</span>
              {/if}
            </div>

            <dl class="m-0 mt-auto grid grid-cols-2 gap-3 pt-4 border-t border-line-2">
              <div>
                <dt class="text-[12px] text-text-dim">Bridge</dt>
                <dd class="mt-1 m-0 text-[15px] font-semibold">{fmtVersion(board.bridgeVersion) ?? '—'}</dd>
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
        <aside class="w-[clamp(420px,50%,720px)] flex-shrink-0 box-border p-6 border border-line-2 rounded-[14px]
                       bg-surface-2 flex flex-col gap-5">

          <!-- Header: eyebrow + name + edit -->
          <div class="flex items-start justify-between gap-3">
            <div class="flex flex-col gap-1 min-w-0">
              <span class="text-[11px] font-medium uppercase tracking-[0.12em] text-text-dim">Selected board</span>
              {#if editing}
                <!-- svelte-ignore a11y_autofocus -->
                <input
                  bind:value={draftName}
                  autofocus
                  onblur={saveName}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') saveName()
                    else if (e.key === 'Escape') editing = false
                  }}
                  class="w-full box-border bg-transparent border-0 border-b border-line-3 p-0 outline-none
                         font-display font-bold text-[32px] leading-tight uppercase text-text"
                />
              {:else}
                <h3 class="m-0 font-display font-bold text-[32px] leading-tight uppercase truncate">{selected.name}</h3>
              {/if}
            </div>
            <button type="button" onclick={startEdit} aria-label="Rename board"
              class="shrink-0 w-10 h-10 flex items-center justify-center rounded-[10px] border border-line-3
                     bg-transparent text-text cursor-pointer transition-colors hover:bg-surface-active">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
              </svg>
            </button>
          </div>

          <!-- Camera tiles -->
          <div class="grid grid-cols-3 gap-2">
            {#each [0, 1, 2] as camIndex (camIndex)}
              <div class="relative rounded-[10px] overflow-hidden border border-line-2 bg-surface-active aspect-[4/3]">
                {#if selected.online}
                  {#if camOk[camIndex] === undefined}
                    <!-- Skeleton until the first frame loads (or fails) -->
                    <div class="absolute inset-0 animate-pulse bg-line-2" aria-hidden="true"></div>
                  {/if}
                  <img
                    src="/api/boards/{selected.id}/camera/{camIndex}?t={cameraTs}"
                    alt="Camera {camIndex + 1}"
                    class="absolute inset-0 w-full h-full object-cover {camOk[camIndex] ? '' : 'invisible'}"
                    onload={() => { camOk[camIndex] = true }}
                    onerror={() => { camOk[camIndex] = false }}
                  />
                {/if}
                <span class="absolute left-1.5 bottom-1.5 flex items-center gap-[6px] px-1.5 py-[2px] rounded-[4px]
                             font-mono text-[11px] text-text-muted {camOk[camIndex] ? 'bg-bg/75' : ''}">
                  CAM {camIndex + 1}
                  <span class="w-[6px] h-[6px] rounded-full {camOk[camIndex] ? 'bg-accent' : 'bg-text-dim'}"></span>
                </span>
              </div>
            {/each}
          </div>

          <!-- Board controls -->
          {#if selected.online}
            <div class="grid grid-cols-4 gap-2">
              {@render control('start', 'Start', isRunning, startIcon)}
              {@render control('stop', 'Stop', !isRunning, stopIcon)}
              {@render control('reset', 'Reset', false, resetIcon)}
              {@render control('calibrate', 'Calibrate', false, calibrateIcon)}
            </div>
          {/if}

          <!-- Board info -->
          <dl class="m-0 flex flex-col text-[14px]">
            <div class="flex justify-between items-center gap-3 py-3 border-b border-line-2">
              <dt class="text-text-muted">Board Manager</dt>
              <dd class="m-0 font-mono">
                {#if selected.ip}
                  <a href={selected.bmUrl ?? `http://${selected.ip}`} target="_blank" rel="noopener noreferrer"
                    class="inline-flex items-center gap-[6px] cursor-pointer !text-text underline decoration-line-3
                           underline-offset-4 transition-colors hover:!text-accent hover:decoration-accent">
                    {bmHost(selected)}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    </svg>
                  </a>
                {:else}—{/if}
              </dd>
            </div>
            <div class="flex justify-between items-center gap-3 py-3 border-b border-line-2">
              <dt class="text-text-muted">Bridge</dt>
              <dd class="m-0">
                {selected.bridgeVersion ? `${fmtVersion(selected.bridgeVersion)} · ` : ''}{selected.online ? 'connected' : 'offline'}
              </dd>
            </div>
            <div class="flex justify-between items-center gap-3 py-3 border-b border-line-2">
              <dt class="text-text-muted">Latency</dt>
              <dd class="m-0">
                {#if selected.latencyMs != null}
                  {selected.latencyMs} ms
                {:else}
                  <Badge variant="soon">Soon</Badge>
                {/if}
              </dd>
            </div>
            <div class="flex justify-between items-center gap-3 py-3 border-b border-line-2">
              <dt class="text-text-muted">Paired</dt>
              <dd class="m-0">{fmtDate(selected.createdAt)}</dd>
            </div>
          </dl>

          <!-- Live events -->
          <div class="flex flex-col gap-3 flex-grow min-h-0">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-medium uppercase tracking-[0.12em] text-text-dim">Live events</span>
              {#if listening}
                <span class="flex items-center gap-[6px] text-[12px] font-medium text-accent">
                  <span class="w-[6px] h-[6px] rounded-full bg-accent"></span>
                  Listening
                </span>
              {:else}
                <span class="flex items-center gap-[6px] text-[12px] font-medium {dotText}">
                  {#if isSpinning}
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      stroke-width="3" stroke-linecap="round" aria-hidden="true" class="shrink-0 animate-spin">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                  {:else}
                    <span class="w-[6px] h-[6px] rounded-full {dotBg}"></span>
                  {/if}
                  {bmLabel}
                </span>
              {/if}
            </div>
            <div bind:this={eventsEl}
              class="flex-grow min-h-[200px] overflow-y-auto scrollbar-themed box-border p-4 rounded-[10px]
                     border border-line-2 bg-bg font-mono text-[13px] leading-[1.8]">
              {#each events as ev, i (i)}
                {@const seg = ev.data?.dart?.segment}
                <div class="whitespace-nowrap">
                  <span class="text-text-dim">{fmtTime(ev.at)}</span>
                  <span>{EVENT_VERB[ev.kind] ?? ev.kind}</span>
                  {#if seg}
                    <span class={seg.multiplier > 1 ? 'text-accent' : ''}>{seg.name}</span>
                    <span>{ev.data.dart?.score ?? ''}</span>
                  {/if}
                </div>
              {:else}
                <span class="text-text-dim">{selected.online ? 'Waiting for throws…' : 'Board offline'}</span>
              {/each}
            </div>
          </div>

          <!-- Actions -->
          {#if unpairError}
            <p class="m-0 -mb-2 text-[13px] text-live-text">{unpairError}</p>
          {/if}
          <div class="flex gap-3">
            <button type="button" onclick={() => push(`/?board=${selectedId}`)}
              class="flex-grow h-12 rounded-[10px] border-0 bg-text text-accent-fg text-[15px] font-semibold
                     cursor-pointer font-[inherit] transition-opacity hover:opacity-90">
              Play on this board
            </button>
            <button type="button" onclick={() => { confirmUnpair = true }}
              class="h-12 px-5 rounded-[10px] border border-line-3 bg-transparent text-live-text text-[15px]
                     font-semibold cursor-pointer font-[inherit] transition-colors hover:bg-surface-active">
              Unpair
            </button>
          </div>
        </aside>
      {/if}
    </div>

  {#if confirmUnpair && selected}
    <ConfirmModal
      title="Unpair {selected.name}?"
      body="The bridge will be disconnected. You can pair it again later with a new code."
      confirmLabel="Unpair"
      cancelLabel="Cancel"
      danger
      onconfirm={unpair}
      oncancel={() => { confirmUnpair = false }}
    />
  {/if}

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
