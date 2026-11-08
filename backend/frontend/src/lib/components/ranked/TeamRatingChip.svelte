<script lang="ts">
  // A team's rating next to its name: "1 226 RP" (MM-Match-Teams board).
  import { Shield } from '@lucide/svelte'
  import { fmtRp } from '$lib/ranked/view'

  let { rating }: { rating: number } = $props()
</script>

<span
  title="Team rating"
  class="inline-flex h-6 shrink-0 items-center gap-[5px] whitespace-nowrap rounded-chip border border-line-chip bg-surface-inset px-2 font-mono text-[12px] font-medium text-text"
  ><Shield size={12} aria-hidden="true" class="text-text-muted" />{fmtRp(rating)}<span class="text-text-muted">RP</span></span
>
