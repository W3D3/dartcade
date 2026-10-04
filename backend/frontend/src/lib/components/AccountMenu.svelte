<script lang="ts">
  // Who's signed in, Friends, Settings and signing out: the avatar in the phone header (below it) or
  // at the foot of the tablet rail (beside it) opens it. Phones reach Friends here, so the header
  // avatar carries the friend request count.
  import { LogOut, Settings, UsersRound } from '@lucide/svelte'
  import { currentUser, signOut } from '$lib/auth'
  import { friendsEntry } from '$lib/nav'
  import { me } from '$lib/lobby/sockets'
  import DevUserSwitch from './DevUserSwitch.svelte'
  import NavBadge from './NavBadge.svelte'

  let { placement = 'header' }: { placement?: 'header' | 'rail' } = $props()

  const name = $derived($currentUser?.name ?? '')
  const email = $derived($currentUser?.email ?? '')
  let open = $state(false)
  const initial = $derived(name.trim().charAt(0).toUpperCase() || '?')
  const friends = $derived(friendsEntry($me?.friends ?? null))
  const requestsText = (n: number) => `${n} friend ${n === 1 ? 'request' : 'requests'}`

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false
  }

</script>

<svelte:window onkeydown={onKeydown} />

<div class="relative shrink-0">
  <button type="button" onclick={() => open = !open} aria-label={`Account${name ? `: ${name}` : ''}${placement === 'header' && friends.requests ? `, ${requestsText(friends.requests)}` : ''}`}
    aria-haspopup="menu" aria-expanded={open}
    class="relative {placement === 'rail' ? 'w-14 h-14 rounded-[12px]' : 'w-11 h-11'} flex items-center justify-center bg-transparent border-0 cursor-pointer">
    <span class="{placement === 'rail' ? 'w-10 h-10 text-[17px]' : 'w-9 h-9 text-[15px]'} rounded-full bg-accent text-accent-fg flex items-center justify-center font-bold">{initial}</span>
    {#if placement === 'header' && friends.requests > 0}<NavBadge count={friends.requests} hidden label="" class="absolute top-0 right-0 border-2 border-surface-1" />{/if}
  </button>
  {#if open}
    <div class="fixed inset-0 z-40" onclick={() => open = false} aria-hidden="true"></div>
    <div role="menu" class="{placement === 'rail' ? 'fixed left-24 bottom-4 w-[296px]' : 'absolute right-0 top-full mt-2 w-[min(280px,calc(100vw-32px))]'} z-50 box-border p-3 rounded-[14px]
                bg-surface-2 border border-line-3 [box-shadow:0_16px_40px_rgba(0,0,0,0.5)] flex flex-col gap-3">
      <div class="flex items-center gap-3 min-w-0">
        <span class="w-10 h-10 shrink-0 rounded-full bg-accent text-accent-fg flex items-center justify-center font-bold text-[16px]">{initial}</span>
        <span class="flex flex-col gap-[2px] min-w-0">
          <span class="text-[15px] font-semibold truncate">{name || '…'}</span>
          {#if email && email !== name}<span class="text-[13px] text-text-muted truncate">{email}</span>{/if}
        </span>
      </div>
      <a href="#/friends" role="menuitem" onclick={() => open = false}
        class="h-11 flex items-center gap-3 px-3 rounded-[10px] text-text no-underline text-[15px] font-medium hover:bg-surface-hover hover:text-text">
        <UsersRound size={18} strokeWidth={1.8} />
        Friends
        <span class="ml-auto text-[13px] text-text-muted">{friends.online} online</span>
        {#if friends.requests > 0}<NavBadge count={friends.requests} label={requestsText(friends.requests)} />{/if}
      </a>
      <a href="#/settings" role="menuitem" onclick={() => open = false}
        class="h-11 flex items-center gap-3 px-3 rounded-[10px] text-text no-underline text-[15px] font-medium hover:bg-surface-hover hover:text-text">
        <Settings size={18} strokeWidth={1.8} />
        Settings
      </a>
      <button type="button" role="menuitem" onclick={() => void signOut()}
        class="h-11 flex items-center justify-center gap-2 rounded-[10px] border border-line-3 bg-transparent text-live-text text-[15px] font-medium cursor-pointer">
        <LogOut size={17} />
        Sign out
      </button>
      {#if import.meta.env.DEV}
        <DevUserSwitch label="Dev: switch to" />
      {/if}
    </div>
  {/if}
</div>
