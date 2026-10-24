<script lang="ts">
  // The phone's main navigation (below md): Play, Ranked with matchmaking on, Live, Tournaments, History.
  import { progress } from '$lib/progress/store'
  import { location } from 'svelte-spa-router'
  import { navTabs, isActiveRoute } from '$lib/nav'
  import { activeSessionId } from '$lib/activeSession'
  import { me } from '$lib/lobby/sockets'
  import { flag } from '$lib/flags'
  import NavTabItem from './NavTabItem.svelte'

  const matchmaking = flag('matchmaking.enabled')
  const progression = flag('progression.enabled')
  const tabs = $derived(
    navTabs($activeSessionId, $me?.invites.length ?? 0, $matchmaking, $progression ? ($progress?.challengesToClaim ?? 0) : null),
  )
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
