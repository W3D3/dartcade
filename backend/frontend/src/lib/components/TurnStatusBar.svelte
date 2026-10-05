<script lang="ts">
  // In place of Undo / Next while someone else is up: who is throwing (or why the game waits).
  // Undo and Skip stay visible but off: only that seat's controller may use them.
  import { ChevronRight, MonitorSmartphone, Pause, Undo2, WifiOff } from '@lucide/svelte'
  import type { TurnStatus } from '$lib/remote'

  let { status, compact = false }: { status: TurnStatus; compact?: boolean } = $props()
</script>

<div
  role="status"
  class="shrink-0 box-border flex items-center rounded-[12px] bg-surface-panel border border-line-2 {compact
    ? 'h-[52px] pl-[14px] pr-[2px] gap-[10px]'
    : 'h-[54px] pl-[14px] pr-1 gap-[10px] xl:h-14 xl:pl-4 xl:pr-[6px] xl:gap-3'}"
>
  <span class="flex {status.tone === 'warn' ? 'text-warn' : 'text-text-muted'}" aria-hidden="true">
    {#if status.tone === 'paused'}<Pause size={18} />{:else if status.tone === 'warn'}<WifiOff size={18} />{:else}<MonitorSmartphone
        size={18}
      />{/if}
  </span>
  <span
    class="flex-1 min-w-0 font-semibold text-text {compact
      ? 'text-[14px] leading-[1.25] line-clamp-2'
      : 'text-[16px] xl:text-[18px] truncate max-xl:whitespace-normal max-xl:line-clamp-2 max-xl:leading-[1.2]'}">{status.text}</span
  >
  {#if compact}
    <button
      type="button"
      disabled
      aria-label="Undo (only {status.name} can undo)"
      class="w-10 h-11 flex items-center justify-center border-0 bg-transparent text-line-strong"><Undo2 size={18} /></button
    >
    <button
      type="button"
      disabled
      aria-label="Skip to next (only {status.name} can skip)"
      class="w-10 h-11 flex items-center justify-center border-0 bg-transparent text-line-strong"><ChevronRight size={18} /></button
    >
  {:else}
    <button
      type="button"
      disabled
      title="Only {status.name} can undo {status.name}'s darts"
      class="h-11 px-3 flex items-center gap-[6px] rounded-[10px] border border-line-2 bg-transparent text-line-strong text-[14px]"
      ><Undo2 size={16} />Undo</button
    >
    <!-- Tablets: Skip is the arrow alone, so the status keeps its room -->
    <button
      type="button"
      disabled
      title="Only {status.name} can skip"
      aria-label="Skip to next (only {status.name} can skip)"
      class="h-11 w-11 justify-center xl:w-auto xl:px-[10px] flex items-center gap-1 border-0 bg-transparent text-line-strong text-[14px]"
      ><span class="hidden xl:inline">Skip to next</span><ChevronRight size={16} /></button
    >
  {/if}
</div>
