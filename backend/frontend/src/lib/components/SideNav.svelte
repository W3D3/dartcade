<script lang="ts">
  import { location } from 'svelte-spa-router'
  import { onMount } from 'svelte'

  let userName = $state('…')
  let userInitial = $derived(userName?.[0]?.toUpperCase() ?? '?')

  onMount(async () => {
    try {
      const res = await fetch('/api/auth/get-session')
      if (res.ok) {
        const d = await res.json()
        userName = d.user?.name ?? d.user?.email ?? 'User'
      }
    } catch { /* leave as placeholder */ }
  })

  const links = [
    { href: '/',            label: 'Play',         icon: 'play' },
    { href: '/boards',      label: 'Boards',       icon: 'boards' },
    { href: '/tournaments', label: 'Tournaments',  icon: 'trophy' },
    { href: '/history',     label: 'History',      icon: 'clock' },
  ]

  function isActive(href: string) {
    return $location === href || ($location === '' && href === '/')
  }
</script>

<nav aria-label="Main"
  class="flex w-[248px] flex-shrink-0 flex-col gap-9 border-r border-line bg-surface-1 box-border h-screen p-[28px_16px]">

  <!-- Logo -->
  <div class="flex items-center gap-[10px] px-2">
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="none" stroke="#c6f24e" stroke-width="2.5"/>
      <circle cx="16" cy="16" r="7.5" fill="none" stroke="#c6f24e" stroke-width="2.5"/>
      <circle cx="16" cy="16" r="2.5" fill="#c6f24e"/>
    </svg>
    <span class="font-display font-bold text-[24px] tracking-[0.06em]">DARTCADE</span>
  </div>

  <!-- Nav links -->
  <div class="flex flex-col gap-1">
    {#each links as link}
      {@const active = isActive(link.href)}
      <a href={`#${link.href}`}
        aria-current={active ? 'page' : undefined}
        class="flex items-center gap-3 h-11 px-3 rounded-lg no-underline text-[15px] transition-colors
               {active ? 'bg-[#22251f] text-text font-semibold' : 'text-[#c9c9bf] font-medium'}">
        {#if link.icon === 'play'}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke={active ? '#c6f24e' : 'currentColor'} stroke-width="1.8" aria-hidden="true">
            <circle cx="12" cy="12" r="9"/>
            <circle cx="12" cy="12" r="5"/>
            <circle cx="12" cy="12" r="1.5"/>
          </svg>
        {:else if link.icon === 'boards'}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="13" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
          </svg>
        {:else if link.icon === 'trophy'}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6"/>
          </svg>
        {:else if link.icon === 'clock'}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 7v5l3 2"/>
          </svg>
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
      <a href="#/login" class="text-[13px] text-text-muted no-underline">Sign out</a>
    </div>
  </div>
</nav>
