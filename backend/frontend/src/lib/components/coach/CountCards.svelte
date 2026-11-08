<script lang="ts">
  // The Coach page's four counts over your last 50 legs (Coach-Review): 2×2 on phones, 4 across above.
  // `counts` null: still loading, the same cards with a placeholder for each number.
  import type { CoachLegCounts } from '$lib/api'
  import { TONE_TEXT } from '$lib/coach/tone'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import SectionLabel from '$lib/components/SectionLabel.svelte'

  let { counts }: { counts: CoachLegCounts | null } = $props()

  const cards = $derived([
    { label: 'Low visits', value: counts?.lowVisits, cls: TONE_TEXT.weak, sub: 'below your level, not on a finish' },
    { label: 'Bad setups', value: counts?.badSetups, cls: TONE_TEXT.bad, sub: 'setup visits graded Bad' },
    { label: 'Missed doubles', value: counts?.missedDoubles, cls: TONE_TEXT.bad, sub: 'darts at a double that missed' },
    { label: 'Clean legs', value: counts?.cleanLegs, cls: TONE_TEXT.lime, sub: 'nothing flagged' },
  ])
</script>

<dl class="grid grid-cols-2 gap-3 lg:grid-cols-4">
  {#each cards as c (c.label)}
    <div class="card flex min-w-0 flex-col gap-1 px-4 py-3.5">
      <SectionLabel as="dt">{c.label}</SectionLabel>
      {#if c.value === undefined}
        <dd><Skeleton class="h-8 w-10" /></dd>
      {:else}
        <dd class="font-display text-[32px] font-bold leading-none {c.cls}">{c.value}</dd>
      {/if}
      <dd class="text-[12.5px] text-text-muted">{c.sub}</dd>
    </div>
  {/each}
</dl>
