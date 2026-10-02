<script lang="ts">
  // The phone's main navigation (below md): Play, Live while a game runs, Boards, History.
  import { Clock, Monitor, Radio, Target } from '@lucide/svelte'
  import { location } from 'svelte-spa-router'
  import { navTabs, isActiveRoute } from '$lib/nav'
  import { activeSessionId } from '$lib/activeSession'

  const tabs = $derived(navTabs($activeSessionId))
</script>

<nav aria-label="Main"
  class="md:hidden shrink-0 box-border flex gap-[2px] px-2 pt-2 border-t border-line bg-surface-1
         h-[calc(72px+env(safe-area-inset-bottom))] pb-[calc(8px+env(safe-area-inset-bottom))]">
  {#each tabs as tab (tab.href)}
    {@const active = isActiveRoute($location, tab.href)}
    <a href={`#${tab.href}`} aria-current={active ? 'page' : undefined}
      class="relative flex-1 h-14 flex flex-col items-center justify-center gap-1 rounded-[10px] no-underline text-[11px]
             {active ? 'bg-[#22251f] text-text font-semibold' : 'text-text-muted font-medium'}">
      {#if tab.icon === 'live'}
        <span class="absolute top-[10px] left-1/2 ml-[9px] w-[7px] h-[7px] rounded-full bg-live" aria-hidden="true"></span>
      {/if}
      {#if tab.icon === 'play'}<Target size={22} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
      {:else if tab.icon === 'live'}<Radio size={22} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
      {:else if tab.icon === 'boards'}<Monitor size={22} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
      {:else}<Clock size={22} strokeWidth={1.8} class={active ? 'text-accent' : ''} />{/if}
      {tab.label}
    </a>
  {/each}
</nav>
