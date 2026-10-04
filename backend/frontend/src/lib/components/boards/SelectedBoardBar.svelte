<script lang="ts">
  // Tablets: the selected board below the grid, in place of the desktop's detail panel. Its
  // cameras, controls and live events open under it (`details`).
  import { ChevronDown } from '@lucide/svelte'
  import type { Snippet } from 'svelte'
  import type { Board } from '$lib/api'
  import { selectedLine } from '$lib/boards'

  let { board, name, actions, details }: {
    board: Board
    /** The name, renamable. */
    name: Snippet
    /** Play on this board, Unpair. */
    actions: Snippet
    details: Snippet
  } = $props()

  let open = $state(false)
</script>

<section aria-label="Selected board" class="shrink-0 rounded-[14px] bg-surface-panel border border-line-2">
  <div class="flex flex-wrap items-center gap-x-4 gap-y-3 px-[18px] py-[14px]">
    <span class="text-[12px] uppercase tracking-[0.1em] text-text-dim">Selected</span>
    <div class="flex flex-col gap-[2px] min-w-0">
      {@render name()}
      <span class="text-[14px] text-text-muted truncate">{selectedLine(board)}</span>
    </div>
    <div class="ml-auto flex items-center gap-3">
      <button type="button" onclick={() => open = !open} aria-expanded={open} aria-controls="board-details"
        class="h-[46px] px-3 inline-flex items-center gap-[6px] rounded-[10px] border border-line-3 bg-transparent text-text text-[15px] font-medium cursor-pointer font-[inherit]">
        Cameras &amp; events
        <ChevronDown size={16} class="transition-transform {open ? 'rotate-180' : ''}" />
      </button>
      {@render actions()}
    </div>
  </div>
  {#if open}
    <div id="board-details" class="border-t border-line-2 p-[18px] flex flex-col gap-5">{@render details()}</div>
  {/if}
</section>
