<script lang="ts">
  import { LoaderCircle, Play, RotateCcw, SlidersHorizontal, Square, Sun } from '@lucide/svelte'
  import { onMount } from 'svelte'
  import { api, runBoardAction, type Board, type BoardAction } from '$lib/api'
  import type { Snapshot } from '$lib/api'

  let { sessionId, bmStatus }: { sessionId: string; bmStatus: Snapshot['bmStatus'] } = $props()

  let open = $state(false)
  let board = $state<Board | null>(null)
  let busy = $state<string | null>(null)

  async function loadBoard() {
    if (!sessionId) return
    try {
      const [sr, br] = await Promise.all([
        api.GET('/api/sessions/{id}', { params: { path: { id: sessionId } } }),
        api.GET('/api/boards'),
      ])
      board = br.data?.boards.find(b => b.id === sr.data?.boardId) ?? null
    } catch { /* ignore */ }
  }

  // Board Manager commands for this session's board
  async function runAction(name: string, action: BoardAction) {
    if (!board) return
    busy = name
    try { await runBoardAction(board.id, action) }
    catch { /* ignore */ }
    finally { busy = null }
  }

  onMount(loadBoard)

  function onkeydown(e: KeyboardEvent) { if (e.key === 'Escape') open = false }

  // ── BM state colour classification ─────────────────────────────────────────
  type DotColor = 'green' | 'yellow' | 'purple' | 'red' | 'gray'

  const SPINNING = new Set(['Starting', 'Stopping', 'Calibrating'])
  const isSpinning = $derived(board?.online && SPINNING.has(bmStatus?.status ?? ''))

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
    green:  'bg-[#84cc16]',
    yellow: 'bg-[#facc15]',
    purple: 'bg-[#a78bfa]',
    red:    'bg-[#f87171]',
    gray:   'bg-[#4a4e45]',
  }
  const DOT_TEXT: Record<DotColor, string> = {
    green:  'text-[#84cc16]',
    yellow: 'text-[#facc15]',
    purple: 'text-[#a78bfa]',
    red:    'text-[#f87171]',
    gray:   'text-[#4a4e45]',
  }

  const dotColor  = $derived(bmDotColor(bmStatus?.status ?? null, board?.online ?? false))
  const dotBg     = $derived(DOT_BG[dotColor])
  const dotText   = $derived(DOT_TEXT[dotColor])
  const isRunning = $derived(bmStatus?.running === true)
  const bmLabel   = $derived(bmStatus?.status ?? (board?.online ? '—' : 'Offline'))
</script>

<svelte:window {onkeydown} />

<div class="relative">
  <!-- Trigger -->
  <button type="button" onclick={() => open = !open}
    class="flex items-center gap-[8px] h-9 px-3 rounded-[8px] text-[13px] font-[inherit] cursor-pointer
           transition-colors border
           {open
             ? 'bg-surface-active border-accent/50 text-text'
             : 'bg-transparent border-line-2 text-text-muted hover:border-line-3 hover:text-text'}">
    {#if isSpinning}
      <LoaderCircle size={10} strokeWidth={3} class="shrink-0 animate-spin {dotText}" />
    {:else}
      <span class="w-[7px] h-[7px] rounded-full shrink-0 {dotBg}"></span>
    {/if}
    <span class="font-medium">{board?.name ?? 'Board'}</span>
    <SlidersHorizontal size={13} class="opacity-50" />
  </button>

  {#if open}
    <div class="fixed inset-0 z-40" onclick={() => open = false} aria-hidden="true"></div>

    <div class="absolute right-0 top-full mt-2 w-[260px] z-50 rounded-[14px] border border-line-3
                bg-[#191c17] [box-shadow:0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden">

      <!-- Header -->
      <div class="px-4 py-3 border-b border-line-2 flex items-center justify-between gap-3">
        <div class="flex items-center gap-[10px] min-w-0">
          {#if isSpinning}
            <LoaderCircle size={11} strokeWidth={3} class="shrink-0 animate-spin {dotText}" />
          {:else}
            <span class="w-[8px] h-[8px] rounded-full shrink-0 {dotBg}"></span>
          {/if}
          <span class="font-semibold text-[14px] text-text truncate">{board?.name ?? 'Unknown board'}</span>
        </div>
        <span class="text-[11px] font-medium tracking-[0.05em] uppercase shrink-0 {dotText}">
          {bmLabel}
        </span>
      </div>

      <!-- Controls -->
      <div class="p-3 flex flex-col gap-2">
        <!-- Start + Stop -->
        <div class="grid grid-cols-2 gap-2">
          <button type="button"
            onclick={() => runAction('start', 'start')}
            disabled={busy !== null || !board?.online || isRunning}
            class="flex items-center justify-center gap-[6px] h-9 rounded-[8px] text-[13px] font-medium
                   border border-line-3 bg-transparent cursor-pointer font-[inherit] transition-colors
                   text-text hover:bg-surface-active disabled:opacity-35 disabled:cursor-not-allowed">
            {#if busy === 'start'}
              <LoaderCircle size={13} class="animate-spin" />
            {:else}
              <Play size={13} fill="currentColor" />
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
              <LoaderCircle size={13} class="animate-spin" />
            {:else}
              <Square size={13} fill="currentColor" />
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
            <LoaderCircle size={13} class="animate-spin" />
          {:else}
            <RotateCcw size={13} />
          {/if}
          Reset
        </button>

        <!-- Calibrate -->
        <button type="button"
          onclick={() => runAction('calibrate', 'calibrate')}
          disabled={busy !== null || !board?.online}
          class="flex items-center justify-center gap-[6px] w-full h-9 rounded-[8px] text-[13px] font-medium
                 border border-line-3 bg-transparent cursor-pointer font-[inherit] transition-colors
                 text-text hover:bg-surface-active disabled:opacity-35 disabled:cursor-not-allowed">
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
