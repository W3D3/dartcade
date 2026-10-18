<script lang="ts">
  // Settings' Lights: pick which of your boards to manage lights for. Each button shows its
  // device count, or "offline" when the board itself can't be reached.
  import type { Board } from '$lib/api'

  let {
    boards,
    selectedId,
    deviceCounts,
    onselect,
  }: {
    boards: Board[]
    selectedId: string | null
    deviceCounts: Record<string, number>
    onselect: (id: string) => void
  } = $props()
</script>

<div class="flex items-center gap-4 flex-wrap">
  <span class="text-[13px] text-text-muted">Board</span>
  <div role="group" aria-label="Board" class="flex gap-2 flex-wrap">
    {#each boards as board (board.id)}
      {@const on = board.id === selectedId}
      <button
        type="button"
        aria-pressed={on}
        onclick={() => onselect(board.id)}
        class="h-11 px-[14px] inline-flex items-center gap-2 rounded-[11px] text-[14px] font-semibold cursor-pointer
               font-[inherit] transition-colors
               {on
          ? 'border-2 border-accent bg-surface-active text-text'
          : 'border border-line-3 bg-transparent text-text hover:bg-surface-active'}"
      >
        <span
          title={board.online ? 'Reachable' : 'Not answering'}
          class="w-2 h-2 rounded-full shrink-0 {board.online ? 'bg-accent' : 'bg-live'}"
        ></span>
        {board.name}
        <span class="text-[12px] font-medium text-text-dim">
          {board.online ? `${deviceCounts[board.id] ?? 0} device${(deviceCounts[board.id] ?? 0) === 1 ? '' : 's'}` : 'offline'}
        </span>
      </button>
    {/each}
  </div>
</div>
