<script lang="ts">
  // The four totals at the top of the Achievements page and of a profile's Achievements tab:
  // earned, tiers, highest tier and the latest badge.
  import { shortDate, tierName, type Summary } from '$lib/achievements/view'

  let { summary }: { summary: Summary } = $props()
</script>

<section aria-label="Totals" class="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
  <div class="card flex flex-col gap-1 p-4">
    <span class="text-caption label-caps text-text-dim">Earned</span>
    <span class="font-display font-bold text-card-title leading-none">{summary.earned}</span>
    <span class="text-caption text-text-muted">of {summary.total} achievements</span>
  </div>
  <div class="card flex flex-col gap-1 p-4">
    <span class="text-caption label-caps text-text-dim">Tiers</span>
    <span class="font-display font-bold text-card-title leading-none">{summary.tiers}</span>
    <span class="text-caption text-text-muted">of {summary.possible} possible</span>
  </div>
  <div class="card flex flex-col gap-1 p-4">
    <span class="text-caption label-caps text-text-dim">Highest</span>
    <span class="font-display font-bold text-card-title leading-none">{summary.highest ? tierName(summary.highest) : '—'}</span>
  </div>
  <div class="card flex flex-col gap-1 p-4">
    <span class="text-caption label-caps text-text-dim">Latest</span>
    <span class="font-display font-bold text-card-title leading-none truncate">{summary.latest?.def.name ?? '—'}</span>
    {#if summary.latest?.earnedAt}<span class="text-caption text-text-muted">{shortDate(summary.latest.earnedAt)}</span>{/if}
  </div>
</section>
