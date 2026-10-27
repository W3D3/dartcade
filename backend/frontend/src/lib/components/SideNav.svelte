<script lang="ts">
  import Wordmark from './Wordmark.svelte'
  import { Clock, House, Mail, Radio, Settings, ShieldCheck, Swords, Target, TrendingUp, Trophy } from '@lucide/svelte'
  import { location } from 'svelte-spa-router'
  import ConnectBoardCard from './ConnectBoardCard.svelte'
  import LobbyIndicator from './LobbyIndicator.svelte'
  import NavBadge from './NavBadge.svelte'
  import NavLink from './NavLink.svelte'
  import { isActiveRoute, sideLinks } from '$lib/nav'
  import { activeSessionId } from '$lib/activeSession'
  import { currentUser } from '$lib/auth'
  import { me } from '$lib/lobby/sockets'
  import { flag } from '$lib/flags'
  import { progress } from '$lib/progress/store'

  const inviteCount = $derived($me?.invites.length ?? 0)

  const matchmaking = flag('matchmaking.enabled')
  const progression = flag('progression.enabled')
  const home = flag('home.enabled', true)

  const links = $derived(
    sideLinks($activeSessionId, $matchmaking, $currentUser?.isModerator, $progression ? ($progress?.challengesToClaim ?? 0) : null, $home),
  )
</script>

<nav
  aria-label="Main"
  class="hidden xl:flex w-[248px] flex-shrink-0 flex-col gap-9 border-r border-line bg-surface-1 box-border h-screen p-[28px_16px]"
>
  <!-- Logo -->
  <div class="px-2"><Wordmark report /></div>

  <!-- Nav links -->
  <div class="flex flex-col gap-1">
    {#each links as link (link.href)}
      {@const active = isActiveRoute($location, link.href)}
      <NavLink href={`#${link.href}`} {active} disabled={link.disabled}>
        {#if link.icon === 'home'}
          <House size={20} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
        {:else if link.icon === 'play'}
          <Target size={20} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
        {:else if link.icon === 'ranked'}
          <Swords size={20} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
        {:else if link.icon === 'live'}
          <Radio size={20} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
        {:else if link.icon === 'tournaments'}
          <Trophy size={20} strokeWidth={1.8} />
        {:else if link.icon === 'progress'}
          <TrendingUp size={20} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
        {:else if link.icon === 'history'}
          <Clock size={20} strokeWidth={1.8} />
        {:else if link.icon === 'settings'}
          <Settings size={20} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
        {:else if link.icon === 'admin'}
          <ShieldCheck size={20} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
        {/if}
        {link.label}
        {#if link.icon === 'live' && !link.disabled}
          <span class="ml-auto w-2 h-2 rounded-full bg-live" aria-hidden="true"></span>
        {/if}
        {#if link.badge}
          <NavBadge count={link.badge} label={link.badgeLabel ?? ''} class="ml-auto" />
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
