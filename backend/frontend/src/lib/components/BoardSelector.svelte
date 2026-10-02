<script lang="ts">
  import { ChevronDown, SquarePen } from '@lucide/svelte'
  import type { Board } from '$lib/api'

  let { boards, value = $bindable(''), compact = false }: {
    boards: Board[]
    value: string
    /** A small chip for the phone header: status dot and board name only. */
    compact?: boolean
  } = $props()

  let open = $state(false)
  const selected = $derived(boards.find(b => b.id === value))
  const isManual = $derived(value === '')

  function pick(id: string) { value = id; open = false }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false
  }
</script>

<svelte:window onkeydown={onkeydown} />

<div class="relative {compact ? 'min-w-0' : ''}">
  <button type="button" onclick={() => open = !open} aria-label="Change board"
    class="{compact ? 'h-11 px-3 gap-2 text-[14px] min-w-0 w-full max-w-[150px]' : 'h-12 px-4 gap-[10px] text-[15px]'} flex items-center bg-surface-2 border border-line-3 rounded-[10px]
           text-text font-[inherit] cursor-pointer">
    {#if isManual}
      <SquarePen size={14} class="shrink-0" />
      <span class="font-semibold truncate">{compact ? 'Manual' : 'Manual only'}</span>
    {:else if selected}
      <span class="w-2 h-2 rounded-full shrink-0 {selected.online ? 'bg-accent' : 'bg-text-dim'}"></span>
      {#if !compact}<span class="text-text-muted">Board</span>{/if}
      <span class="font-semibold truncate">{selected.name}</span>
    {:else}
      <span class="text-text-muted truncate">{compact ? 'No board' : 'No boards — add one in Boards'}</span>
    {/if}
    <ChevronDown size={16} class="shrink-0" />
  </button>

  {#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="absolute right-0 top-full mt-1 min-w-[220px] max-w-[calc(100vw-32px)] bg-surface-2 border border-line-3
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
