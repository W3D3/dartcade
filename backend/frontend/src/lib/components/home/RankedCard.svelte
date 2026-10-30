<script lang="ts">
  // Ranked (Home board): your 1v1 rank and rating, how far through the stage you are and your
  // last five ranked games. Mounted only while matchmaking is on, so nothing is fetched without it.
  import { ArrowRight } from '@lucide/svelte'
  import RankBadge from '$lib/components/ranked/RankBadge.svelte'
  import HomeSection from './HomeSection.svelte'
  import { api } from '$lib/api'
  import { Loader } from '$lib/home/loader.svelte'
  import { lastFive, rankProgress } from '$lib/home/view'
  import { TIER_COLOR, ratingCard } from '$lib/ranked/view'

  const profile = new Loader(() => api.GET('/api/ranked/me'))

  // The first rating is 1v1
  const rating = $derived(profile.data?.ratings.at(0))
  const card = $derived(rating ? ratingCard(rating) : null)
  const progress = $derived(rating ? rankProgress(rating) : null)
  const results = $derived(profile.data ? lastFive(profile.data.recent) : [])
</script>

<HomeSection title="Ranked" link={{ label: 'Ranks', href: '#/matchmaking/ranks' }} loading={profile.loading} error={profile.error}>
  {#if card}
    <div class="flex items-center gap-3">
      <RankBadge rank={card.rank} size={56} />
      <span class="flex min-w-0 flex-col">
        <span class="font-display text-[26px] font-bold leading-none" style:color={card.rank ? TIER_COLOR[card.rank.tier] : undefined}
          >{card.title}</span
        >
        <span class="whitespace-nowrap text-[14px] text-text-muted"
          ><span class="font-semibold text-text">{card.rating}</span> {card.unit}</span
        >
      </span>
    </div>
    {#if progress}
      <div class="flex flex-col gap-[6px]">
        <div class="flex justify-between text-[12px] text-text-muted"><span>{progress.line}</span><span>{progress.range}</span></div>
        <div
          class="h-[6px] overflow-hidden rounded-full bg-surface-1"
          role="progressbar"
          aria-label="Progress to the next stage"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.pct}
        >
          <div class="h-full rounded-full bg-accent" style:width="{progress.pct}%"></div>
        </div>
      </div>
    {:else}
      <p class="m-0 text-[13px] text-text-muted">{card.progress.replace(/^· /, '')}</p>
    {/if}
    <div class="flex items-center gap-2 text-[12px] text-text-muted">
      <span>Last 5</span>
      {#each results as r, i (i)}
        <span
          title={r === 'W' ? 'Win' : 'Loss'}
          class="inline-flex size-6 items-center justify-center rounded-[6px] text-[12px] font-bold {r === 'W'
            ? 'bg-accent-tint text-accent'
            : 'bg-surface-1 text-live-text'}">{r}</span
        >
      {:else}
        <span class="text-text-dim">No ranked games yet</span>
      {/each}
    </div>
    <a href="#/matchmaking" class="mt-auto inline-flex items-center gap-2 text-[14px] font-semibold text-accent no-underline"
      >Find a ranked match<ArrowRight size={16} /></a
    >
  {/if}
</HomeSection>
