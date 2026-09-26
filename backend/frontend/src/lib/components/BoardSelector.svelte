<script lang="ts">
  type Board = { id: string; name: string; online: boolean }

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
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
      <span class="font-semibold">Manual only</span>
    {:else if selected}
      <span class="w-2 h-2 rounded-full shrink-0 {selected.online ? 'bg-accent' : 'bg-text-dim'}"></span>
      <span class="text-text-muted">Board</span>
      <span class="font-semibold">{selected.name}</span>
    {:else}
      <span class="text-text-muted">No boards — add one in Boards</span>
    {/if}
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6"/>
    </svg>
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
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Manual only
      </button>
    </div>
  {/if}
</div>
