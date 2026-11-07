<script lang="ts">
  // The arrow against the range before (Stats.dc.html .dl): lime when it got better, red when worse.
  import type { Delta } from '$lib/stats/view'

  let { delta }: { delta: Delta | null } = $props()
</script>

{#if delta}
  <span
    class="whitespace-nowrap rounded-full px-[7px] py-0.5 text-[12px] font-semibold {delta.good
      ? 'bg-accent/10 text-accent'
      : 'bg-live/12 text-live'}">{delta.text}</span
  >
{/if}
