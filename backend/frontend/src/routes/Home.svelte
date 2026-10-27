<script lang="ts">
  // Home (Home, Tablet-Home, Mobile-Home boards): where signing in lands. Your form and rank, what is
  // new, your friends' lobbies and what they did lately, and a way back into your last games. Every
  // section loads on its own. No customising yet: the sections are in the design's order.
  // Design: docs/superpowers/specs/2026-10-27-home-page-design.md
  import { ArrowRight } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import ActivityCard from '$lib/components/home/ActivityCard.svelte'
  import FeaturedCarousel from '$lib/components/home/FeaturedCarousel.svelte'
  import FormCard from '$lib/components/home/FormCard.svelte'
  import LobbiesCard from '$lib/components/home/LobbiesCard.svelte'
  import NewsCard from '$lib/components/home/NewsCard.svelte'
  import RankedCard from '$lib/components/home/RankedCard.svelte'
  import RecentCard from '$lib/components/home/RecentCard.svelte'
  import { currentUser } from '$lib/auth'
  import { flag } from '$lib/flags'
  import { FEATURED, visibleFeatured } from '$lib/home/featured'
  import { homeFlagOn } from '$lib/home/flags'
  import { greeting, longDate } from '$lib/home/view'

  const matchmaking = flag('matchmaking.enabled')
  const now = new Date()
  const slides = $derived(visibleFeatured(FEATURED, $homeFlagOn))
</script>

<Layout title="Home">
  <main
    class="flex flex-grow min-h-0 flex-col gap-[14px] md:gap-5 box-border min-w-0 overflow-y-auto px-4 pt-[14px] pb-5 md:px-[30px] md:py-7 xl:px-10 xl:py-9"
  >
    <header class="flex items-end justify-between gap-4">
      <div class="flex min-w-0 flex-col gap-1">
        <span class="text-[13px] text-text-muted">{longDate(now)}</span>
        <h1 class="m-0 font-display text-[28px] font-bold uppercase leading-none tracking-[0.02em] md:text-[42px] xl:text-[48px]">
          {greeting(now)}{#if $currentUser}, {$currentUser.name}{/if}
        </h1>
      </div>
      <Button href="#/play" variant="accent" class="shrink-0">New game<ArrowRight size={16} /></Button>
    </header>

    <div class="grid gap-[14px] md:gap-5 {$matchmaking ? 'lg:grid-cols-[1.5fr_1fr]' : ''}">
      <FormCard />
      {#if $matchmaking}<RankedCard />{/if}
    </div>

    <FeaturedCarousel {slides} />

    <div class="grid gap-[14px] md:gap-5 lg:grid-cols-2">
      <LobbiesCard />
      <ActivityCard />
    </div>

    <div class="grid gap-[14px] md:gap-5 lg:grid-cols-2">
      <NewsCard />
      <RecentCard />
    </div>
  </main>
</Layout>
