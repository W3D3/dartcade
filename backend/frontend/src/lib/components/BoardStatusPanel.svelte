<script lang="ts">
  import { hrefs } from '$lib/routes'
  import { LoaderCircle, Play, RotateCcw, SlidersHorizontal, Square, Sun } from '@lucide/svelte'
  import { fetchBoardStatus, runBoardAction, type Board, type BoardAction, type BoardStatus } from '$lib/api'
  import BoardStatusDot from './BoardStatusDot.svelte'
  import { DOT_TEXT, bmDotColor, bmStatusLabel, shownStatus } from '$lib/boardStatus'
  import { createToast } from '$lib/toast'
  import { Toast } from '$lib/components/ui/toast/index.js'
  import { onDestroy } from 'svelte'
  import BigScreenButton from '$lib/components/BigScreenButton.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { flag } from '$lib/flags'

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
  let polled = $state<BoardStatus | null>(null)
  const bmStatus = $derived(shownStatus(polled, board.bmReachable))

  // Primitives, so a new board object with the same id and status (every snapshot) doesn't restart polling
  const boardId = $derived(board.id)
  const online = $derived(board.online)

  // Polls this board's live Board Manager status while it's online; stops (and clears the
  // status) the moment it isn't, or when a different board is passed in.
  $effect(() => {
    if (!online) {
      polled = null
      return
    }
    const id = boardId
    let cancelled = false
    const load = async () => {
      const status = await fetchBoardStatus(id)
      if (!cancelled) polled = status
    }
    void load()
    const interval = setInterval(() => void load(), 3000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  })

  // Board Manager commands for this board
  const commandFailure = createToast<string>(6000)
  onDestroy(commandFailure.dismiss)
  async function runAction(name: string, action: BoardAction) {
    busy = name
    const failed = await runBoardAction(board.id, action)
    if (failed) commandFailure.show(failed)
    busy = null
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false
  }

  const bigScreenOn = flag('bigscreen.enabled')

  const dotColor = $derived(bmDotColor(bmStatus?.status ?? null, board.online))
  const dotText = $derived(DOT_TEXT[dotColor])
  const isRunning = $derived(bmStatus?.running === true)
  const bmLabel = $derived(bmStatusLabel(bmStatus?.status ?? null, board.online))
</script>

<svelte:window {onkeydown} />

<div class="relative">
  <!-- Trigger -->
  <Button
    variant="outline"
    size={compact ? 'icon' : 'md'}
    onclick={() => (open = !open)}
    aria-label={compact ? `Board ${board.name}: status and controls` : undefined}
    pressed={open}
    class={compact ? '' : 'px-3 text-ink-2'}
  >
    <BoardStatusDot status={bmStatus?.status ?? null} online={board.online} />
    {#if !compact}
      <span>{board.name}</span>
      <SlidersHorizontal size={13} class="opacity-50" />
    {/if}
  </Button>

  {#if open}
    <div class="fixed inset-0 z-40" onclick={() => (open = false)} aria-hidden="true"></div>

    <div
      class="absolute right-0 top-full mt-2 w-[min(260px,calc(100vw-32px))] z-50 rounded-card border border-line-3
                bg-[#191c17] [box-shadow:0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden"
    >
      <!-- Header -->
      <div class="px-4 py-3 border-b border-line-2 flex items-center justify-between gap-3">
        <div class="flex items-center gap-[10px] min-w-0">
          <BoardStatusDot status={bmStatus?.status ?? null} online={board.online} />
          <span class="font-semibold text-[14px] text-text truncate">{board.name}</span>
        </div>
        <span class="text-[11px] font-medium tracking-wider uppercase shrink-0 {dotText}">
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
            class="flex items-center justify-center gap-[6px] h-9 rounded-sm text-[13px] font-medium
 border border-line-3 cursor-pointer transition-colors
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
            class="flex items-center justify-center gap-[6px] h-9 rounded-sm text-[13px] font-medium
 border border-line-3 cursor-pointer transition-colors
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
          class="flex items-center justify-center gap-[6px] w-full h-9 rounded-sm text-[13px] font-medium
 border border-line-3 cursor-pointer transition-colors
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
          class="flex items-center justify-center gap-[6px] w-full h-9 rounded-sm text-[13px] font-medium
 border border-line-3 cursor-pointer transition-colors
 text-text hover:bg-surface-active disabled:opacity-35 disabled:cursor-not-allowed"
        >
          {#if busy === 'calibrate'}
            <LoaderCircle size={13} class="animate-spin" />
          {:else}
            <Sun size={13} />
          {/if}
          Calibrate
        </button>

        <BigScreenButton {board} blocked={busy !== null} />
        {#if $bigScreenOn}
          <a
            href={hrefs.bigScreen(board.id)}
            class="text-[13px] text-center text-text-muted! underline underline-offset-4 hover:text-text!"
          >
            Open big screen here
          </a>
        {/if}
      </div>
    </div>
  {/if}
</div>

{#if $commandFailure}
  <Toast tone="error" onclose={commandFailure.dismiss}>{$commandFailure.value}</Toast>
{/if}
