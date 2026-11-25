<script lang="ts">
  // One item of the phone tab bar and the tablet rail: icon over label, the invites badge.
  // A disabled tab (Tournaments while its flag is off) is a dimmed span, not a link.
  import type { NavTab } from '$lib/nav'
  import { NAV_ICONS } from '$lib/navState'
  import NavBadge from './NavBadge.svelte'

  let { tab, active, class: className = '' }: { tab: NavTab; active: boolean; class?: string } = $props()
  const on = $derived(active && !tab.disabled)
  const Icon = $derived(NAV_ICONS[tab.icon])
</script>

<svelte:element
  this={tab.disabled ? 'span' : 'a'}
  href={tab.disabled ? undefined : `#${tab.href}`}
  aria-current={on ? 'page' : undefined}
  aria-disabled={tab.disabled ? 'true' : undefined}
  aria-label={tab.aria}
  role={tab.disabled ? 'link' : undefined}
  class="relative flex flex-col items-center justify-center gap-1 rounded-md no-underline text-[11px]
         {on
    ? 'bg-surface-paused text-text font-semibold'
    : tab.disabled
      ? 'text-text-dim opacity-60 font-medium'
      : 'text-text-muted font-medium'} {className}"
>
  {#if tab.badge}
    <NavBadge count={tab.badge} label={tab.badgeLabel ?? ''} class="absolute top-[6px] left-1/2 ml-[4px] border-2 border-surface-1" />
  {/if}
  <Icon size={22} strokeWidth={1.8} class={on ? 'text-accent' : ''} />
  {tab.label}
</svelte:element>
