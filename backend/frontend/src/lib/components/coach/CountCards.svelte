<script lang="ts">
  // The Coach page's four counts over your last 50 legs (Coach-Review): 2×2 on phones, 4 across above.
  import type { CoachLegCounts } from '$lib/api'

  let { counts }: { counts: CoachLegCounts } = $props()

  const cards = $derived([
    { label: 'Low visits', value: counts.lowVisits, cls: 'text-gold', sub: 'below your level, not on a finish' },
    { label: 'Bad setups', value: counts.badSetups, cls: 'text-gold', sub: 'left an odd or awkward number' },
    { label: 'Missed doubles', value: counts.missedDoubles, cls: 'text-live', sub: 'darts at a double that missed' },
    { label: 'Clean legs', value: counts.cleanLegs, cls: 'text-accent', sub: 'nothing flagged' },
  ])
</script>

<dl class="m-0 grid grid-cols-2 gap-3 lg:grid-cols-4">
  {#each cards as c (c.label)}
    <div class="card flex min-w-0 flex-col gap-1 px-4 py-3.5">
      <dt class="text-[12px] font-semibold label-caps text-text-dim">{c.label}</dt>
      <dd class="m-0 font-display text-[32px] font-bold leading-none {c.cls}">{c.value}</dd>
      <dd class="m-0 text-[12.5px] text-text-muted">{c.sub}</dd>
    </div>
  {/each}
</dl>
