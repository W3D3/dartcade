<script lang="ts">
  // The Progress page's challenges: daily and weekly side by side; on the phone one at a time,
  // picked with a segmented control (Mobile-Progress board).
  import { onMount } from 'svelte'
  import ChallengeCard from './ChallengeCard.svelte'
  import SegmentedControl from '../SegmentedControl.svelte'
  import ErrorText from '../ErrorText.svelte'
  import { isPhone } from '$lib/viewport'
  import { createChallenges, doneOf } from '$lib/progress/challenges'

  let {
    onclaimed,
  }: {
    /** A claim paid `total`, taking you to `xpAfter`; `from` is the Claim button. */
    onclaimed?: (gain: { total: number; xpAfter: number; from: DOMRect }) => void
  } = $props()
  const challenges = createChallenges()
  let period = $state<'daily' | 'weekly'>('daily')
  let error = $state('')
  // The reset countdown moves on its own
  let now = $state(new Date())
  onMount(() => {
    const t = setInterval(() => (now = new Date()), 60_000)
    return () => clearInterval(t)
  })

  const onreroll = (id: string) => void reroll(id)
  // The ones already done when the page opened; any done after that celebrates
  let doneAtOpen: Set<string> | null = null
  $effect(() => {
    if ($challenges && !doneAtOpen)
      doneAtOpen = new Set([...$challenges.daily.items, ...$challenges.weekly.items].filter(c => c.completed).map(c => c.id))
  })
  const fresh = (id: string) => doneAtOpen !== null && !doneAtOpen.has(id)
  async function reroll(id: string) {
    error = (await challenges.reroll(id)) ?? ''
  }
  async function onclaim(id: string, from: DOMRect) {
    const r = await challenges.claim(id)
    error = r.error ?? ''
    if (r.gained > 0) onclaimed?.({ total: r.gained, xpAfter: r.xpAfter, from })
  }
</script>

{#if $challenges}
  {#if error}<ErrorText>{error}</ErrorText>{/if}
  {#if $isPhone}
    <SegmentedControl
      class="bg-surface-inset"
      options={[
        { value: 'daily', label: `Daily ${doneOf($challenges.daily)}` },
        { value: 'weekly', label: `Weekly ${doneOf($challenges.weekly)}` },
      ]}
      bind:value={period}
    />
    <ChallengeCard set={$challenges[period]} {period} {now} bare {fresh} {onreroll} {onclaim} />
  {:else}
    <div class="grid gap-4 md:gap-6 lg:grid-cols-2">
      <ChallengeCard set={$challenges.daily} period="daily" {now} {fresh} {onreroll} {onclaim} />
      <ChallengeCard set={$challenges.weekly} period="weekly" {now} {fresh} {onreroll} {onclaim} />
    </div>
  {/if}
{/if}
