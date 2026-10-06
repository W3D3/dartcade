<script lang="ts">
  import { LoaderCircle, Play, RotateCcw, SlidersHorizontal, Square, Sun } from '@lucide/svelte'
  import { api, runBoardAction, type Board, type BoardAction, type BoardStatus } from '$lib/api'
  import { DOT_BG, DOT_TEXT, SPINNING, bmDotColor } from '$lib/boardStatus'

  let {
    board,
    compact = false,
  }: {
    board: Board
    /** The phone header: a 44 px button with only the status dot. */
    compact?: boolean
  } = $props()

  let open = $state(false)
  let busy = $state<string | null>(null)
  let bmStatus = $state<BoardStatus | null>(null)

  // Polls this board's live Board Manager status while it's online; stops (and clears the
  // status) the moment it isn't, or when a different board is passed in.
  $effect(() => {
    if (!board.online) {
      bmStatus = null
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const { data } = await api.GET('/api/boards/{id}/status', { params: { path: { id: board.id } } })
        if (!cancelled) bmStatus = data ?? null
      } catch {
        if (!cancelled) bmStatus = null
      }
    }
    void load()
    const interval = setInterval(() => void load(), 3000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  })

  // Board Manager commands for this board
  async function runAction(name: string, action: BoardAction) {
    busy = name
    try {
      await runBoardAction(board.id, action)
    } catch {
      /* ignore */
    } finally {
      busy = null
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false
  }

  const isSpinning = $derived(board.online && SPINNING.has(bmStatus?.status ?? ''))

  const dotColor = $derived(bmDotColor(bmStatus?.status ?? null, board.online))
  const dotBg = $derived(DOT_BG[dotColor])
  const dotText = $derived(DOT_TEXT[dotColor])
  const isRunning = $derived(bmStatus?.running === true)
  const bmLabel = $derived(bmStatus?.status ?? (board.online ? '—' : 'Offline'))
</script>

<svelte:window {onkeydown} />

<div class="relative">
  <!-- Trigger -->
  <button
    type="button"
    onclick={() => (open = !open)}
    aria-label={compact ? `Board ${board.name}: status and controls` : undefined}
    class="flex items-center gap-[8px] {compact
      ? 'w-11 h-11 justify-center rounded-[10px]'
      : 'h-9 px-3 rounded-[8px]'} text-[13px] font-[inherit] cursor-pointer
           transition-colors border
           {open
      ? 'bg-surface-active border-accent/50 text-text'
      : 'bg-transparent border-line-2 text-text-muted hover:border-line-3 hover:text-text'}"
  >
    {#if isSpinning}
      <LoaderCircle size={10} strokeWidth={3} class="shrink-0 animate-spin {dotText}" />
    {:else}
      <span class="w-[7px] h-[7px] rounded-full shrink-0 {dotBg}"></span>
    {/if}
    {#if !compact}
      <span class="font-medium">{board.name}</span>
      <SlidersHorizontal size={13} class="opacity-50" />
    {/if}
  </button>

  {#if open}
    <div class="fixed inset-0 z-40" onclick={() => (open = false)} aria-hidden="true"></div>

    <div
      class="absolute right-0 top-full mt-2 w-[min(260px,calc(100vw-32px))] z-50 rounded-[14px] border border-line-3
                bg-[#191c17] [box-shadow:0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden"
    >
      <!-- Header -->
      <div class="px-4 py-3 border-b border-line-2 flex items-center justify-between gap-3">
        <div class="flex items-center gap-[10px] min-w-0">
          {#if isSpinning}
            <LoaderCircle size={11} strokeWidth={3} class="shrink-0 animate-spin {dotText}" />
          {:else}
            <span class="w-[8px] h-[8px] rounded-full shrink-0 {dotBg}"></span>
          {/if}
          <span class="font-semibold text-[14px] text-text truncate">{board.name}</span>
        </div>
        <span class="text-[11px] font-medium tracking-[0.05em] uppercase shrink-0 {dotText}">
          {bmLabel}
        </span>
      </div>

      <!-- Controls -->
      <div class="p-3 flex flex-col gap-2">
        <!-- Start + Stop -->
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            onclick={() => runAction('start', 'start')}
            disabled={busy !== null || !board.online || isRunning}
            class="flex items-center justify-center gap-[6px] h-9 rounded-[8px] text-[13px] font-medium
                   border border-line-3 bg-transparent cursor-pointer font-[inherit] transition-colors
                   text-text hover:bg-surface-active disabled:opacity-35 disabled:cursor-not-allowed"
          >
            {#if busy === 'start'}
              <LoaderCircle size={13} class="animate-spin" />
            {:else}
              <Play size={13} fill="currentColor" />
            {/if}
            Start
          </button>

          <button
            type="button"
            onclick={() => runAction('stop', 'stop')}
            disabled={busy !== null || !board.online || !isRunning}
            class="flex items-center justify-center gap-[6px] h-9 rounded-[8px] text-[13px] font-medium
                   border border-line-3 bg-transparent cursor-pointer font-[inherit] transition-colors
                   text-text hover:bg-surface-active disabled:opacity-35 disabled:cursor-not-allowed"
          >
            {#if busy === 'stop'}
              <LoaderCircle size={13} class="animate-spin" />
            {:else}
              <Square size={13} fill="currentColor" />
            {/if}
            Stop
          </button>
        </div>

        <!-- Reset -->
        <button
          type="button"
          onclick={() => runAction('reset', 'reset')}
          disabled={busy !== null || !board.online}
          class="flex items-center justify-center gap-[6px] w-full h-9 rounded-[8px] text-[13px] font-medium
                 border border-line-3 bg-transparent cursor-pointer font-[inherit] transition-colors
                 text-text hover:bg-surface-active disabled:opacity-35 disabled:cursor-not-allowed"
        >
          {#if busy === 'reset'}
            <LoaderCircle size={13} class="animate-spin" />
          {:else}
            <RotateCcw size={13} />
          {/if}
          Reset
        </button>

        <!-- Calibrate -->
        <button
          type="button"
          onclick={() => runAction('calibrate', 'calibrate')}
          disabled={busy !== null || !board.online}
          class="flex items-center justify-center gap-[6px] w-full h-9 rounded-[8px] text-[13px] font-medium
                 border border-line-3 bg-transparent cursor-pointer font-[inherit] transition-colors
                 text-text hover:bg-surface-active disabled:opacity-35 disabled:cursor-not-allowed"
        >
          {#if busy === 'calibrate'}
            <LoaderCircle size={13} class="animate-spin" />
          {:else}
            <Sun size={13} />
          {/if}
          Calibrate
        </button>
      </div>
    </div>
  {/if}
</div>
