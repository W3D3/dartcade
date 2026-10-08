<script lang="ts">
  // Desktop: the Friends icon button beside the account in the side nav, with the request count
  // (User-Badge). It opens the Friends drawer, and is as tall as the account button beside it.
  // Its label says friends online and requests, so the badge is decoration.
  import { UsersRound } from '@lucide/svelte'
  import { location } from 'svelte-spa-router'
  import NavBadge from '../NavBadge.svelte'
  import { friendsEntry } from '$lib/nav'
  import { friendsDrawerOpen } from '$lib/friends/drawer'
  import { me } from '$lib/lobby/sockets'

  const entry = $derived(friendsEntry($me?.friends ?? null))
  const active = $derived($friendsDrawerOpen || $location === '/friends')
</script>

<button
  type="button"
  aria-label={entry.aria}
  title="Friends"
  aria-haspopup="dialog"
  aria-expanded={$friendsDrawerOpen}
  onclick={() => friendsDrawerOpen.update(o => !o)}
  class="relative shrink-0 w-11 self-stretch box-border flex items-center justify-center rounded-[10px] border cursor-pointer font-[inherit]
         {active
    ? 'border-accent-line-strong bg-accent-tint text-accent'
    : 'border-line bg-transparent text-ink-2 hover:text-text hover:bg-surface-active'}"
>
  <UsersRound size={18} strokeWidth={1.8} />
  {#if entry.requests > 0}
    <NavBadge count={entry.requests} hidden label="" class="absolute -top-1 -right-1 border-2 border-surface-1" />
  {/if}
</button>
