<script lang="ts">
  // One item of the phone tab bar and the tablet rail: icon over label, the Live dot, the invites badge.
  import { Clock, Monitor, Radio, Target } from '@lucide/svelte'
  import type { NavTab } from '$lib/nav'
  import NavBadge from './NavBadge.svelte'

  let { tab, active, class: className = '' }: { tab: NavTab; active: boolean; class?: string } = $props()
</script>

<a href={`#${tab.href}`} aria-current={active ? 'page' : undefined}
  class="relative flex flex-col items-center justify-center gap-1 rounded-[10px] no-underline text-[11px]
         {active ? 'bg-surface-paused text-text font-semibold' : 'text-text-muted font-medium'} {className}">
  {#if tab.icon === 'live'}
    <span class="absolute top-[10px] left-1/2 ml-[9px] w-[7px] h-[7px] rounded-full bg-live" aria-hidden="true"></span>
  {/if}
  {#if tab.badge}
    <NavBadge count={tab.badge} label="{tab.badge} pending {tab.badge === 1 ? 'invite' : 'invites'}"
      class="absolute top-[6px] left-1/2 ml-[4px] border-2 border-surface-1" />
  {/if}
  {#if tab.icon === 'play'}<Target size={22} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
  {:else if tab.icon === 'live'}<Radio size={22} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
  {:else if tab.icon === 'boards'}<Monitor size={22} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
  {:else}<Clock size={22} strokeWidth={1.8} class={active ? 'text-accent' : ''} />{/if}
  {tab.label}
</a>
