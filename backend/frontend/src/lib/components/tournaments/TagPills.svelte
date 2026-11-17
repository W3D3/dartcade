<script lang="ts">
  // OFFICIAL and the tournament's tags (WEEKLY) as pills (Tournaments artboard, the hero card).
  import { Star } from '@lucide/svelte'
  import type { TournamentSummary } from '$lib/api'

  let { t }: { t: Pick<TournamentSummary, 'kind' | 'tags'> } = $props()
</script>

{#if t.kind === 'official'}
  <span
    class="inline-flex h-[22px] items-center gap-1 rounded-full bg-accent-tint px-2 text-caption font-bold tracking-section text-accent"
  >
    <Star size={12} aria-hidden="true" />OFFICIAL
  </span>
{/if}
{#each t.tags as tag (tag)}
  <span class="inline-flex h-[22px] items-center rounded-full bg-surface-chip px-2 text-caption font-bold tracking-section text-ink-2">
    {tag.toUpperCase()}
  </span>
{/each}
