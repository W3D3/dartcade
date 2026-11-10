<script lang="ts">
  // The filter chips (All, Earned, Not yet) and the badges by category (Achievements board),
  // shared by the Achievements page (with the showcase buttons) and a profile's Achievements tab.
  import AchievementCard from './AchievementCard.svelte'
  import { flag } from '$lib/flags'
  import { byCategory, CATEGORY_NAME, filterBadges, type Badge, type Filter } from '$lib/achievements/view'

  let {
    badges,
    unseen = new Set<string>(),
    showcase = null,
  }: {
    badges: Badge[]
    /** Ids whose current tier is new to you. */
    unseen?: Set<string>
    /** Your showcase (ids, in order) and how to change it; null where it cannot be changed. */
    showcase?: { ids: string[]; max: number; toggle: (id: string) => void } | null
  } = $props()

  // Where typed-in darts count (progression.manualDarts, for testing without a board) the note would be false
  const typedCount = flag('progression.manualDarts')
  let filter = $state<Filter>('all')
  const counts = $derived({
    all: badges.length,
    earned: badges.filter(b => b.tier > 0).length,
    notYet: badges.filter(b => b.tier === 0).length,
  })
  const CHIPS: [Filter, string][] = [
    ['all', 'All'],
    ['earned', 'Earned'],
    ['notYet', 'Not yet'],
  ]
  const groups = $derived(byCategory(filterBadges(badges, filter)))
  const earnedIn = (category: string) => badges.filter(b => b.def.category === category && b.tier > 0).length
  const totalIn = (category: string) => badges.filter(b => b.def.category === category).length
</script>

<div class="flex flex-col gap-4 md:gap-6">
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
    <div class="flex gap-2" role="group" aria-label="Filter">
      {#each CHIPS as [key, name] (key)}
        <button
          type="button"
          aria-pressed={filter === key}
          onclick={() => (filter = key)}
          class="inline-flex items-center gap-2 rounded-full border px-4 py-[6px] text-label font-semibold cursor-pointer
                 {filter === key ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong text-text'}"
          >{name}<span class="tabular-nums opacity-70">{counts[key]}</span></button
        >
      {/each}
    </div>
    {#if !$typedCount}<span class="text-small text-text-muted">Only games thrown at a board count; games typed in by hand on the keypad don't.</span>{/if}
  </div>

  {#each groups as g (g.category)}
    <section aria-label={CATEGORY_NAME[g.category]} class="flex flex-col gap-3">
      <div class="flex items-baseline justify-between">
        <h2 class="type-section-title font-bold tracking-section">{CATEGORY_NAME[g.category]}</h2>
        <span class="text-small text-text-muted">{earnedIn(g.category)} of {totalIn(g.category)} earned</span>
      </div>
      <div class="grid gap-3 md:gap-4 md:grid-cols-2 xl:grid-cols-3">
        {#each g.badges as b (b.def.id)}
          <AchievementCard
            badge={b}
            isNew={unseen.has(b.def.id)}
            showcase={showcase
              ? {
                  shown: showcase.ids.includes(b.def.id),
                  full: showcase.ids.length >= showcase.max,
                  toggle: () => showcase.toggle(b.def.id),
                }
              : null}
          />
        {/each}
      </div>
    </section>
  {:else}
    <p class="text-body text-text-muted">Nothing here yet.</p>
  {/each}
</div>
