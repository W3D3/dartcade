<script lang="ts">
  import { hrefs } from '$lib/routes'
  import Wordmark from './Wordmark.svelte'
  import { Mail } from '@lucide/svelte'
  import { location } from 'svelte-spa-router'
  import ConnectBoardCard from './ConnectBoardCard.svelte'
  import LobbyIndicator from './LobbyIndicator.svelte'
  import NavBadge from './NavBadge.svelte'
  import DiscordButton from './DiscordButton.svelte'
  import ReportBugButton from './feedback/ReportBugButton.svelte'
  import NavLink from './NavLink.svelte'
  import SearchTimer from './SearchTimer.svelte'
  import { isActiveRoute, sideLinks } from '$lib/nav'
  import { NAV_ICONS, navState } from '$lib/navState'
  import { me, pendingInvites } from '$lib/lobby/sockets'

  const inviteCount = $derived(pendingInvites($me))

  const links = $derived(sideLinks($navState))
</script>

<nav
  aria-label="Main"
  class="hidden xl:flex w-[248px] shrink-0 flex-col gap-9 border-r border-line bg-surface-1 box-border h-screen p-[28px_16px]"
>
  <!-- Logo -->
  <div class="px-2"><Wordmark home /></div>

  <!-- Nav links -->
  <div class="flex flex-col gap-1">
    {#each links as link (link.href)}
      {@const active = isActiveRoute($location, link.href)}
      <NavLink href={`#${link.href}`} {active} disabled={link.disabled}>
        {@const Icon = NAV_ICONS[link.icon]}
        <Icon size={20} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
        {link.label}
        {#if link.icon === 'play'}<SearchTimer />{/if}
        {#if link.badge}
          <NavBadge count={link.badge} label={link.badgeLabel ?? ''} class="ml-auto" />
        {/if}
        {#if link.soon}
          <span
            class="ml-auto text-[11px] font-medium tracking-wordmark uppercase text-text-dim border border-line-3 rounded-[5px] px-[7px] py-[3px]"
          >
            Soon
          </span>
        {/if}
      </NavLink>
    {/each}
    {#if inviteCount > 0}
      {@const active = isActiveRoute($location, '/invites')}
      <NavLink href={hrefs.invites()} {active}>
        <Mail size={20} strokeWidth={1.8} />Invites
        <NavBadge count={inviteCount} label="{inviteCount} pending" class="ml-auto" />
      </NavLink>
    {/if}
  </div>

  <div class="mt-auto flex flex-col gap-3">
    <ConnectBoardCard />
    <DiscordButton />
    <ReportBugButton variant="row" />
    <LobbyIndicator />
  </div>
</nav>
