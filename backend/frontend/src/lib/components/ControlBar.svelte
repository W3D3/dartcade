<script lang="ts">
  import { ChevronRight, Undo2 } from '@lucide/svelte'
  // Undo, and the manual advance. On a board the takeout advances by itself, so
  // "Skip to next" stays quiet; without a board it is the way on, so it is an outline button.
  let {
    canUndo,
    label,
    prominent,
    enabled,
    onUndo,
    onNext,
    compact = false,
    primary = false,
  }: {
    canUndo: boolean
    label: string
    /** "Next player" is an outline button; the quiet "Skip to next" a text button. */
    prominent: boolean
    enabled: boolean
    onUndo: () => void
    onNext: () => void
    /** Phones: 44 px instead of 52 px. */
    compact?: boolean
    /** The main action, filled in the accent colour (Minigolf's Shoot). */
    primary?: boolean
  } = $props()
</script>

<div class="{compact ? 'h-11' : 'h-[52px]'} shrink-0 flex items-center gap-[10px]">
  <button
    type="button"
    onclick={onUndo}
    disabled={!canUndo}
    class="{compact ? 'h-11 px-3' : 'h-12 px-4'} flex items-center gap-2 rounded-[10px] border border-line-strong bg-transparent text-text
           text-[15px] font-medium cursor-pointer disabled:opacity-40 disabled:cursor-default"
  >
    <Undo2 size={18} />
    Undo
  </button>
  <span class="flex-1"></span>
  <button
    type="button"
    onclick={onNext}
    disabled={!enabled}
    class="{compact ? 'h-11' : 'h-12'} flex items-center gap-1 rounded-[10px] cursor-pointer disabled:opacity-40 disabled:cursor-default
           {primary
      ? 'px-6 border-0 bg-accent text-accent-fg hover:bg-accent-hover font-display font-bold text-[20px] uppercase tracking-[0.02em]'
      : prominent
        ? 'px-4 border border-line-strong bg-transparent text-text text-[15px] font-medium'
        : 'px-2 border-0 bg-transparent text-text-muted text-[14px]'}"
  >
    {label}
    <ChevronRight size={16} />
  </button>
</div>
