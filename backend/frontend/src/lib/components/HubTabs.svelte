<script lang="ts">
  // The title and tabs of a page with several: Play (New game, Ranked, Missions) and Stats (Overview,
  // History). Each tab is its own route, so a link, a reload and Back keep it; a tab whose flag is off
  // is left out, and with one tab left there is no tab bar. Phones show the title in the phone header.
  import { location } from 'svelte-spa-router'
  import { ChartColumn, Clock, Goal, Swords, Target } from '@lucide/svelte'
  import { flag } from '$lib/flags'
  import { activeTab, playTabs, statsTabs, type PageTab } from '$lib/nav'
  import { historyHref } from '$lib/urlState'
  import { sessionStore } from '$lib/returnTo'

  let { hub }: { hub: 'play' | 'stats' } = $props()

  const ranked = flag('matchmaking.enabled')
  const missions = flag('missions.enabled')
  const stats = flag('stats.enabled')
  const ICONS = { 'new-game': Target, ranked: Swords, missions: Goal, overview: ChartColumn, history: Clock } satisfies Record<
    PageTab['icon'],
    unknown
  >

  const title = $derived(hub === 'play' ? 'Play' : 'Stats')
  const tabs = $derived(
    hub === 'play' ? playTabs({ ranked: $ranked, missions: $missions }) : statsTabs($stats, historyHref(sessionStore())),
  )
  const active = $derived(activeTab($location, tabs))
</script>

<div class="flex shrink-0 flex-col gap-3 md:gap-5">
  <h1 class="hidden type-page-title md:block">{title}</h1>
  {#if tabs.length > 1}
    <!-- Scrolls sideways when the tabs outgrow a small phone; bleeds to the page's edges there -->
    <nav
      aria-label={title}
      class="-mx-4 flex overflow-x-auto border-b border-line px-4 scrollbar-none md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {#each tabs as t (t.path)}
        {@const Icon = ICONS[t.icon]}
        <a
          href={t.href}
          aria-current={t === active ? 'page' : undefined}
          class="-mb-px inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-body font-semibold no-underline md:px-4
                 {t === active ? 'border-accent text-text' : 'border-transparent text-text-muted hover:text-text'}"
          ><Icon size={18} aria-hidden="true" />{t.label}</a
        >
      {/each}
    </nav>
  {/if}
</div>
