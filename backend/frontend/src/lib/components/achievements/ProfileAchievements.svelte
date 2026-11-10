<script lang="ts">
  // A profile's Achievements tab (Profile-Lena-Achievements board): their totals, how you compare
  // (on someone else's profile), and every badge with its progress, read only.
  import AchievementList from './AchievementList.svelte'
  import AchievementSummary from './AchievementSummary.svelte'
  import { badgesOf, compare, summarize, type Achievements } from '$lib/achievements/view'
  import { fetchAchievements } from '$lib/achievements/store'

  let { data, self, name }: { data: Achievements; self: boolean; name: string } = $props()

  const badges = $derived(badgesOf(data))
  const summary = $derived(summarize(badges))
  let mine = $state<Achievements | null>(null)
  $effect(() => {
    if (!self) void fetchAchievements().then(a => (mine = a))
  })
  const versus = $derived(mine ? compare(badgesOf(mine), badges) : null)
  const list = (names: string[]) => names.slice(0, 3).join(', ')
  const sentence = $derived(
    versus
      ? [
          versus.ahead.length ? `${name} is ahead on ${list(versus.ahead)}.` : '',
          versus.behind.length ? `You are ahead on ${list(versus.behind)}.` : '',
        ]
          .filter(Boolean)
          .join(' ')
      : '',
  )
</script>

<div class="flex flex-col gap-4 md:gap-6">
  <AchievementSummary {summary} />

  {#if versus}
    <p class="card flex flex-wrap items-baseline gap-x-3 p-4 text-label text-text-muted">
      <span class="text-caption label-caps text-text-dim">You both have</span>
      <span class="font-display font-bold text-section-title leading-none text-text">{versus.both}</span>
      <span>achievements. {sentence}</span>
      <a href="#/progress/achievements" class="text-accent no-underline">Your achievements ›</a>
    </p>
  {/if}

  <AchievementList {badges} />
</div>
