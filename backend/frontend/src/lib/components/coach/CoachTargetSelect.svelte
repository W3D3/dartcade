<script lang="ts">
  // "Coach me as…": the tier the coach grades your legs and the live panel as (lib/coach/target.ts),
  // on the Coach page and in Settings. The tier your 30-day average suggests is marked Recommended.
  import { Select } from '$lib/components/ui/select/index.js'
  import { coachTarget, fetchCoachAverage, pickedTarget, setCoachTarget, shownTier, tierChoices } from '$lib/coach/target'
  import { suggestedTier } from '$shared/coach/tiers'

  let { onchanged }: { /** After a new target reached the account */ onchanged?: () => void } = $props()

  let average = $state<number | null | undefined>(undefined)
  $effect(() => {
    void fetchCoachAverage().then(a => (average = a))
  })
  const suggested = $derived(suggestedTier(average))

  function pick(v: string) {
    const tier = tierChoices(suggested).find(c => c.value === v)?.value
    if (tier) void setCoachTarget(pickedTarget(tier, suggested)).then(() => onchanged?.())
  }
</script>

<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
  <span aria-hidden="true" class="text-[14px] text-text-muted">Coach me as…</span>
  {#if average !== undefined}
    <Select label="Coach me as" options={tierChoices(suggested)} value={shownTier($coachTarget, suggested)} onchange={pick} />
  {:else}
    <span aria-hidden="true" class="h-11 w-[240px] rounded-[10px] border border-line-3 animate-pulse motion-reduce:animate-none"></span>
  {/if}
</div>
