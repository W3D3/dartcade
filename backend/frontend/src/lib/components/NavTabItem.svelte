<script lang="ts">
  // One item of the phone tab bar and the tablet rail: icon over label, the Live dot, the invites badge.
  // A disabled tab (Live with no game running, Tournaments until it ships) is a dimmed span, not a link.
  import { Clock, Radio, Swords, Target, TrendingUp, Trophy } from '@lucide/svelte'
  import type { NavTab } from '$lib/nav'
  import NavBadge from './NavBadge.svelte'

  let { tab, active, class: className = '' }: { tab: NavTab; active: boolean; class?: string } = $props()
  const on = $derived(active && !tab.disabled)
</script>

<svelte:element
  this={tab.disabled ? 'span' : 'a'}
  href={tab.disabled ? undefined : `#${tab.href}`}
  aria-current={on ? 'page' : undefined}
  aria-disabled={tab.disabled ? 'true' : undefined}
  aria-label={tab.aria}
  role={tab.disabled ? 'link' : undefined}
  class="relative flex flex-col items-center justify-center gap-1 rounded-[10px] no-underline text-[11px]
         {on
    ? 'bg-surface-paused text-text font-semibold'
    : tab.disabled
      ? 'text-text-dim opacity-60 font-medium'
      : 'text-text-muted font-medium'} {className}"
>
  {#if tab.icon === 'live' && !tab.disabled}
    <span class="absolute top-[10px] left-1/2 ml-[9px] w-[7px] h-[7px] rounded-full bg-live" aria-hidden="true"></span>
  {/if}
  {#if tab.badge}
    <NavBadge count={tab.badge} label={tab.badgeLabel ?? ''} class="absolute top-[6px] left-1/2 ml-[4px] border-2 border-surface-1" />
  {/if}
  {#if tab.icon === 'play'}<Target size={22} strokeWidth={1.8} class={on ? 'text-accent' : ''} />
  {:else if tab.icon === 'ranked'}<Swords size={22} strokeWidth={1.8} class={on ? 'text-accent' : ''} />
  {:else if tab.icon === 'live'}<Radio size={22} strokeWidth={1.8} class={on ? 'text-accent' : ''} />
  {:else if tab.icon === 'tournaments'}<Trophy size={22} strokeWidth={1.8} />
  {:else if tab.icon === 'progress'}<TrendingUp size={22} strokeWidth={1.8} class={on ? 'text-accent' : ''} />
  {:else}<Clock size={22} strokeWidth={1.8} class={on ? 'text-accent' : ''} />{/if}
  {tab.label}
</svelte:element>
