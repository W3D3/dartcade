<script lang="ts">
  // Progress › Achievements (Achievements and Achievements-Phone boards): what you have earned, how
  // far the next tier is, and the showcase of up to five badges your profile shows. Opening the page
  // clears the "new" dots on the next visit. Behind achievements.enabled.
  // Rules: shared/achievements.ts, backend achievements/.
  import Layout from '$lib/components/Layout.svelte'
  import PageLoading from '$lib/components/PageLoading.svelte'
  import AchievementSummary from '$lib/components/achievements/AchievementSummary.svelte'
  import AchievementList from '$lib/components/achievements/AchievementList.svelte'
  import ProgressTabs from '$lib/components/achievements/ProgressTabs.svelte'
  import ShowcaseBar from '$lib/components/achievements/ShowcaseBar.svelte'
  import { achievements, markSeen, saveShowcase } from '$lib/achievements/store'
  import { badgesOf, summarize } from '$lib/achievements/view'
  import { flag } from '$lib/flags'
  import { SHOWCASE_SIZE } from '$shared/achievements.js'

  const on = flag('achievements.enabled')
  const badges = $derived($achievements ? badgesOf($achievements) : [])
  const summary = $derived(summarize(badges))
  const showcaseIds = $derived($achievements?.showcase ?? [])
  const slots = $derived(showcaseIds.flatMap(id => badges.filter(b => b.def.id === id)))

  // The dots are the state when you came; leaving the page clears them
  let unseen = $state<Set<string> | null>(null)
  $effect(() => {
    if (unseen !== null || !$achievements) return
    unseen = new Set($achievements.achievements.filter(a => a.isNew).map(a => a.id))
    if ($achievements.unseen > 0) void markSeen()
  })

  const toggle = (id: string) =>
    saveShowcase(showcaseIds.includes(id) ? showcaseIds.filter(x => x !== id) : [...showcaseIds, id].slice(0, SHOWCASE_SIZE))
</script>

<Layout title="Achievements">
  <main
    class="flex grow min-h-0 flex-col gap-4 md:gap-6 box-border min-w-0 overflow-y-auto px-4 pt-6 pb-5 md:px-[30px] md:py-7 xl:px-11 xl:py-10"
  >
    <header>
      <div class="text-caption label-caps text-text-dim">Your progress</div>
      <h1 class="mt-1 type-checkout font-bold xl:text-page-title leading-none uppercase tracking-title">Achievements</h1>
    </header>
    <ProgressTabs />

    {#if !$on}
      <p class="text-body text-text-muted">Achievements aren't on for your account yet.</p>
    {:else if !$achievements}
      <PageLoading />
    {:else}
      <AchievementSummary {summary} />

      <ShowcaseBar {slots} max={SHOWCASE_SIZE} remove={toggle} />
      <AchievementList {badges} unseen={unseen ?? new Set()} showcase={{ ids: showcaseIds, max: SHOWCASE_SIZE, toggle }} />
    {/if}
  </main>
</Layout>
