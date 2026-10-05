<script lang="ts">
  // Tablet rail: Friends with the request count, above the avatar (Tablet-Friends). Its label says
  // friends online and requests, so the badge is decoration.
  import { UsersRound } from '@lucide/svelte'
  import { location } from 'svelte-spa-router'
  import NavBadge from '../NavBadge.svelte'
  import { friendsEntry } from '$lib/nav'
  import { me } from '$lib/lobby/sockets'

  const entry = $derived(friendsEntry($me?.friends ?? null))
  const active = $derived($location === '/friends')
</script>

<a
  href="#/friends"
  aria-label={entry.aria}
  aria-current={active ? 'page' : undefined}
  class="relative w-[72px] h-14 box-border flex flex-col items-center justify-center gap-[3px] rounded-[10px] border no-underline text-[11px] font-semibold
         {active
    ? 'bg-accent-tint border-accent-line-strong text-accent hover:text-accent'
    : 'border-transparent text-text-muted hover:text-text'}"
>
  <UsersRound size={18} strokeWidth={1.8} />
  Friends
  {#if entry.requests > 0}
    <NavBadge count={entry.requests} hidden label="" class="absolute top-1 right-3 border-2 border-surface-1" />
  {/if}
</a>
