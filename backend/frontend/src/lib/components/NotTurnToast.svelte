<script lang="ts">
  // A dart landed on your board while someone else is up: it wasn't counted. Shows for 6 s
  // (lib/toast.ts); the bar along the bottom runs out with it.
  import { Ban, X } from '@lucide/svelte'
  import type { NoticeLines } from '$lib/remote'

  let { lines, compact = false, ondismiss }: { lines: NoticeLines; compact?: boolean; ondismiss: () => void } = $props()
</script>

<div role="status" aria-live="polite"
  class="fixed z-50 box-border overflow-hidden flex items-center bg-surface-inset border border-line-popover [box-shadow:0_24px_60px_rgba(0,0,0,0.6)]
         {compact ? 'top-16 left-3 right-3 gap-3 rounded-[14px] px-4 pt-[14px] pb-4'
                  : 'top-[84px] left-1/2 -translate-x-1/2 w-[min(608px,calc(100vw-32px))] gap-4 rounded-[16px] px-[22px] pt-[18px] pb-5'}">
  <span class="shrink-0 rounded-full bg-warn-icon text-warn flex items-center justify-center {compact ? 'w-11 h-11' : 'w-14 h-14'}" aria-hidden="true">
    <Ban size={compact ? 20 : 26} />
  </span>
  <span class="flex flex-col min-w-0 {compact ? 'gap-[2px]' : 'gap-1'}">
    <span class="font-display font-bold uppercase leading-none {compact ? 'text-[24px]' : 'text-[36px] tracking-[0.02em]'}">{lines.title}</span>
    <span class="font-medium text-text {compact ? 'text-[15px]' : 'text-[20px]'}">{lines.body}</span>
    <span class="text-text-muted {compact ? 'text-[12px]' : 'text-[14px]'}">{lines.detail}</span>
  </span>
  <button type="button" onclick={ondismiss} aria-label="Dismiss"
    class="ml-auto self-start -mr-2 -mt-2 w-11 h-11 shrink-0 flex items-center justify-center bg-transparent border-0 text-text-muted cursor-pointer">
    <X size={18} />
  </button>
  <span class="absolute left-0 bottom-0 w-full origin-left bg-warn animate-drain motion-reduce:hidden {compact ? 'h-[3px]' : 'h-1'}" aria-hidden="true"></span>
</div>
