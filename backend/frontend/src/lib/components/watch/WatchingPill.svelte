<script lang="ts">
  // The players' small "N watching" pill: friends watching this game (Watch). Nothing while nobody does.
  import { Eye } from '@lucide/svelte'
  import { watchingLabel } from '$lib/watch/view'

  let { count }: { count: number | undefined } = $props()
  const label = $derived(watchingLabel(count))
</script>

{#if label}
  <span
    role="status"
    class="h-7 px-[10px] shrink-0 inline-flex items-center gap-[6px] rounded-full bg-surface-2 text-ink-2 text-[12px] font-semibold whitespace-nowrap"
  >
    <Eye size={14} aria-hidden="true" />{label}
  </span>
{/if}
