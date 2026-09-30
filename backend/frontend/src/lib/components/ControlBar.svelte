<script lang="ts">
  // Undo, and the manual advance. On a board the takeout advances by itself, so
  // "Skip to next" stays quiet; without a board it is the way on, so it is an outline button.
  let { canUndo, manual, onUndo, onNext }: {
    canUndo: boolean
    manual: boolean
    onUndo: () => void
    onNext: () => void
  } = $props()
</script>

<div class="h-[52px] shrink-0 flex items-center gap-[10px]">
  <button type="button" onclick={onUndo} disabled={!canUndo}
    class="h-12 px-4 flex items-center gap-2 rounded-[10px] border border-line-strong bg-transparent text-text
           text-[15px] font-medium cursor-pointer disabled:opacity-40 disabled:cursor-default">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>
    Undo
  </button>
  <span class="flex-1"></span>
  <button type="button" onclick={onNext}
    class="h-12 flex items-center gap-1 rounded-[10px] cursor-pointer
           {manual ? 'px-4 border border-line-strong bg-transparent text-text text-[15px] font-medium'
                   : 'px-2 border-0 bg-transparent text-text-muted text-[14px]'}">
    {manual ? 'Next player' : 'Skip to next'}
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
  </button>
</div>
