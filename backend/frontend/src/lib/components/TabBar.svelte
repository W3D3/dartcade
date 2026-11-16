<script lang="ts">
  // The phone's main navigation (below md): Home, Play, Ranked, Coach, Progress, Tournaments, History.
  import { location } from 'svelte-spa-router'
  import { navTabs, isActiveRoute } from '$lib/nav'
  import { navState } from '$lib/navState'
  import NavTabItem from './NavTabItem.svelte'

  const tabs = $derived(navTabs($navState))
</script>

<nav
  aria-label="Main"
  class="md:hidden shrink-0 box-border flex gap-[2px] px-2 pt-2 border-t border-line bg-surface-1
         h-[calc(72px+env(safe-area-inset-bottom))] pb-[calc(8px+env(safe-area-inset-bottom))]"
>
  {#each tabs as tab (tab.href)}
    <NavTabItem {tab} active={isActiveRoute($location, tab.href)} class="flex-1 h-14" />
  {/each}
</nav>
