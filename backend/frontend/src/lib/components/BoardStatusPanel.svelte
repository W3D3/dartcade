<script lang="ts">
  import { onMount, onDestroy } from 'svelte'

  let { sessionId }: { sessionId: string } = $props()

  type Board = { id: string; name: string; online: boolean }
  type BmStatus = { status: string | null; running: boolean; event: string | null }

  let open = $state(false)
  let board = $state<Board | null>(null)
  let bmStatus = $state<BmStatus | null>(null)
  let busy = $state<string | null>(null)
  let pollTimer: ReturnType<typeof setInterval> | null = null

  async function loadBoard() {
    if (!sessionId) return
    try {
      const [sr, br] = await Promise.all([
        fetch(`/api/sessions/${sessionId}`),
        fetch('/api/boards'),
      ])
      if (!sr.ok || !br.ok) return
      const [sd, bd] = await Promise.all([sr.json(), br.json()])
      const boardId = sd.boardId
      board = (bd.boards ?? []).find((b: Board) => b.id === boardId) ?? null
    } catch { /* ignore */ }
  }

  async function loadBmStatus() {
    try {
      const res = await fetch('/api/board/status')
      if (res.ok) bmStatus = await res.json()
    } catch { /* ignore */ }
  }

  async function runAction(name: string, endpoint: string) {
    busy = name
    try {
      await fetch(`/api/board/${endpoint}`, { method: 'POST' })
      await loadBmStatus()
    } catch { /* ignore */ }
    finally { busy = null }
  }

  function startPoll() {
    if (pollTimer) return
    loadBmStatus()
    pollTimer = setInterval(loadBmStatus, 2000)
  }

  function stopPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  }

  $effect(() => {
    if (open) startPoll()
    else stopPoll()
  })

  onMount(loadBoard)
  onDestroy(stopPoll)

  function onkeydown(e: KeyboardEvent) { if (e.key === 'Escape') open = false }

  const isRunning = $derived(bmStatus?.running === true)
  const bmLabel  = $derived(bmStatus?.status ?? (board?.online ? 'Unknown' : 'Offline'))
  const labelColor = $derived(
    !board?.online             ? 'text-text-dim' :
    bmStatus?.status === 'Running' || bmStatus?.status === 'Throw' || bmStatus?.status === 'Takeout' || bmStatus?.status === 'Takeout in progress' ? 'text-accent' :
    bmStatus?.status === 'Error'   ? 'text-live-text' :
    'text-text-muted'
  )
</script>

<svelte:window {onkeydown} />

<div class="relative">
  <!-- Trigger: status dot + board name, no dropdown chrome -->
  <button type="button" onclick={() => open = !open}
    class="flex items-center gap-[8px] h-9 px-3 rounded-[8px] text-[13px] font-[inherit] cursor-pointer
           transition-colors border
           {open
             ? 'bg-surface-active border-accent/50 text-text'
             : 'bg-transparent border-line-2 text-text-muted hover:border-line-3 hover:text-text'}">
    <span class="w-[7px] h-[7px] rounded-full shrink-0
                 {board?.online ? 'bg-accent' : 'bg-text-dim'}"></span>
    <span class="font-medium">{board?.name ?? 'Board'}</span>
    <!-- small sliders icon to hint at controls, not a switcher -->
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" aria-hidden="true" class="opacity-50">
      <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/>
      <line x1="4" y1="18" x2="20" y2="18"/>
      <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none"/>
      <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/>
      <circle cx="9" cy="18" r="2" fill="currentColor" stroke="none"/>
    </svg>
  </button>

  {#if open}
    <div class="fixed inset-0 z-40" onclick={() => open = false} aria-hidden="true"></div>

    <div class="absolute right-0 top-full mt-2 w-[260px] z-50 rounded-[14px] border border-line-3
                bg-[#191c17] [box-shadow:0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden">

      <!-- Header -->
      <div class="px-4 py-3 border-b border-line-2 flex items-center justify-between gap-3">
        <div class="flex items-center gap-[10px] min-w-0">
          <span class="w-[8px] h-[8px] rounded-full shrink-0
                       {board?.online ? 'bg-accent' : 'bg-text-dim'}"></span>
          <span class="font-semibold text-[14px] text-text truncate">{board?.name ?? 'Unknown board'}</span>
        </div>
        {#if bmStatus || board?.online}
          <span class="text-[11px] font-medium tracking-[0.05em] uppercase shrink-0 {labelColor}">
            {bmLabel}
          </span>
        {/if}
      </div>

      <!-- Detection controls -->
      <div class="p-3 flex flex-col gap-2">
        <!-- Start + Stop on one row -->
        <div class="grid grid-cols-2 gap-2">
          <button type="button"
            onclick={() => runAction('start', 'start')}
            disabled={busy !== null || !board?.online || isRunning}
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
            onclick={() => runAction('stop', 'stop')}
            disabled={busy !== null || !board?.online || !isRunning}
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
          onclick={() => runAction('reset', 'reset')}
          disabled={busy !== null || !board?.online}
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

        <!-- Calibrate (coming soon) -->
        <div class="flex items-center justify-center gap-[6px] w-full h-9 rounded-[8px] text-[13px]
                    border border-line-2 text-text-dim opacity-35 cursor-not-allowed select-none">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
          Calibrate
          <span class="text-[10px] border border-current rounded-[3px] px-[5px] py-[2px]
                       tracking-[0.06em] uppercase ml-1">Soon</span>
        </div>
      </div>
    </div>
  {/if}
</div>
