<script lang="ts">
  // Desktop: the Friends icon button beside the account in the side nav, with the request count
  // (User-Badge). It opens the Friends drawer.
  // Its label says friends online and requests, so the badge is decoration.
  import { UsersRound } from '@lucide/svelte'
  import NavBadge from '../NavBadge.svelte'
  import { friendsDrawerOpen, friendsNav } from '$lib/friends/drawer'

  const entry = $derived($friendsNav.entry)
  const active = $derived($friendsNav.active)
</script>

<button
  type="button"
  aria-label={entry.aria}
  title="Friends"
  aria-haspopup="dialog"
  aria-expanded={$friendsDrawerOpen}
  onclick={() => friendsDrawerOpen.update(o => !o)}
  class="relative shrink-0 size-10 box-border flex items-center justify-center rounded-md border cursor-pointer
 {active
    ? 'border-accent-line-strong bg-accent-tint text-accent'
    : 'border-line bg-transparent text-ink-2 hover:text-text hover:bg-surface-active'}"
>
  <UsersRound size={18} strokeWidth={1.8} />
  {#if entry.requests > 0}
    <NavBadge count={entry.requests} hidden label="" class="absolute -top-1 -right-1 border-2 border-surface-1" />
  {/if}
</button>
