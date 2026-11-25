<script lang="ts">
  // The Review tab: the coach's review of each leg of this game, one card per leg as on the Coach
  // page. Loaded when the tab opens.
  import type { GameDetail } from '$lib/api'
  import CoachLegCard from '$lib/components/coach/CoachLegCard.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import { loadLegReviews, type LegReviews } from '$lib/details/review'

  let { detail }: { detail: GameDetail } = $props()
  const legs = $derived(detail.detail.mode === 'x01' ? detail.detail.legs.map(l => l.leg) : [])
  let reviews = $state<LegReviews | null>(null)
  let failed = $state(false)

  async function load() {
    reviews = null
    failed = false
    try {
      reviews = await loadLegReviews(detail.game.id, legs)
    } catch {
      failed = true
    }
  }
  $effect(() => void load())
  const reviewed = $derived((reviews ?? []).flatMap(r => (r.review ? [{ leg: r.leg, review: r.review }] : [])))
</script>

{#if failed}
  <div class="flex flex-wrap items-center gap-3 py-6">
    <ErrorText class="text-body">Couldn't load the review.</ErrorText>
    <Button variant="outline" onclick={() => void load()}>Retry</Button>
  </div>
{:else if reviews === null}
  <div aria-busy="true" class="flex flex-col gap-4">
    <p role="status" class="sr-only">Loading the coach's review…</p>
    {#each legs as l (l)}
      <div aria-hidden="true" class="card flex flex-col gap-3 p-4 md:px-[22px] md:py-5">
        <Skeleton class="h-6 w-24" /><Skeleton class="h-4 w-1/2" /><Skeleton class="h-14 w-full" /><Skeleton
          class="h-[38px] w-40 rounded-md"
        />
      </div>
    {/each}
  </div>
{:else if reviewed.length === 0}
  <div class="flex flex-col gap-1 py-6">
    <p class="text-lead font-semibold">No review yet</p>
    <p class="text-body text-text-muted">
      The coach reviews straight-in, double-out X01 legs with enough darts to grade. This game has none.
    </p>
  </div>
{:else}
  <div class="flex flex-col gap-4">
    {#each reviewed as r (r.leg)}<CoachLegCard gameId={detail.game.id} leg={r.leg} detail={r.review} />{/each}
  </div>
{/if}
