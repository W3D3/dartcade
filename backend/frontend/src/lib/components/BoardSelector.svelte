<script lang="ts">
  import { ChevronDown, SquarePen } from '@lucide/svelte'
  import type { Board } from '$lib/api'

  let { boards, value = $bindable('') }: { boards: Board[]; value: string } = $props()

  let open = $state(false)
  const selected = $derived(boards.find(b => b.id === value))
  const isManual = $derived(value === '')

  function pick(id: string) { value = id; open = false }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false
  }
</script>

<svelte:window onkeydown={onkeydown} />

<div class="relative">
  <button type="button" onclick={() => open = !open} aria-label="Change board"
    class="h-12 px-4 flex items-center gap-[10px] bg-surface-2 border border-line-3 rounded-[10px]
           text-text text-[15px] font-[inherit] cursor-pointer">
    {#if isManual}
      <SquarePen size={14} />
      <span class="font-semibold">Manual only</span>
    {:else if selected}
      <span class="w-2 h-2 rounded-full shrink-0 {selected.online ? 'bg-accent' : 'bg-text-dim'}"></span>
      <span class="text-text-muted">Board</span>
      <span class="font-semibold">{selected.name}</span>
    {:else}
      <span class="text-text-muted">No boards — add one in Boards</span>
    {/if}
    <ChevronDown size={16} />
  </button>

  {#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="absolute right-0 top-full mt-1 min-w-[220px] bg-surface-2 border border-line-3
                rounded-[10px] overflow-hidden z-50 [box-shadow:0_8px_24px_rgba(0,0,0,0.5)]"
      onmouseleave={() => {}}>
      {#each boards as b (b.id)}
        <button type="button" onclick={() => pick(b.id)}
          class="w-full flex items-center gap-3 h-11 px-4 text-left text-[15px] border-0
                 bg-transparent cursor-pointer transition-colors
                 {b.id === value ? 'text-text font-semibold bg-surface-active' : 'text-[#c9c9bf] hover:bg-surface-active'}">
          <span class="w-2 h-2 rounded-full shrink-0 {b.online ? 'bg-accent' : 'bg-text-dim'}"></span>
          {b.name}
        </button>
      {/each}
      {#if boards.length > 0}
        <div class="border-t border-line-2 my-1"></div>
      {/if}
      <button type="button" onclick={() => pick('')}
        class="w-full flex items-center gap-3 h-11 px-4 text-left text-[15px] border-0
               bg-transparent cursor-pointer transition-colors
               {isManual ? 'text-text font-semibold bg-surface-active' : 'text-[#c9c9bf] hover:bg-surface-active'}">
        <SquarePen size={13} />
        Manual only
      </button>
    </div>
  {/if}
</div>
