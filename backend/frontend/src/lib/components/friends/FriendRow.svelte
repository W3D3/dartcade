<script lang="ts">
  // One friend: avatar with status dot, name and @handle, the status line, the action
  // (In your lobby / Join / Invite to lobby / Invited) and the ⋯ menu. Phones say "Invite" and "In lobby".
  import { Check } from '@lucide/svelte'
  import type { Friend } from '$lib/api/lobby-ws'
  import Avatar from '$lib/components/Avatar.svelte'
  import { isPhone } from '$lib/viewport'
  import { Button } from '$lib/components/ui/button/index.js'
  import FriendMenu from './FriendMenu.svelte'
  import StatusDot from './StatusDot.svelte'
  import { statusLine, type RowAction } from '$lib/friends/view'

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
  const line = $derived(statusLine(friend))
  const TONE = { ink: 'text-ink-2', playing: 'text-live-text', muted: 'text-text-dim' }
</script>

<li
  class="flex items-center gap-3 md:gap-[14px] min-h-[58px] md:min-h-[68px] box-border pl-3 pr-1 md:pl-[14px] md:pr-2 rounded-[12px] bg-surface-panel border border-line"
>
  <span class="relative shrink-0 flex">
    <Avatar name={friend.name} size={$isPhone ? 38 : 44} />
    <StatusDot kind={friend.status.kind} class="absolute -right-[2px] -bottom-[2px]" />
  </span>
  <span class="flex flex-col gap-[2px] md:gap-[3px] min-w-0 flex-grow">
    <span class="flex items-baseline gap-2 min-w-0">
      <span class="text-[15px] md:text-[16px] font-semibold truncate">{friend.name}</span>
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
    <Button variant="accent" disabled={busy} onclick={onjoin} class="shrink-0 h-9 px-[14px] rounded-[9px] text-[14px]">Join</Button>
  {:else if action === 'invite'}
    <Button
      variant="outline"
      disabled={busy}
      onclick={oninvite}
      class="shrink-0 h-9 px-3 md:px-[14px] rounded-[9px] border-line-strong text-[13px] md:text-[14px] font-semibold"
    >
      <span class="md:hidden">Invite</span><span class="hidden md:inline">Invite to lobby</span>
    </Button>
  {:else if action === 'invited'}
    <span
      class="shrink-0 h-9 px-2 md:px-3 flex items-center gap-1 md:gap-[6px] rounded-[9px] md:bg-surface-paused text-ink-2 text-[13px] md:text-[14px]"
    >
      <Check size={16} strokeWidth={3} class="text-accent" />Invited
    </span>
  {/if}
  <FriendMenu name={friend.name} {onremove} />
</li>
