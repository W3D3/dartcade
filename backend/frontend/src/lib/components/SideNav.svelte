<script lang="ts">
  import BrandMark from './BrandMark.svelte'
  import { Clock, Monitor, Target, Trophy } from '@lucide/svelte'
  import { location } from 'svelte-spa-router'
  import { onMount } from 'svelte'
  import { authClient, signOut } from '$lib/auth'
  import { isActiveRoute } from '$lib/nav'

  let userName = $state('…')
  let userInitial = $derived(userName.charAt(0).toUpperCase() || '?')

  onMount(async () => {
    try {
      const { data } = await authClient.getSession()
      if (data) userName = data.user.name || data.user.email || 'User'
    } catch { /* leave as placeholder */ }
  })

  const links = [
    { href: '/',            label: 'Play',         icon: 'play' },
    { href: '/boards',      label: 'Boards',       icon: 'boards' },
    { href: '/tournaments', label: 'Tournaments',  icon: 'trophy' },
    { href: '/history',     label: 'History',      icon: 'clock' },
  ]

  function isActive(href: string) {
    return isActiveRoute($location, href)
  }
</script>

<nav aria-label="Main"
  class="hidden md:flex w-[248px] flex-shrink-0 flex-col gap-9 border-r border-line bg-surface-1 box-border h-screen p-[28px_16px]">

  <!-- Logo -->
  <div class="flex items-center gap-[10px] px-2">
    <BrandMark size={28} />
    <span class="font-display font-bold text-[24px] tracking-[0.06em]">DARTCADE</span>
  </div>

  <!-- Nav links -->
  <div class="flex flex-col gap-1">
    {#each links as link (link.href)}
      {@const active = isActive(link.href)}
      <a href={`#${link.href}`}
        aria-current={active ? 'page' : undefined}
        class="flex items-center gap-3 h-11 px-3 rounded-lg no-underline text-[15px] transition-colors
               {active ? 'bg-[#22251f] text-text font-semibold' : 'text-[#c9c9bf] font-medium'}">
        {#if link.icon === 'play'}
          <Target size={20} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
        {:else if link.icon === 'boards'}
          <Monitor size={20} strokeWidth={1.8} />
        {:else if link.icon === 'trophy'}
          <Trophy size={20} strokeWidth={1.8} />
        {:else if link.icon === 'clock'}
          <Clock size={20} strokeWidth={1.8} />
        {/if}
        {link.label}
      </a>
    {/each}
  </div>

  <!-- User footer -->
  <div class="mt-auto flex items-center gap-3 p-3 border border-line rounded-[10px]">
    <span class="w-9 h-9 rounded-full bg-accent text-accent-fg flex items-center justify-center
                 font-bold text-[15px] shrink-0">
      {userInitial}
    </span>
    <div class="flex flex-col gap-[2px] flex-grow min-w-0">
      <span class="text-[14px] font-semibold truncate">{userName}</span>
      <button type="button" onclick={() => void signOut()} class="self-start p-0 bg-transparent border-0 text-[13px] text-text-muted cursor-pointer font-[inherit]">Sign out</button>
    </div>
  </div>
</nav>
