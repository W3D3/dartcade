<script lang="ts">
  // A visit's grouping comment (Coach-Leg), judged against the player's average: Great/Good
  // grouping tight, Scattered loose. Information, not a grade: outlined, regular weight, a crosshair
  // in the comment's tone. Nothing without a comment worth showing (groupingPill).
  import { Crosshair } from '@lucide/svelte'
  import { groupingPill, TONE_TEXT } from '$lib/coach/tone'
  import type { Grouping } from '$shared/coach/grouping'

  let { grouping }: { grouping: Pick<Grouping, 'comment'> | null } = $props()
  const pill = $derived(groupingPill(grouping))
</script>

{#if pill}<span
    class="inline-flex h-6 items-center gap-1 rounded-full border border-line-strong bg-transparent px-2 box-border text-[12px] font-normal whitespace-nowrap normal-case text-ink-2"
    ><Crosshair size={13} aria-hidden="true" class={TONE_TEXT[pill.tone]} />{pill.label}</span
  >{/if}
