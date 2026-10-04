<script lang="ts">
  import BrandMark from './BrandMark.svelte'
  import { Clock, Mail, Monitor, Settings, Target, Trophy } from '@lucide/svelte'
  import { location } from 'svelte-spa-router'
  import { currentUser, signOut } from '$lib/auth'
  import DevUserSwitch from './DevUserSwitch.svelte'
  import LobbyIndicator from './LobbyIndicator.svelte'
  import NavBadge from './NavBadge.svelte'
  import NavLink from './NavLink.svelte'
  import { isActiveRoute } from '$lib/nav'
  import { me } from '$lib/lobby/sockets'

  const userName = $derived($currentUser?.name ?? '')
  const userInitial = $derived(userName.charAt(0).toUpperCase())
  const inviteCount = $derived($me?.invites.length ?? 0)

  const links = [
    { href: '/',            label: 'Play',         icon: 'play' },
    { href: '/boards',      label: 'Boards',       icon: 'boards' },
    { href: '/tournaments', label: 'Tournaments',  icon: 'trophy' },
    { href: '/history',     label: 'History',      icon: 'clock' },
    { href: '/settings',    label: 'Settings',     icon: 'settings' },
  ]

  function isActive(href: string) {
    return isActiveRoute($location, href)
  }
</script>

<nav aria-label="Main"
  class="hidden xl:flex w-[248px] flex-shrink-0 flex-col gap-9 border-r border-line bg-surface-1 box-border h-screen p-[28px_16px]">

  <!-- Logo -->
  <div class="flex items-center gap-[10px] px-2">
    <BrandMark size={28} />
    <span class="font-display font-bold text-[24px] tracking-[0.06em]">DARTCADE</span>
  </div>

  <!-- Nav links -->
  <div class="flex flex-col gap-1">
    {#each links as link (link.href)}
      {@const active = isActive(link.href)}
      <NavLink href={`#${link.href}`} {active}>
        {#if link.icon === 'play'}
          <Target size={20} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
        {:else if link.icon === 'boards'}
          <Monitor size={20} strokeWidth={1.8} />
        {:else if link.icon === 'trophy'}
          <Trophy size={20} strokeWidth={1.8} />
        {:else if link.icon === 'clock'}
          <Clock size={20} strokeWidth={1.8} />
        {:else if link.icon === 'settings'}
          <Settings size={20} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
        {/if}
        {link.label}
      </NavLink>
    {/each}
    {#if inviteCount > 0}
      {@const active = isActive('/invites')}
      <NavLink href="#/invites" {active}>
        <Mail size={20} strokeWidth={1.8} />Invites
        <NavBadge count={inviteCount} label="{inviteCount} pending" class="ml-auto" />
      </NavLink>
    {/if}
  </div>

  <div class="mt-auto flex flex-col gap-4">
  <LobbyIndicator />
  {#if import.meta.env.DEV}
    <DevUserSwitch label="Dev: switch to" />
  {/if}

  <!-- User footer -->
  <div class="flex items-center gap-3 p-3 border border-line rounded-[10px]">
    <span class="w-9 h-9 rounded-full bg-accent text-accent-fg flex items-center justify-center
                 font-bold text-[15px] shrink-0">
      {userInitial}
    </span>
    <div class="flex flex-col gap-[2px] flex-grow min-w-0">
      <span class="text-[14px] font-semibold truncate">{userName}</span>
      <button type="button" onclick={() => void signOut()} class="self-start p-0 bg-transparent border-0 text-[13px] text-text-muted cursor-pointer font-[inherit]">Sign out</button>
    </div>
  </div>
  </div>
</nav>
