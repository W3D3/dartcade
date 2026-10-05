<script lang="ts">
  // The line above the board while it shows someone else's turn: live, offline, or no connection.
  import type { Caption } from '$lib/remote'

  let { caption, compact = false }: { caption: Caption; compact?: boolean } = $props()

  const DOT: Record<Caption['tone'], string> = {
    live: 'rounded-full bg-live animate-pulse motion-reduce:animate-none',
    warn: 'box-border rounded-full border-[1.5px] border-warn',
    paused: 'rounded-[2px] bg-line-strong',
    muted: 'rounded-full bg-text-muted',
  }
</script>

<span
  class="self-center shrink-0 flex items-center font-semibold uppercase tracking-[0.1em] whitespace-nowrap
             {compact ? 'h-[14px] gap-[6px] text-[11px]' : 'h-5 gap-2 text-[13px]'} {caption.tone === 'warn'
    ? 'text-warn'
    : 'text-text-muted'}"
>
  <span class="{compact ? 'w-[7px] h-[7px]' : 'w-2 h-2'} {DOT[caption.tone]}" aria-hidden="true"></span>{caption.text}
</span>
