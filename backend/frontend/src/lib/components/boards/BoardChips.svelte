<script lang="ts">
  // "Your boards": one chip per board (its dot and state), the selected one outlined, and the dashed Pair board chip.
  import { Plus } from '@lucide/svelte'
  import type { Board } from '$lib/api'

  let {
    boards,
    selectedId,
    justPairedId,
    onselect,
    onpair,
  }: { boards: Board[]; selectedId: string | null; justPairedId: string | null; onselect: (id: string) => void; onpair: () => void } =
    $props()

  const chip =
    'h-12 px-4 inline-flex items-center gap-[10px] rounded-[12px] text-text text-[15px] font-semibold cursor-pointer font-[inherit] transition-colors'
</script>

<div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
  <span class="shrink-0 text-[12px] label-caps text-text-dim">Your boards</span>
  <div role="group" aria-label="Your boards" class="flex flex-wrap items-center gap-[10px]">
    {#each boards as board (board.id)}
      {@const active = board.id === selectedId}
      <button
        type="button"
        onclick={() => onselect(board.id)}
        aria-pressed={active}
        class="{chip} {active
          ? 'border-[1.5px] border-accent bg-card-active'
          : 'border border-line bg-surface-panel hover:bg-surface-active'}"
      >
        {#if board.online}
          <span class="size-2 shrink-0 rounded-full bg-accent"></span>
        {:else}
          <span class="size-2 shrink-0 rounded-full border-[1.5px] border-line-strong box-border"></span>
        {/if}
        <span class="truncate max-w-[40vw] sm:max-w-[240px]">{board.name}</span>
        <span class="text-[13px] font-medium {board.id === justPairedId ? 'text-accent' : 'text-text-dim'}">
          {board.id === justPairedId && !board.online ? 'Just paired' : board.online ? 'Online' : 'Offline'}
        </span>
      </button>
    {/each}
    <button
      type="button"
      onclick={onpair}
      class="{chip} gap-2 border-[1.5px] border-dashed border-line-dashed bg-transparent hover:bg-surface-active"
    >
      <Plus size={16} strokeWidth={2.4} />Pair board
    </button>
  </div>
</div>
