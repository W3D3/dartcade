<script lang="ts">
  import { ExternalLink, LoaderCircle, Pencil, Play, Plus, RotateCcw, Square, Sun } from '@lucide/svelte'
  import { onMount, onDestroy } from 'svelte'
  import { push } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Toast } from '$lib/components/ui/toast/index.js'
  import PairBoardModal from '$lib/components/PairBoardModal.svelte'
  import BoardCard from '$lib/components/boards/BoardCard.svelte'
  import PairBoardCard from '$lib/components/boards/PairBoardCard.svelte'
  import SelectedBoardBar from '$lib/components/boards/SelectedBoardBar.svelte'
  import { bmHost, fmtDate, fmtVersion } from '$lib/boards'
  import { isTablet } from '$lib/viewport'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import { api, runBoardAction, type Board, type BoardStatus, type BoardEvent, type BoardAction } from '$lib/api'

  let boards = $state<Board[]>([])
  let selectedId = $state<string | null>(null)
  let selected = $derived(boards.find(b => b.id === selectedId) ?? null)
  let cameraTs = $state(Date.now())
  let cameraInterval: ReturnType<typeof setInterval> | null = null
  let bmStatus = $state<BoardStatus | null>(null)
  let bmStatusInterval: ReturnType<typeof setInterval> | null = null
  let busy = $state<string | null>(null)

  async function loadBmStatus(boardId: string) {
    try {
      const { data } = await api.GET('/api/boards/{id}/status', { params: { path: { id: boardId } } })
      bmStatus = data ?? null
    } catch {
      bmStatus = null
    }
  }

  function startStatusPoll(boardId: string) {
    stopStatusPoll()
    void loadBmStatus(boardId)
    bmStatusInterval = setInterval(() => void loadBmStatus(boardId), 3000)
  }

  function stopStatusPoll() {
    if (bmStatusInterval) {
      clearInterval(bmStatusInterval)
      bmStatusInterval = null
    }
    bmStatus = null
  }

  $effect(() => {
    if (selected?.online && selected.id) startStatusPoll(selected.id)
    else stopStatusPoll()
  })

  const currentBoard = (): Board | null => selected ?? null

  async function runAction(action: BoardAction) {
    if (!selected) return
    busy = action
    try {
      await runBoardAction(selected.id, action)
    } catch {
      /* ignore */
    } finally {
      busy = null
      // The selection may have changed while the action ran
      const now = currentBoard()
      if (now?.online) void loadBmStatus(now.id)
    }
  }

  // Live event feed (recent bridge events, polled)
  let events = $state<BoardEvent[]>([])
  let eventsInterval: ReturnType<typeof setInterval> | null = null
  let eventsEl = $state<HTMLDivElement | null>(null)

  async function loadEvents(boardId: string) {
    try {
      const { data } = await api.GET('/api/boards/{id}/events', { params: { path: { id: boardId } } })
      if (data && boardId === selectedId) events = data.events
    } catch {
      /* keep last known feed */
    }
  }

  $effect(() => {
    const id = selectedId
    events = []
    if (!id) return
    void loadEvents(id)
    eventsInterval = setInterval(() => void loadEvents(id), 1500)
    return () => {
      if (eventsInterval) clearInterval(eventsInterval)
      eventsInterval = null
    }
  })

  // Keep the feed pinned to the newest event
  $effect(() => {
    if (events.length && eventsEl) eventsEl.scrollTop = eventsEl.scrollHeight
  })

  const EVENT_VERB: Record<string, string> = {
    'dart.detected': 'throw',
    'dart.corrected': 'fix',
    'takeout.started': 'takeout',
    'visit.cleared': 'reset',
  }
  function fmtTime(iso: string) {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? '--:--:--' : d.toLocaleTimeString('en-GB', { hour12: false })
  }

  // Camera tiles: dot turns accent once a frame has loaded
  let camOk = $state<Partial<Record<number, boolean>>>({})

  // Rename
  let editing = $state(false)
  let draftName = $state('')
  function startEdit() {
    if (!selected) return
    draftName = selected.name
    editing = true
  }
  async function saveName() {
    if (!editing || !selected) return
    editing = false
    const name = draftName.trim()
    if (!name || name === selected.name) return
    const id = selected.id
    const { error } = await api.PATCH('/api/boards/{id}', { params: { path: { id } }, body: { name } }).catch(() => ({ error: true }))
    if (!error) boards = boards.map(b => (b.id === id ? { ...b, name } : b))
  }

  // Unpair
  let confirmUnpair = $state(false)
  let unpairError = $state<string | null>(null)

  // A different board: reset its camera tiles, rename field and unpair error
  let lastSelected: string | null | undefined = undefined
  $effect(() => {
    if (selectedId === lastSelected) return
    lastSelected = selectedId
    camOk = {}
    editing = false
    unpairError = null
  })
  async function unpair() {
    confirmUnpair = false
    if (!selected) return
    const id = selected.id
    const res = await api.DELETE('/api/boards/{id}', { params: { path: { id } } }).catch(() => null)
    if (!res || res.error) {
      unpairError = res?.response.status === 409 ? 'Board has an active session' : 'Could not unpair board'
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
      const { data } = await api.GET('/api/boards')
      boards = data?.boards ?? []
      selectedId = info.boardId
    } catch {
      /* keep the current list; the toast still confirms the pair */
    }
    justPairedId = info.boardId
    toast = info
    if (toastTimer) clearTimeout(toastTimer)
    if (pairedTimer) clearTimeout(pairedTimer)
    toastTimer = setTimeout(() => {
      toast = null
    }, 8000)
    pairedTimer = setTimeout(() => {
      justPairedId = null
    }, 12000)
  }

  onMount(async () => {
    const { data } = await api.GET('/api/boards')
    if (!data) return // 401 is redirected to login by the client
    boards = data.boards
    if (boards.length) selectedId = boards[0].id
    cameraInterval = setInterval(() => {
      cameraTs = Date.now()
    }, 1000)
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
      case 'Running':
      case 'Throw':
      case 'Starting':
        return 'green'
      case 'Takeout':
      case 'Takeout in progress':
      case 'Stopping':
        return 'yellow'
      case 'Calibrating':
      case 'Setup':
        return 'purple'
      case 'Stopped':
      case 'Error':
      case 'Offline':
        return 'red'
      default:
        return 'gray'
    }
  }
  const DOT_BG: Record<DotColor, string> = {
    green: 'bg-[#84cc16]',
    yellow: 'bg-[#facc15]',
    purple: 'bg-[#a78bfa]',
    red: 'bg-[#f87171]',
    gray: 'bg-[#4a4e45]',
  }
  const DOT_TEXT: Record<DotColor, string> = {
    green: 'text-[#84cc16]',
    yellow: 'text-[#facc15]',
    purple: 'text-[#a78bfa]',
    red: 'text-[#f87171]',
    gray: 'text-[#4a4e45]',
  }
  const dotColor = $derived(bmDotColor(bmStatus?.status ?? null, selected?.online ?? false))
  const dotBg = $derived(DOT_BG[dotColor])
  const dotText = $derived(DOT_TEXT[dotColor])
  const bmLabel = $derived(bmStatus?.status ?? (selected?.online ? '—' : 'Offline'))
  const listening = $derived(selected?.online && isRunning)
</script>

{#snippet control(action: BoardAction, label: string, blocked: boolean, icon: import('svelte').Snippet)}
  <button
    type="button"
    onclick={() => runAction(action)}
    disabled={busy !== null || blocked}
    class="flex items-center justify-center gap-[6px] h-9 rounded-[8px] text-[12px] font-medium
           border border-line-3 bg-transparent cursor-pointer font-[inherit] transition-colors
           text-text hover:bg-surface-active disabled:opacity-35 disabled:cursor-not-allowed"
  >
    {#if busy === action}
      <LoaderCircle size={12} class="animate-spin" />
    {:else}
      {@render icon()}
    {/if}
    {label}
  </button>
{/snippet}

{#snippet startIcon()}
  <Play size={12} fill="currentColor" />
{/snippet}
{#snippet stopIcon()}
  <Square size={12} fill="currentColor" />
{/snippet}
{#snippet resetIcon()}
  <RotateCcw size={12} />
{/snippet}
{#snippet calibrateIcon()}
  <Sun size={12} />
{/snippet}

<!-- The selected board's name, renamable in place (large in the desktop panel, smaller in the tablet bar) -->
{#snippet nameField()}
  {#if selected}
    {#if editing}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        bind:value={draftName}
        autofocus
        aria-label="Board name"
        onblur={saveName}
        onkeydown={e => {
          if (e.key === 'Enter') void saveName()
          else if (e.key === 'Escape') editing = false
        }}
        class="w-full box-border bg-transparent border-0 border-b border-line-3 p-0 outline-none
               font-display font-bold {$isTablet ? 'text-[22px]' : 'text-[32px]'} leading-tight uppercase text-text"
      />
    {:else}
      <h3 class="m-0 font-display font-bold {$isTablet ? 'text-[22px]' : 'text-[32px]'} leading-tight uppercase truncate">
        {selected.name}
      </h3>
    {/if}
  {/if}
{/snippet}

{#snippet renameButton()}
  <button
    type="button"
    onclick={startEdit}
    aria-label="Rename board"
    class="shrink-0 {$isTablet ? 'w-9 h-9' : 'w-10 h-10'} flex items-center justify-center rounded-[10px] border border-line-3
           bg-transparent text-text cursor-pointer transition-colors hover:bg-surface-active"
  >
    <Pencil size={14} />
  </button>
{/snippet}

{#snippet barName()}
  <div class="flex items-center gap-2 min-w-0">{@render nameField()}{@render renameButton()}</div>
{/snippet}

{#snippet boardDetails()}
  {#if selected}
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
              src="/api/boards/{selected.id}/camera/{camIndex}/live?t={cameraTs}"
              alt="Camera {camIndex + 1}"
              class="absolute inset-0 w-full h-full object-cover {camOk[camIndex] ? '' : 'invisible'}"
              onload={() => {
                camOk[camIndex] = true
              }}
              onerror={() => {
                camOk[camIndex] = false
              }}
            />
          {/if}
          <span
            class="absolute left-1.5 bottom-1.5 flex items-center gap-[6px] px-1.5 py-[2px] rounded-[4px]
                     font-mono text-[11px] text-text-muted {camOk[camIndex] ? 'bg-bg/75' : ''}"
          >
            CAM {camIndex + 1}
            <span class="w-[6px] h-[6px] rounded-full {camOk[camIndex] ? 'bg-accent' : 'bg-text-dim'}"></span>
          </span>
        </div>
      {/each}
    </div>

    <!-- Board controls -->
    {#if selected.online}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
            <a
              href={selected.bmUrl ?? `http://${selected.ip}`}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-[6px] cursor-pointer !text-text underline decoration-line-3
                   underline-offset-4 transition-colors hover:!text-accent hover:decoration-accent"
            >
              {bmHost(selected)}
              <ExternalLink size={12} />
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
          <Badge variant="soon">Soon</Badge>
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
              <LoaderCircle size={9} strokeWidth={3} class="shrink-0 animate-spin" />
            {:else}
              <span class="w-[6px] h-[6px] rounded-full {dotBg}"></span>
            {/if}
            {bmLabel}
          </span>
        {/if}
      </div>
      <div
        bind:this={eventsEl}
        class="{$isTablet ? 'h-[240px]' : 'flex-grow min-h-[200px]'} overflow-y-auto scrollbar-themed box-border p-4 rounded-[10px]
             border border-line-2 bg-bg font-mono text-[13px] leading-[1.8]"
      >
        {#each events as ev, i (i)}
          {@const seg = ev.data.dart?.segment}
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
  {/if}
{/snippet}

{#snippet boardActions()}
  <button
    type="button"
    onclick={() => push(`/?board=${selectedId}`)}
    class="flex-grow h-12 px-[18px] whitespace-nowrap rounded-[10px] border-0 bg-text text-accent-fg text-[15px] font-semibold
           cursor-pointer font-[inherit] transition-opacity hover:opacity-90"
  >
    Play on this board
  </button>
  <button
    type="button"
    onclick={() => {
      confirmUnpair = true
    }}
    class="h-12 px-5 rounded-[10px] border border-line-3 bg-transparent text-live-text text-[15px]
           font-semibold cursor-pointer font-[inherit] transition-colors hover:bg-surface-active"
  >
    Unpair
  </button>
{/snippet}

<Layout title="Boards">
  <main class="flex flex-grow flex-col gap-4 md:gap-7 box-border min-w-0 overflow-y-auto p-4 md:p-[40px_32px] xl:p-[40px_44px]">
    <!-- Header -->
    <header class="flex items-end justify-between">
      <div class="hidden md:flex flex-col gap-[6px]">
        <h1 class="m-0 font-display font-bold text-[48px] leading-none uppercase tracking-[0.02em]">Boards</h1>
        <p class="m-0 text-[15px] text-text-muted">
          Autodarts boards linked through your Dartcade bridge ·
          <span class="text-text">{onlineCount} online</span> · {boards.length - onlineCount} offline
        </p>
      </div>
      <Button
        variant="primary"
        class="h-12 text-[18px]"
        onclick={() => {
          pairOpen = true
        }}
      >
        <Plus size={18} strokeWidth={2.4} />
        Pair new board
      </Button>
    </header>

    <div class="flex flex-col xl:flex-row gap-4 md:gap-6 xl:flex-grow xl:min-h-0">
      <!-- Board grid; tablets add the pairing card to it -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 xl:flex-grow xl:grid-rows-2 content-start">
        {#each boards as board (board.id)}
          <BoardCard
            {board}
            active={board.id === selectedId}
            justPaired={board.id === justPairedId}
            onselect={() => (selectedId = board.id)}
          />
        {:else}
          <div
            class="col-span-2 flex items-center justify-center h-40 rounded-[14px]
                      border border-dashed border-line-2 text-text-muted text-[15px]"
          >
            No boards yet — pair one to get started
          </div>
        {/each}
        {#if $isTablet}<PairBoardCard
            onpair={() => {
              pairOpen = true
            }}
          />{/if}
      </div>

      {#if selected && $isTablet}
        <!-- Tablets: a Selected bar under the grid; cameras and live events open under it -->
        <div class="flex flex-col gap-2">
          <SelectedBoardBar board={selected} name={barName} actions={boardActions} details={boardDetails} />
          {#if unpairError}<p class="m-0 text-[13px] text-live-text">{unpairError}</p>{/if}
        </div>
      {:else if selected}
        <aside
          class="w-full xl:w-[clamp(420px,50%,720px)] xl:flex-shrink-0 box-border p-4 md:p-6 border border-line-2 rounded-[14px]
                       bg-surface-2 flex flex-col gap-5"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex flex-col gap-1 min-w-0">
              <span class="text-[11px] font-medium uppercase tracking-[0.12em] text-text-dim">Selected board</span>
              {@render nameField()}
            </div>
            {@render renameButton()}
          </div>
          {@render boardDetails()}
          {#if unpairError}
            <p class="m-0 -mb-2 text-[13px] text-live-text">{unpairError}</p>
          {/if}
          <div class="flex gap-3">{@render boardActions()}</div>
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
        oncancel={() => {
          confirmUnpair = false
        }}
      />
    {/if}

    {#if pairOpen}
      <PairBoardModal
        onclose={() => {
          pairOpen = false
        }}
        onpaired={onPaired}
      />
    {/if}

    <!-- Success toast -->
    {#if toast}
      <Toast
        actionLabel="Play on it"
        onaction={() => {
          if (toast) selectedId = toast.boardId
          toast = null
        }}
        onclose={() => {
          toast = null
        }}
      >
        <span class="text-text font-semibold">{toast.name}</span> is paired. It shows as online once all cameras report in.
      </Toast>
    {/if}
  </main>
</Layout>
