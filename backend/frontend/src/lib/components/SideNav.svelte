<script lang="ts">
  import BrandMark from './BrandMark.svelte'
  import PreviewBadge from './PreviewBadge.svelte'
  import { Clock, Mail, Radio, Settings, Swords, Target, Trophy } from '@lucide/svelte'
  import { location } from 'svelte-spa-router'
  import ConnectBoardCard from './ConnectBoardCard.svelte'
  import LobbyIndicator from './LobbyIndicator.svelte'
  import NavBadge from './NavBadge.svelte'
  import NavLink from './NavLink.svelte'
  import { isActiveRoute, sideLinks } from '$lib/nav'
  import { activeSessionId } from '$lib/activeSession'
  import { me } from '$lib/lobby/sockets'
  import { flag } from '$lib/flags'

  const inviteCount = $derived($me?.invites.length ?? 0)

  const matchmaking = flag('matchmaking.enabled')

  const links = $derived(sideLinks($activeSessionId, $matchmaking))
</script>

<nav
  aria-label="Main"
  class="hidden xl:flex w-[248px] flex-shrink-0 flex-col gap-9 border-r border-line bg-surface-1 box-border h-screen p-[28px_16px]"
>
  <!-- Logo -->
  <div class="flex items-center gap-[10px] px-2">
    <BrandMark size={28} />
    <span class="font-display font-bold text-[24px] tracking-[0.06em]">DARTCADE</span>
    <PreviewBadge />
  </div>

  <!-- Nav links -->
  <div class="flex flex-col gap-1">
    {#each links as link (link.href)}
      {@const active = isActiveRoute($location, link.href)}
      <NavLink href={`#${link.href}`} {active} disabled={link.disabled}>
        {#if link.icon === 'play'}
          <Target size={20} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
        {:else if link.icon === 'ranked'}
          <Swords size={20} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
        {:else if link.icon === 'live'}
          <Radio size={20} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
        {:else if link.icon === 'tournaments'}
          <Trophy size={20} strokeWidth={1.8} />
        {:else if link.icon === 'history'}
          <Clock size={20} strokeWidth={1.8} />
        {:else if link.icon === 'settings'}
          <Settings size={20} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
        {/if}
        {link.label}
        {#if link.icon === 'live' && !link.disabled}
          <span class="ml-auto w-2 h-2 rounded-full bg-live" aria-hidden="true"></span>
        {/if}
        {#if link.soon}
          <span
            class="ml-auto text-[11px] font-medium tracking-[0.06em] uppercase text-text-dim border border-line-3 rounded-[5px] px-[7px] py-[3px]"
          >
            Soon
          </span>
        {/if}
      </NavLink>
    {/each}
    {#if inviteCount > 0}
      {@const active = isActiveRoute($location, '/invites')}
      <NavLink href="#/invites" {active}>
        <Mail size={20} strokeWidth={1.8} />Invites
        <NavBadge count={inviteCount} label="{inviteCount} pending" class="ml-auto" />
      </NavLink>
    {/if}
  </div>

  <div class="mt-auto flex flex-col gap-3">
    <ConnectBoardCard />
    <LobbyIndicator />
  </div>
</nav>
