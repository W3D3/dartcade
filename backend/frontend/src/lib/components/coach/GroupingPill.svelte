<script lang="ts">
  // A visit's grouping comment (Coach-Leg), judged against the player's average: Great/Good
  // grouping tight, Scattered weak. Nothing without a comment worth showing (groupingPill).
  import { groupingPill } from '$lib/coach/tone'
  import type { Grouping } from '$shared/coach/grouping'
  import Pill from './Pill.svelte'

  let { grouping }: { grouping: Pick<Grouping, 'comment'> | null } = $props()
  const pill = $derived(groupingPill(grouping))
</script>

{#if pill}<Pill {...pill} />{/if}
