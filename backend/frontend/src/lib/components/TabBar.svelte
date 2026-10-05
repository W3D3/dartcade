<script lang="ts">
  // The phone's main navigation (below md): Play, Live while a game runs, Boards, History.
  import { location } from 'svelte-spa-router'
  import { navTabs, isActiveRoute } from '$lib/nav'
  import { activeSessionId } from '$lib/activeSession'
  import { me } from '$lib/lobby/sockets'
  import NavTabItem from './NavTabItem.svelte'

  const tabs = $derived(navTabs($activeSessionId, $me?.invites.length ?? 0))
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
