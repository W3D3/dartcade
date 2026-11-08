<script lang="ts">
  // One friend: avatar with a status ring, name and @handle, the status line, the action
  // (In your lobby / Join / Invite to lobby / Invited) and the ⋯ menu. Phones say "Invite" and "In lobby".
  import ProfilePopover from '../progress/ProfilePopover.svelte'
  import { Check } from '@lucide/svelte'
  import type { Friend } from '$lib/api/lobby-ws'
  import Avatar from '$lib/components/Avatar.svelte'
  import { isPhone } from '$lib/viewport'
  import { Button } from '$lib/components/ui/button/index.js'
  import FriendMenu from './FriendMenu.svelte'
  import StatusRing from './StatusRing.svelte'
  import { Eye } from '@lucide/svelte'
  import { push } from 'svelte-spa-router'
  import { flag } from '$lib/flags'
  import { statusLine, watchPath, type RowAction } from '$lib/friends/view'

  let {
    friend,
    action,
    busy,
    oninvite,
    onjoin,
    onremove,
  }: {
    friend: Friend
    action: RowAction
    busy: boolean
    oninvite: () => void
    onjoin: () => void
    onremove: () => void
  } = $props()
  const watchOn = flag('watch.enabled')
  const watch = $derived(watchPath(friend.status, $watchOn))
  const line = $derived(statusLine(friend))
  const TONE = { ink: 'text-ink-2', playing: 'text-live-text', muted: 'text-text-dim' }
</script>

<li
  class="flex items-center gap-3 md:gap-[14px] min-h-[58px] md:min-h-[68px] box-border pl-3 pr-1 md:pl-[14px] md:pr-2 rounded-lg bg-surface-panel border border-line"
>
  <span class="relative shrink-0 flex m-1">
    <Avatar name={friend.name} face={{ avatar: friend.avatar, userId: friend.id }} size={$isPhone ? 38 : 44} />
    <StatusRing kind={friend.status.kind} />
  </span>
  <span class="flex flex-col gap-[2px] md:gap-[3px] min-w-0 grow">
    <span class="flex items-baseline gap-2 min-w-0">
      <ProfilePopover userId={friend.id} name={friend.name}>
        <span class="text-[15px] md:text-[16px] font-semibold truncate">{friend.name}</span>
      </ProfilePopover>
      <span class="hidden md:inline font-mono text-[12px] text-text-dim truncate">{`@${friend.name}`}</span>
    </span>
    <span class="text-[12px] md:text-[13px] truncate {TONE[line.tone]}">{line.text}</span>
  </span>
  {#if action === 'in-lobby'}
    <span
      class="shrink-0 h-[26px] md:h-[30px] px-2 md:px-[10px] box-border flex items-center rounded-full md:bg-surface-active border border-accent-line text-accent text-[11px] md:text-[12px] font-semibold"
    >
      <span class="md:hidden">In lobby</span><span class="hidden md:inline">In your lobby</span>
    </span>
  {:else if action === 'join'}
    <Button variant="accent" disabled={busy} onclick={onjoin} class="shrink-0 h-9 px-[14px] rounded-key text-[14px]">Join</Button>
  {:else if action === 'invite'}
    <Button
      variant="outline"
      disabled={busy}
      onclick={oninvite}
      class="shrink-0 h-9 px-3 md:px-[14px] rounded-key border-line-strong text-[13px] md:text-[14px] font-semibold"
    >
      <span class="md:hidden">Invite</span><span class="hidden md:inline">Invite to lobby</span>
    </Button>
  {:else if action === 'invited'}
    <span
      class="shrink-0 h-9 px-2 md:px-3 flex items-center gap-1 md:gap-[6px] rounded-key md:bg-surface-paused text-ink-2 text-[13px] md:text-[14px]"
    >
      <Check size={16} strokeWidth={3} class="text-accent" />Invited
    </span>
  {/if}
  {#if watch}
    <Button
      variant="outline"
      onclick={() => void push(watch)}
      aria-label="Watch {friend.name}"
      class="shrink-0 h-9 px-3 md:px-[14px] rounded-key border-line-strong text-[13px] md:text-[14px] font-semibold"
      ><Eye size={15} />Watch</Button
    >
  {/if}
  <FriendMenu name={friend.name} {onremove} />
</li>
