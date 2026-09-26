<script lang="ts">
  import { onMount } from 'svelte'

  let { sessionId }: { sessionId: string } = $props()

  type Board = { id: string; name: string; online: boolean }

  let open = $state(false)
  let board = $state<Board | null>(null)
  let busy = $state<string | null>(null)
  let actionMsg = $state('')

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

  async function runAction(name: string, endpoint: string) {
    busy = name
    actionMsg = ''
    try {
      const res = await fetch(`/api/board/${endpoint}`, { method: 'POST' })
      actionMsg = res.ok ? `${name} sent` : 'Command failed'
      await loadBoard()
    } catch {
      actionMsg = 'Connection error'
    } finally {
      busy = null
    }
  }

  onMount(loadBoard)

  function onkeydown(e: KeyboardEvent) { if (e.key === 'Escape') open = false }
</script>

<svelte:window onkeydown={onkeydown} />

<div class="relative">
  <!-- Indicator button -->
  <button type="button" onclick={() => open = !open}
    class="flex items-center gap-[10px] h-11 px-4 bg-surface-2 border border-line-3 rounded-[10px]
           text-[14px] font-[inherit] cursor-pointer transition-colors
           {open ? 'border-accent/50' : ''}">
    {#if board}
      <span class="w-2 h-2 rounded-full shrink-0 {board.online ? 'bg-accent' : 'bg-text-dim'}"></span>
      <span class="text-text-muted">Board</span>
      <span class="font-semibold text-text">{board.name}</span>
    {:else}
      <span class="w-2 h-2 rounded-full bg-text-dim shrink-0"></span>
      <span class="text-text-muted">Board</span>
    {/if}
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
      class="transition-transform {open ? 'rotate-180' : ''}">
      <path d="M6 9l6 6 6-6"/>
    </svg>
  </button>

  {#if open}
    <!-- Click-outside backdrop -->
    <div class="fixed inset-0 z-40" onclick={() => open = false} aria-hidden="true"></div>

    <!-- Floating panel -->
    <div class="absolute right-0 top-full mt-2 w-[280px] z-50 rounded-[14px] border border-line-3
                bg-[#191c17] [box-shadow:0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden">

      <!-- Board info header -->
      <div class="px-5 py-4 border-b border-line-2 flex items-center gap-3">
        <span class="w-[10px] h-[10px] rounded-full shrink-0 {board?.online ? 'bg-accent' : 'bg-text-dim'}"></span>
        <div class="flex flex-col min-w-0">
          <span class="font-semibold text-[15px] text-text truncate">{board?.name ?? 'Unknown board'}</span>
          <span class="text-[12px] {board?.online ? 'text-accent' : 'text-text-dim'}">
            {board?.online ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      <!-- Actions -->
      <div class="p-3 flex flex-col gap-1">
        <button type="button" onclick={() => runAction('Start', 'start')}
          disabled={busy !== null || !board?.online}
          class="flex items-center gap-3 w-full h-10 px-3 rounded-[8px] text-[14px] text-left
                 bg-transparent border-0 cursor-pointer transition-colors font-[inherit]
                 text-text hover:bg-surface-active disabled:opacity-40 disabled:cursor-not-allowed">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          {busy === 'Start' ? 'Starting…' : 'Start detection'}
        </button>

        <button type="button" onclick={() => runAction('Stop', 'stop')}
          disabled={busy !== null || !board?.online}
          class="flex items-center gap-3 w-full h-10 px-3 rounded-[8px] text-[14px] text-left
                 bg-transparent border-0 cursor-pointer transition-colors font-[inherit]
                 text-text hover:bg-surface-active disabled:opacity-40 disabled:cursor-not-allowed">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
          </svg>
          {busy === 'Stop' ? 'Stopping…' : 'Stop detection'}
        </button>

        <button type="button" onclick={() => runAction('Reset', 'reset')}
          disabled={busy !== null || !board?.online}
          class="flex items-center gap-3 w-full h-10 px-3 rounded-[8px] text-[14px] text-left
                 bg-transparent border-0 cursor-pointer transition-colors font-[inherit]
                 text-text hover:bg-surface-active disabled:opacity-40 disabled:cursor-not-allowed">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
          {busy === 'Reset' ? 'Resetting…' : 'Reset visit'}
        </button>

        <div class="flex items-center gap-3 w-full h-10 px-3 rounded-[8px] text-[14px]
                    text-text-dim opacity-40 cursor-not-allowed select-none">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
          Calibrate
          <span class="ml-auto text-[11px] border border-current rounded-[4px] px-[5px] py-[2px]
                       tracking-[0.05em] uppercase">Soon</span>
        </div>
      </div>

      {#if actionMsg}
        <div class="px-5 pb-3 text-[12px] text-text-muted">{actionMsg}</div>
      {/if}
    </div>
  {/if}
</div>
