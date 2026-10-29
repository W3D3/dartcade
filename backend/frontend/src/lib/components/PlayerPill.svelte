<script lang="ts">
  import { Trophy } from '@lucide/svelte'
  import type { PillKind } from './pills.js'
  /** `label`: a different text for the kind's look (Higher Lower's "Out · 2nd", 121's "Done"). */
  let { kind, small = false, label }: { kind: PillKind; small?: boolean; label?: string } = $props()
  const LABEL: Record<PillKind, string> = {
    throwing: 'Throwing',
    'up-next': 'Up next',
    practice: 'Practice',
    leading: 'Leading',
    winner: 'Winner',
    lost: '−1 life',
    out: 'Out',
  }
</script>

<span
  class="self-start shrink-0 inline-flex items-center gap-[6px] rounded-full uppercase tracking-[0.08em] whitespace-nowrap
             {small ? 'h-[26px] px-[10px] text-[12px]' : 'h-7 px-3 text-[13px]'}
             {kind === 'throwing' || kind === 'winner'
    ? 'bg-accent text-accent-fg font-bold'
    : kind === 'lost'
      ? 'bg-live text-bg font-bold'
      : kind === 'out'
        ? 'bg-surface-paused text-text-dim font-bold'
        : kind === 'leading'
          ? 'border border-line-pip text-text font-bold'
          : 'border border-line-chip text-text-dim font-semibold'}"
>
  {#if kind === 'leading'}
    <Trophy size={13} />
  {/if}
  {label ?? LABEL[kind]}
</span>
