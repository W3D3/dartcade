<script lang="ts">
  // The tablet's main navigation (md up to xl): an 88 px icon rail with the phone's tabs, Settings
  // and Admin, the Lobby item, Friends and the avatar that opens the account menu. Desktops get
  // SideNav instead.
  import { progress } from '$lib/progress/store'
  import { location, push } from 'svelte-spa-router'
  import { Plus, House, Swords } from '@lucide/svelte'
  import { railTabs, isActiveRoute, railLobby } from '$lib/nav'
  import { currentUser } from '$lib/auth'
  import { me } from '$lib/lobby/sockets'
  import { flag } from '$lib/flags'
  import { createLobby } from '$lib/lobby/create'
  import { acceptMatch } from '$lib/ranked/queue'
  import { queueView } from '$lib/ranked/queueCard'
  import { tick } from '$lib/ranked/tick'
  import AccountMenu from './AccountMenu.svelte'
  import BrandMark from './BrandMark.svelte'
  import AlphaBadge from './feedback/AlphaBadge.svelte'
  import PreviewBadge from './PreviewBadge.svelte'
  import FriendsNavItem from './friends/FriendsNavItem.svelte'
  import NavTabItem from './NavTabItem.svelte'

  const matchmaking = flag('matchmaking.enabled')
  const progression = flag('progression.enabled')
  const home = flag('home.enabled', true)
  const coach = flag('coach.enabled')
  const stats = flag('stats.enabled')
  const tabs = $derived(
    railTabs(
      $me?.invites.length ?? 0,
      $matchmaking,
      $progression ? ($progress?.challengesToClaim ?? 0) : null,
      $currentUser?.isModerator ?? false,
      $home,
      $coach,
      $stats,
    ),
  )
  const queue = $derived(queueView($me?.matchmaking ?? null, $currentUser?.id ?? null, $tick))
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
  <div class="shrink-0 flex flex-col items-center gap-2">
    <BrandMark size={28} />
    <AlphaBadge interactive />
    <PreviewBadge />
  </div>
  <div class="shrink-0 flex flex-col gap-1">
    {#each tabs as tab (tab.href)}
      <NavTabItem {tab} active={isActiveRoute($location, tab.href)} class="w-[72px] h-16" />
    {/each}
  </div>

  <div class="mt-auto shrink-0 flex flex-col items-center gap-[10px]">
    {#if queue}
      <!-- Searching shows the timer; a found match turns the tile into the Accept button -->
      {#if queue.kind === 'found' && queue.matchId}
        {@const id = queue.matchId}
        <button
          type="button"
          onclick={() => void acceptMatch(id)}
          aria-label="Match found: accept, {queue.clock} left"
          class="flex h-16 w-[72px] cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border-0 bg-accent font-display text-[16px] font-bold uppercase text-accent-fg"
          >Accept<span class="font-mono text-[12px] font-medium">{queue.clock}</span></button
        >
      {:else}
        <a
          href="#/matchmaking"
          aria-label="{queue.tag}, {queue.name}. {queue.clock}"
          class="relative box-border flex h-16 w-[72px] flex-col items-center justify-center gap-1 rounded-[10px] border border-accent-line-strong bg-surface-active text-accent no-underline"
        >
          <span class="absolute top-2 right-[10px] h-2 w-2 rounded-full bg-accent motion-safe:animate-pulse" aria-hidden="true"></span>
          <Swords size={22} strokeWidth={1.8} />
          <span class="font-mono text-[12px] text-text">{queue.clock}</span>
        </a>
      {/if}
    {:else if lobby?.kind === 'create'}
      <button
        type="button"
        aria-label={lobby.aria}
        title={error || undefined}
        disabled={busy}
        onclick={() => void create()}
        class="w-[72px] h-[60px] box-border flex flex-col items-center justify-center gap-1 rounded-[10px]
 border border-dashed text-accent text-[11px] font-semibold
 cursor-pointer disabled:opacity-60 {error ? 'border-live' : 'border-accent-line-strong'}"
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
               border text-text {active ? 'bg-surface-paused border-accent' : 'bg-surface-active border-accent-line'}"
      >
        <span class="absolute top-2 right-[10px] w-2 h-2 rounded-full bg-accent animate-pulse motion-reduce:animate-none" aria-hidden="true"
        ></span>
        <House size={22} strokeWidth={1.8} class="text-accent" />
        <span class="max-w-full truncate">{lobbyLink.label}</span>
      </a>
    {/if}
    <FriendsNavItem />
    <AccountMenu placement="rail" />
  </div>
</nav>
