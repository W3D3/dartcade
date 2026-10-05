<script lang="ts">
  // The tablet's main navigation (md up to xl): an 88 px icon rail with the phone's tabs, the
  // Lobby item, Friends and the avatar that opens the account menu. Desktops get SideNav instead.
  import { location, push } from 'svelte-spa-router'
  import { Plus, Users, House } from '@lucide/svelte'
  import { navTabs, isActiveRoute, railLobby } from '$lib/nav'
  import { activeSessionId } from '$lib/activeSession'
  import { me } from '$lib/lobby/sockets'
  import { createLobby } from '$lib/lobby/create'
  import AccountMenu from './AccountMenu.svelte'
  import BrandMark from './BrandMark.svelte'
  import FriendsNavItem from './friends/FriendsNavItem.svelte'
  import NavTabItem from './NavTabItem.svelte'

  const tabs = $derived(navTabs($activeSessionId, $me?.invites.length ?? 0))
  const lobby = $derived(railLobby($me?.lobby ?? null, $me !== null))
  const lobbyLink = $derived(lobby && lobby.kind !== 'create' ? lobby : null)
  let error = $state('')
  let busy = $state(false)

  async function create() {
    if (busy) return
    busy = true
    try {
      const created = await createLobby()
      if (created.ok) {
        error = ''
        void push('/lobby')
      } else error = created.message
    } finally {
      busy = false
    }
  }
</script>

<nav
  aria-label="Main"
  class="hidden md:flex xl:hidden w-[88px] shrink-0 box-border h-dvh overflow-y-auto overflow-x-hidden flex-col items-center gap-6 pt-5 px-2 pb-4
         border-r border-line bg-surface-1"
>
  <BrandMark size={28} />
  <div class="shrink-0 flex flex-col gap-1">
    {#each tabs as tab (tab.href)}
      <NavTabItem {tab} active={isActiveRoute($location, tab.href)} class="w-[72px] h-16" />
    {/each}
  </div>

  <div class="mt-auto shrink-0 flex flex-col items-center gap-[10px]">
    {#if lobby?.kind === 'create'}
      <button
        type="button"
        aria-label={lobby.aria}
        title={error || undefined}
        disabled={busy}
        onclick={() => void create()}
        class="w-[72px] h-[60px] box-border flex flex-col items-center justify-center gap-1 rounded-[10px]
               border border-dashed bg-transparent text-accent text-[11px] font-semibold
               cursor-pointer font-[inherit] disabled:opacity-60 {error ? 'border-live' : 'border-accent-line-strong'}"
      >
        <Plus size={20} strokeWidth={2.4} />{lobby.label}
      </button>
      {#if error}<span role="alert" title={error} class="w-[72px] text-center text-[10px] leading-[1.3] text-live-text line-clamp-4"
          >{error}</span
        >{/if}
    {:else if lobbyLink}
      {@const active = isActiveRoute($location, lobbyLink.href)}
      <a
        href={`#${lobbyLink.href}`}
        aria-label={lobbyLink.aria}
        aria-current={active ? 'page' : undefined}
        class="relative w-[72px] h-16 box-border px-1 flex flex-col items-center justify-center gap-1 rounded-[10px]
               no-underline text-[11px] font-semibold
               {lobbyLink.kind === 'in'
          ? `border text-text ${active ? 'bg-surface-paused border-accent' : 'bg-surface-active border-accent-line'}`
          : `border ${active ? 'bg-surface-paused border-transparent text-text' : 'border-line-chip text-ink-2'}`}"
      >
        {#if lobbyLink.kind === 'in'}
          <span
            class="absolute top-2 right-[10px] w-2 h-2 rounded-full bg-accent animate-pulse motion-reduce:animate-none"
            aria-hidden="true"
          ></span>
          <House size={22} strokeWidth={1.8} class="text-accent" />
        {:else}
          <Users size={20} strokeWidth={1.8} />
        {/if}
        <span class="max-w-full truncate">{lobbyLink.label}</span>
      </a>
    {/if}
    <FriendsNavItem />
    <AccountMenu placement="rail" />
  </div>
</nav>
