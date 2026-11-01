<script lang="ts">
  // Settings' Boards section (Boards, Mobile-Boards, Tablet-Boards boards): the board chips, the
  // selected board's panel and its cards (cameras, live events, lights, game, big screen, pairing). With none yet, the
  // Settings-Boards-Empty onboarding.
  import ErrorText from '$lib/components/ErrorText.svelte'
  import {
    Activity,
    Camera,
    Download,
    ExternalLink,
    Lightbulb,
    Link2,
    LoaderCircle,
    Pencil,
    Play,
    RotateCcw,
    Square,
    Sun,
  } from '@lucide/svelte'
  import { onMount, onDestroy } from 'svelte'
  import { push, querystring } from 'svelte-spa-router'
  import { hasBoards } from '$lib/hasBoards'
  import { flag } from '$lib/flags'
  import { Toast } from '$lib/components/ui/toast/index.js'
  import PairBoardModal from '$lib/components/PairBoardModal.svelte'
  import AutoStartSwitch from './AutoStartSwitch.svelte'
  import BigScreenSetup from './BigScreenSetup.svelte'
  import BoardsEmpty from '$lib/components/boards/BoardsEmpty.svelte'
  import BoardChips from './BoardChips.svelte'
  import SectionCard from './SectionCard.svelte'
  import { applyBoardStatus, bmHost, bridgeUpdateView, fmtDate, fmtVersion } from '$lib/boards'
  import { me } from '$lib/lobby/sockets'
  import { DOT_TEXT, bmDotColor } from '$lib/boardStatus'
  import BoardStatusDot from '../BoardStatusDot.svelte'
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
  // The list has come back: until then neither the boards nor the empty state show
  let loaded = $state(false)

  // WLED device count per board, for the card chip and the selected board's detail row
  const lightsOn = flag('lights.enabled')
  const bigScreenOn = flag('bigscreen.enabled')
  let lightsCounts = $state<Partial<Record<string, number>>>({})
  // Guards against a slower, superseded fetch overwriting a fresher one (same idea as
  // LightsSection's lightsReq)
  let lightsCountsReq = 0

  async function loadLightsCounts(ids: string[]) {
    const req = ++lightsCountsReq
    const entries = await Promise.all(
      ids.map(async id => {
        try {
          const { data } = await api.GET('/api/boards/{id}/lights', { params: { path: { id } } })
          return [id, data?.devices.length ?? null] as const
        } catch {
          return [id, null] as const
        }
      }),
    )
    if (req !== lightsCountsReq) return // a newer fetch has started since; drop this stale one
    const next: Partial<Record<string, number>> = {}
    for (const [id, count] of entries) if (count !== null) next[id] = count
    lightsCounts = next
  }

  $effect(() => {
    if ($lightsOn && boards.length) void loadLightsCounts(boards.map(b => b.id))
  })

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

  // Update bridge: the bridge reports its progress, which /ws/me pushes (board.status); the poll
  // only covers a missed push
  const updateView = $derived(selected ? bridgeUpdateView(selected) : ({ kind: 'none' } as const))
  let updateRequestError = $state<string | null>(null)

  async function refetchBoards() {
    try {
      const { data } = await api.GET('/api/boards')
      if (data) boards = data.boards
    } catch {
      /* keep the list */
    }
  }

  async function updateBridge() {
    if (!selected) return
    const id = selected.id
    busy = 'bridge-update'
    updateRequestError = null
    const res = await api.POST('/api/boards/{id}/bridge-update', { params: { path: { id } } }).catch(() => null)
    busy = null
    if (!res) {
      updateRequestError = 'Could not reach the server'
      return
    }
    if (res.error) {
      updateRequestError = res.error.error
      return
    }
    const status = res.data
    boards = boards.map(b => (b.id === id ? { ...b, bridgeUpdate: { ...b.bridgeUpdate, status } } : b))
  }

  $effect(() => {
    if (updateView.kind !== 'busy') return
    const poll = setInterval(() => void refetchBoards(), 5000)
    return () => clearInterval(poll)
  })

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
  const camsSending = $derived(Object.values(camOk).filter(Boolean).length)

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
    updateRequestError = null
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
    hasBoards.set(boards.length > 0)
  }

  // The nav's Connect your board card links here with ?pair
  let pairOpen = $state($querystring === 'pair')
  // A code typed into the empty state's field, carried into the pairing dialog
  let pairCode = $state('')
  let justPairedId = $state<string | null>(null)
  let toast = $state<{ name: string; boardId: string } | null>(null)
  let toastTimer: ReturnType<typeof setTimeout> | null = null
  let pairedTimer: ReturnType<typeof setTimeout> | null = null

  async function onPaired(info: { boardId: string; name: string }) {
    pairOpen = false
    pairCode = ''
    hasBoards.set(true)
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
    // Before the await: leaving while the list loads runs onDestroy first
    cameraInterval = setInterval(() => {
      cameraTs = Date.now()
    }, 1000)
    const { data } = await api.GET('/api/boards')
    if (!data) return // 401 is redirected to login by the client
    boards = data.boards
    loaded = true
    hasBoards.set(boards.length > 0)
    if (boards.length) selectedId = boards[0].id
  })
  onDestroy(() => {
    if (cameraInterval) clearInterval(cameraInterval)
    if (toastTimer) clearTimeout(toastTimer)
    if (pairedTimer) clearTimeout(pairedTimer)
    stopStatusPoll()
  })

  // A bridge connected or dropped (/ws/me): the list follows it without a reload. Before the
  // list has loaded, onMount's fetch is newer than any push.
  onDestroy(
    me.boardStatus.subscribe(msg => {
      if (!msg || !loaded) return
      const next = applyBoardStatus(boards, msg)
      if (next !== 'refetch') boards = next
      else void refetchBoards()
    }),
  )

  const isRunning = $derived(bmStatus?.running === true)

  const dotColor = $derived(bmDotColor(bmStatus?.status ?? null, selected?.online ?? false))
  const dotText = $derived(DOT_TEXT[dotColor])
  const bmLabel = $derived(bmStatus?.status ?? (selected?.online ? '—' : 'Offline'))
  const listening = $derived(selected?.online && isRunning)
</script>

{#snippet control(action: BoardAction, label: string, blocked: boolean, icon: import('svelte').Snippet)}
  <button
    type="button"
    onclick={() => runAction(action)}
    disabled={busy !== null || blocked}
    class="flex items-center justify-center gap-[6px] h-11 rounded-[10px] text-[14px] font-semibold
           border border-line-3 bg-transparent cursor-pointer font-[inherit] transition-colors
           text-text hover:bg-surface-active disabled:opacity-35 disabled:cursor-not-allowed"
  >
    {#if busy === action}
      <LoaderCircle size={14} class="animate-spin" />
    {:else}
      {@render icon()}
    {/if}
    {label}
  </button>
{/snippet}

{#snippet startIcon()}
  <Play size={14} fill="currentColor" />
{/snippet}
{#snippet stopIcon()}
  <Square size={14} fill="currentColor" />
{/snippet}
{#snippet resetIcon()}
  <RotateCcw size={14} />
{/snippet}
{#snippet calibrateIcon()}
  <Sun size={14} />
{/snippet}

{#snippet statusDot()}
  <BoardStatusDot status={bmStatus?.status ?? null} online={selected?.online ?? false} />
{/snippet}

{#snippet cell(label: string, value: import('svelte').Snippet)}
  <div class="bg-surface-1 px-4 py-[14px] flex flex-col gap-[6px] min-w-0">
    <dt class="text-[12px] label-caps text-text-dim">{label}</dt>
    <dd class="m-0 text-[16px] font-semibold break-words">{@render value()}</dd>
  </div>
{/snippet}

{#snippet bmCell()}
  {#if selected?.ip}
    <a
      href={selected.bmUrl ?? `http://${selected.ip}`}
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-[6px] font-mono text-[15px] !text-text underline decoration-line-3 underline-offset-4
             transition-colors hover:!text-accent hover:decoration-accent"
    >
      {bmHost(selected)}<ExternalLink size={12} />
    </a>
    {#if selected.bmVersion}<span class="ml-2 text-[13px] font-medium text-text-muted">{fmtVersion(selected.bmVersion)}</span>{/if}
  {:else}–{/if}
{/snippet}
{#snippet bridgeCell()}
  {#if selected}{selected.bridgeVersion ? `${fmtVersion(selected.bridgeVersion)} · ` : ''}{selected.online ? 'connected' : 'offline'}{/if}
{/snippet}
{#snippet gamesCell()}—{/snippet}

<div class="flex flex-grow flex-col gap-5 min-w-0">
  {#if loaded && boards.length === 0}
    <BoardsEmpty
      onpair={(code: string) => {
        pairCode = code
        pairOpen = true
      }}
    />
  {:else if loaded}
    <BoardChips
      {boards}
      {selectedId}
      {justPairedId}
      onselect={(id: string) => (selectedId = id)}
      onpair={() => {
        pairOpen = true
      }}
    />

    {#if selected}
      <!-- The selected board: its state and name, Play, and the facts about it -->
      <section
        aria-label="Selected board"
        class="box-border p-[18px] md:p-6 rounded-[16px] bg-surface-panel border border-line flex flex-col gap-5"
      >
        <div class="flex flex-wrap items-end gap-x-5 gap-y-4">
          <div class="flex flex-col gap-2 min-w-0 flex-1">
            <span class="inline-flex items-center gap-2 text-[14px] font-semibold {dotText}">
              {@render statusDot()}
              {#if justPairedId === selected.id && !selected.online}
                Just paired · connecting cameras…
              {:else if !selected.online}
                Offline
              {:else if listening}
                Online · listening for throws
              {:else}
                Online · {bmLabel}
              {/if}
            </span>
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
                       font-display font-bold text-[36px] md:text-[52px] leading-[0.95] uppercase text-text"
              />
            {:else}
              <h2 class="m-0 font-display font-bold text-[36px] md:text-[52px] leading-[0.95] tracking-[0.01em] uppercase truncate">
                {selected.name}
              </h2>
            {/if}
          </div>
          <div class="flex gap-[10px] w-full sm:w-auto">
            <button
              type="button"
              onclick={() => push(`/?board=${selectedId}`)}
              class="flex-grow sm:flex-grow-0 h-[52px] px-5 whitespace-nowrap rounded-[12px] border-0 bg-text text-accent-fg text-[16px]
                     font-semibold cursor-pointer font-[inherit] transition-opacity hover:opacity-90"
            >
              Play on this board
            </button>
            <button
              type="button"
              onclick={startEdit}
              aria-label="Rename board"
              class="size-[52px] shrink-0 flex items-center justify-center rounded-[12px] border border-line-3 bg-surface-panel
                     text-text cursor-pointer transition-colors hover:bg-surface-active"
            >
              <Pencil size={16} />
            </button>
          </div>
        </div>

        {#if !selected.online}
          <p class="m-0 px-[14px] py-3 rounded-[12px] bg-surface-inset text-[14px] leading-[1.45] text-ink-2">
            Bridge not reachable. Check that it is running on the computer next to the Board Manager. Settings below are saved and apply as
            soon as it is back.
          </p>
        {/if}

        <dl class="m-0 grid grid-cols-1 sm:grid-cols-3 gap-px bg-line border border-line rounded-[12px] overflow-hidden">
          {@render cell('Board Manager', bmCell)}
          {@render cell('Bridge', bridgeCell)}
          {@render cell('Games here', gamesCell)}
        </dl>

        {#if updateView.kind !== 'none'}
          <div class="flex flex-col gap-2 text-[14px]">
            {#if updateView.kind === 'busy'}
              <span class="flex items-center gap-2 text-text-muted" role="status">
                <LoaderCircle size={14} class="animate-spin" />
                {updateView.text}
              </span>
            {:else if updateView.kind === 'done'}
              <span class="text-accent" role="status">{updateView.text}</span>
            {:else if updateView.kind === 'failed'}
              <span class="text-[13px] text-live-text" role="alert">{updateView.text}</span>
            {:else}
              <div class="flex flex-wrap justify-between items-center gap-3">
                <span class="text-text-muted">Bridge {updateView.version} is available</span>
                {#if updateView.canUpdate}
                  <button
                    type="button"
                    onclick={updateBridge}
                    disabled={busy !== null}
                    class="shrink-0 flex items-center gap-[6px] h-11 px-4 rounded-[10px] text-[14px] font-semibold border border-line-3
                           bg-transparent text-text cursor-pointer font-[inherit] transition-colors hover:bg-surface-active
                           disabled:opacity-35 disabled:cursor-not-allowed"
                  >
                    {#if busy === 'bridge-update'}<LoaderCircle size={14} class="animate-spin" />{:else}<Download size={14} />{/if}
                    Update bridge
                  </button>
                {/if}
              </div>
              {#if !selected.bridgeUpdate.updatable}
                <span class="text-[13px] text-text-dim">Run the bridge's install command again on the board's computer to update it.</span>
              {/if}
              {#if updateView.error ?? updateRequestError}
                <span class="text-[13px] text-live-text" role="alert">{updateView.error ?? updateRequestError}</span>
              {/if}
            {/if}
          </div>
        {/if}

        {#if selected.online}
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-[10px]">
            {@render control('start', 'Start', isRunning, startIcon)}
            {@render control('stop', 'Stop', !isRunning, stopIcon)}
            {@render control('reset', 'Reset', false, resetIcon)}
            {@render control('calibrate', 'Calibrate', false, calibrateIcon)}
          </div>
        {/if}
      </section>

      <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-5 items-start">
        <div class="flex flex-col gap-5 min-w-0">
          <SectionCard title="Cameras" icon={Camera}>
            {#snippet aside()}
              {#if selected.online}<span class="text-[14px] text-text-muted">{camsSending} / 3 sending</span>{/if}
            {/snippet}
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {#each [0, 1, 2] as camIndex (camIndex)}
                <figure
                  class="m-0 relative aspect-[4/3] sm:aspect-auto sm:h-[150px] rounded-[12px] overflow-hidden border border-line bg-surface-inset"
                >
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
                  <figcaption
                    class="absolute left-[10px] bottom-[10px] flex items-center gap-[7px] px-[9px] py-1 rounded-[6px]
                           font-mono text-[11px] text-ink-2 {camOk[camIndex] ? 'bg-bg/75' : ''}"
                  >
                    CAM {camIndex + 1}
                    <span class="size-[7px] rounded-full {camOk[camIndex] ? 'bg-accent' : 'bg-line-strong'}"></span>
                  </figcaption>
                </figure>
              {/each}
            </div>
            {#if !selected.online}<p class="m-0 text-[14px] text-text-muted">No images while the board is offline.</p>{/if}
          </SectionCard>

          <SectionCard title="Live events" icon={Activity}>
            {#snippet aside()}
              {#if listening}
                <span class="flex items-center gap-2 text-[14px] text-accent"
                  ><span class="size-2 rounded-full bg-accent"></span>Listening</span
                >
              {:else}
                <span class="flex items-center gap-2 text-[14px] {dotText}">
                  {@render statusDot()}
                  {bmLabel}
                </span>
              {/if}
            {/snippet}
            <div
              bind:this={eventsEl}
              role="log"
              aria-live="polite"
              class="h-[236px] overflow-y-auto scrollbar-themed box-border px-4 py-[14px] rounded-[12px]
                     border border-line bg-bg-deep font-mono text-[13px] leading-[1.8]"
            >
              {#each events as ev, i (i)}
                {@const seg = ev.data.dart?.segment}
                <div class="flex gap-4 whitespace-nowrap">
                  <span class="text-line-strong">{fmtTime(ev.at)}</span>
                  <span class="flex-1">
                    {EVENT_VERB[ev.kind] ?? ev.kind}
                    {#if seg}<span class={seg.multiplier > 1 ? 'text-accent' : ''}>{seg.name}</span>{/if}
                  </span>
                  <span class="text-text-muted">{seg ? (ev.data.dart?.score ?? '') : ''}</span>
                </div>
              {:else}
                <span class="text-text-dim">
                  {selected.online ? 'Waiting for throws…' : 'Board offline. Throws show up here as soon as the bridge connects.'}
                </span>
              {/each}
            </div>
          </SectionCard>

          {#if $lightsOn}
            {@const n = lightsCounts[selected.id]}
            <SectionCard title="Lights" icon={Lightbulb}>
              {#snippet aside()}
                {#if n}
                  <a
                    href="#/settings/lights?board={selected.id}"
                    class="inline-flex items-center gap-1 text-[14px] font-semibold no-underline">Manage</a
                  >
                {/if}
              {/snippet}
              {#if n === undefined}
                <p class="m-0 text-[14px] text-text-muted">—</p>
              {:else if n === 0}
                <p class="m-0 text-[14px] leading-[1.45] text-text-muted">
                  Light up the board with WLED: colours per player, a flash on 180s, a glow on checkouts.
                </p>
                <a
                  href="#/settings/lights?board={selected.id}"
                  class="self-start h-11 px-4 inline-flex items-center rounded-[10px] border border-line-3 text-text text-[14px]
                         font-semibold no-underline transition-colors hover:bg-surface-active">Add WLED lights</a
                >
              {:else}
                <p class="m-0 text-[15px]">{n} WLED device{n === 1 ? '' : 's'}</p>
              {/if}
            </SectionCard>
          {/if}
        </div>

        <div class="flex flex-col gap-5 min-w-0">
          <AutoStartSwitch board={selected} onchanged={refetchBoards} />
          {#if $bigScreenOn}
            <BigScreenSetup board={selected} blocked={busy !== null} onchanged={refetchBoards} />
          {/if}
          <SectionCard title="Pairing" icon={Link2}>
            <div class="flex flex-wrap items-center gap-4">
              <div class="flex flex-col gap-1 flex-1 min-w-[200px]">
                <span class="text-[15px]">Paired {fmtDate(selected.createdAt)}</span>
                <span class="text-[13.5px] leading-[1.45] text-text-muted">
                  Unpairing stops this bridge from sending throws to your account. Pair again any time with a new code.
                </span>
              </div>
              <button
                type="button"
                onclick={() => {
                  confirmUnpair = true
                }}
                class="h-11 px-5 rounded-[10px] border border-danger-line bg-transparent text-danger-text text-[15px]
                       font-semibold cursor-pointer font-[inherit] transition-colors hover:bg-surface-active"
              >
                Unpair
              </button>
            </div>
            {#if unpairError}<ErrorText class="text-[13px]">{unpairError}</ErrorText>{/if}
          </SectionCard>
        </div>
      </div>
    {/if}
  {/if}

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
      initialCode={pairCode}
      onclose={() => {
        pairOpen = false
        pairCode = ''
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
</div>
