<script lang="ts">
  // Your seat is up and your board's bridge is gone: enter the darts by hand until it's back.
  import { CircleOff } from '@lucide/svelte'

  let { board, compact = false }: { board: string; compact?: boolean } = $props()
</script>

<div
  role="status"
  class="shrink-0 flex items-center rounded-[12px] bg-warn-panel border border-warn-panel-line {compact
    ? 'gap-[10px] px-3 py-[9px]'
    : 'gap-3 px-4 py-3'}"
>
  <span class="flex text-warn" aria-hidden="true"><CircleOff size={22} strokeWidth={1.8} /></span>
  <span class="flex flex-col gap-[1px] min-w-0">
    <span class="font-semibold leading-[1.3] text-text {compact ? 'text-[14px]' : 'text-[16px]'}"
      >Your board is offline. Enter your darts here.</span
    >
    <span class="text-ink-2 {compact ? 'text-[12px]' : 'text-[13px]'}">Switches back to {board} by itself when it reconnects.</span>
  </span>
</div>
