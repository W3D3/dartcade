<script lang="ts">
  import type { PillKind } from './pills.js'
  let { kind, small = false }: { kind: PillKind; small?: boolean } = $props()
  const LABEL: Record<PillKind, string> = { throwing: 'Throwing', 'up-next': 'Up next', practice: 'Practice', leading: 'Leading', winner: 'Winner' }
</script>

<span class="self-start shrink-0 inline-flex items-center gap-[6px] rounded-full uppercase tracking-[0.08em] whitespace-nowrap
             {small ? 'h-[26px] px-[10px] text-[12px]' : 'h-7 px-3 text-[13px]'}
             {kind === 'throwing' || kind === 'winner' ? 'bg-accent text-accent-fg font-bold'
               : kind === 'leading' ? 'border border-line-pip text-text font-bold'
               : 'border border-line-chip text-text-dim font-semibold'}">
  {#if kind === 'leading'}
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>
    </svg>
  {/if}
  {LABEL[kind]}
</span>
