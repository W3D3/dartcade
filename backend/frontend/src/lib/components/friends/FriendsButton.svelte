<script lang="ts">
  // Desktop: the Friends icon button beside the account in the side nav, with the request count
  // (User-Badge). Its label says friends online and requests, so the badge is decoration.
  import { UsersRound } from '@lucide/svelte'
  import { location } from 'svelte-spa-router'
  import NavBadge from '../NavBadge.svelte'
  import { friendsEntry } from '$lib/nav'
  import { me } from '$lib/lobby/sockets'

  const entry = $derived(friendsEntry($me?.friends ?? null))
  const active = $derived($location === '/friends')
</script>

<a href="#/friends" aria-label={entry.aria} title="Friends" aria-current={active ? 'page' : undefined}
  class="relative shrink-0 w-[38px] h-[38px] box-border flex items-center justify-center rounded-[9px] border no-underline
         {active ? 'border-accent-line-strong bg-accent-tint text-accent hover:text-accent' : 'border-line-chip text-ink-2 hover:text-text'}">
  <UsersRound size={18} strokeWidth={1.8} />
  {#if entry.requests > 0}
    <NavBadge count={entry.requests} hidden label="" class="absolute -top-1 -right-1 border-2 border-surface-1" />
  {/if}
</a>
