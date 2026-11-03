<script lang="ts">
  // A visit's grouping comment (Coach-Leg): Great/Good grouping tight, Scattered weak. Nothing
  // without a comment worth showing (groupingPill).
  import { groupingPill } from '$lib/coach/view'
  import type { Grouping } from '$shared/coach/grouping'

  let { grouping }: { grouping: Pick<Grouping, 'spreadMm'> | null } = $props()
  const pill = $derived(groupingPill(grouping))
</script>

{#if pill}
  <span class="inline-flex items-center h-6 px-[9px] box-border rounded-full text-[12px] font-bold whitespace-nowrap {pill.cls}"
    >{pill.label}</span
  >
{/if}
