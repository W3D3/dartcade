<script lang="ts">
  // Progress (Progress / Mobile-Progress boards): your level and XP, your day streak, your daily and
  // weekly challenges. The rewards track is its own page (Rewards); customising is on your profile.
  // Behind progression.enabled; without it the page says it isn't on.
  // Rules: shared/progression.ts, backend progression/.
  import ChallengesSection from '$lib/components/progress/ChallengesSection.svelte'
  import Layout from '$lib/components/Layout.svelte'
  import PageLoading from '$lib/components/PageLoading.svelte'
  import LevelCard from '$lib/components/progress/LevelCard.svelte'
  import type { LevelGain } from '$lib/progress/view'
  import StreakCard from '$lib/components/progress/StreakCard.svelte'
  import { me } from '$lib/lobby/sockets'
  import { get } from 'svelte/store'
  import { flag } from '$lib/flags'
  import { progress } from '$lib/progress/store'

  const progression = flag('progression.enabled')
  // What you earn while the page is open (not the last game from before you came)
  const gained = me.xp
  const before = get(me.xp)
  const freshGain = $derived($gained && $gained !== before ? $gained : null)
  // The newest gain plays on the level card: a game's, or a claim's (flying in from its button)
  let gain = $state<LevelGain | null>(null)
  $effect(() => {
    if (freshGain) gain = { total: freshGain.total, xpBefore: freshGain.xpBefore, xpAfter: freshGain.xpAfter }
  })
  const onclaimed = (c: { total: number; xpAfter: number; from: DOMRect }) =>
    (gain = { total: c.total, xpBefore: c.xpAfter - c.total, xpAfter: c.xpAfter, from: c.from })
</script>

<Layout title="Progress">
  <main
    class="flex flex-grow min-h-0 flex-col gap-4 md:gap-6 box-border min-w-0 overflow-y-auto px-4 pt-6 pb-5 md:px-[30px] md:py-7 xl:px-11 xl:py-10"
  >
    <header>
      <div class="text-[12px] label-caps text-text-dim">Your progress</div>
      <h1 class="m-0 mt-1 font-display font-bold text-[40px] xl:text-[48px] leading-none uppercase tracking-[0.02em]">Progress</h1>
    </header>

    {#if !$progression}
      <p class="m-0 text-[15px] text-text-muted">Progress isn't on for your account yet.</p>
    {:else if $progress === null}
      <PageLoading />
    {:else}
      <div class="grid gap-4 md:gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <LevelCard xp={$progress.xp} title={$progress.perks.equipped.title} {gain} />
        <StreakCard streak={$progress.streak} />
      </div>
      <ChallengesSection {onclaimed} />
    {/if}
  </main>
</Layout>
