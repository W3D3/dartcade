<script lang="ts">
  // Tablet rail: Friends with the request count, above the avatar (Tablet-Friends). It opens the
  // Friends drawer beside the rail. Its label says friends online and requests, so the badge is
  // decoration.
  import { UsersRound } from '@lucide/svelte'
  import NavBadge from '../NavBadge.svelte'
  import { friendsDrawerOpen, friendsNav } from '$lib/friends/drawer'

  const entry = $derived($friendsNav.entry)
  const active = $derived($friendsNav.active)
</script>

<button
  type="button"
  aria-label={entry.aria}
  aria-haspopup="dialog"
  aria-expanded={$friendsDrawerOpen}
  onclick={() => friendsDrawerOpen.update(o => !o)}
  class="relative w-[72px] h-14 box-border flex flex-col items-center justify-center gap-[3px] rounded-md border cursor-pointer text-[11px] font-semibold
 {active ? 'bg-accent-tint border-accent-line-strong text-accent' : 'bg-transparent border-transparent text-text-muted hover:text-text'}"
>
  <UsersRound size={18} strokeWidth={1.8} />
  Friends
  {#if entry.requests > 0}
    <NavBadge count={entry.requests} hidden label="" class="absolute top-1 right-3 border-2 border-surface-1" />
  {/if}
</button>
