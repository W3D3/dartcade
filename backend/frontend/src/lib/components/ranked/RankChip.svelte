<script lang="ts">
  // A player's rank on their panel: "[Silver V] Silver V · 1 284 RP". No rank while placing, and
  // the rating stays hidden then (MM-Match board).
  import RankBadge from './RankBadge.svelte'
  import { TIER_TEXT, fmtRp } from '$lib/ranked/view'
  import type { Rank } from '$shared/ranked.js'

  let { rank, rating }: { rank: Rank | null; rating: number | null } = $props()
</script>

<span
  class="inline-flex h-6 max-w-full items-center self-start gap-[6px] whitespace-nowrap rounded-chip border border-line-chip bg-surface-inset pl-[5px] pr-2 text-[12px]"
>
  <RankBadge {rank} size={16} />
  <span class="font-semibold" style:color={rank ? TIER_TEXT[rank.tier] : undefined}>{rank?.name ?? 'Placement'}</span>
  {#if rating !== null}<span class="font-mono text-text-muted">{fmtRp(rating)}&thinsp;RP</span>{/if}
</span>
