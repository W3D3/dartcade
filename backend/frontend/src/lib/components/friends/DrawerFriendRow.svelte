<script lang="ts">
  // One friend in the Friends drawer: avatar with a status ring, name, status line and the action
  // (In lobby / Join / Invite / Invited). Removing a friend stays on the Friends page.
  import ProfilePopover from '../progress/ProfilePopover.svelte'
  import { Check } from '@lucide/svelte'
  import type { Friend } from '$lib/api/lobby-ws'
  import Avatar from '$lib/components/Avatar.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
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
  }: { friend: Friend; action: RowAction; busy: boolean; oninvite: () => void; onjoin: () => void } = $props()
  const watchOn = flag('watch.enabled')
  const watch = $derived(watchPath(friend.status, $watchOn))
  const line = $derived(statusLine(friend))
  const offline = $derived(friend.status.kind === 'offline')
  const TONE = { ink: 'text-text-muted', playing: 'text-live-text', muted: 'text-text-dim' }
</script>

<li class="flex items-center gap-[10px] min-h-14 pl-[6px] pr-[10px] rounded-md hover:bg-surface-active">
  <span class="relative shrink-0 flex m-1">
    <Avatar name={friend.name} face={{ avatar: friend.avatar, userId: friend.id }} size={36} />
    <StatusRing kind={friend.status.kind} />
  </span>
  <span class="flex flex-col gap-px min-w-0 grow">
    <ProfilePopover userId={friend.id} name={friend.name}>
      <span class="text-[15px] font-semibold truncate {offline ? 'text-ink-2' : 'text-text'}">{friend.name}</span>
    </ProfilePopover>
    <span class="text-[12px] truncate {TONE[line.tone]}">{line.text}</span>
  </span>
  {#if action === 'in-lobby'}
    <span
      class="shrink-0 h-[26px] px-[9px] box-border flex items-center rounded-full border border-accent-line text-accent text-[12px] font-semibold"
      >In lobby</span
    >
  {:else if action === 'join'}
    <Button variant="accent" disabled={busy} onclick={onjoin} class="shrink-0 h-[34px] px-3 rounded-key text-[13px]">Join</Button>
  {:else if action === 'invite'}
    <Button
      variant="outline"
      disabled={busy}
      onclick={oninvite}
      aria-label="Invite {friend.name} to your lobby"
      class="shrink-0 h-[34px] px-3 rounded-key border-line-strong text-[13px] font-semibold">Invite</Button
    >
  {:else if action === 'invited'}
    <span class="shrink-0 h-[34px] px-2 flex items-center gap-1 text-ink-2 text-[13px]">
      <Check size={14} strokeWidth={3} class="text-accent" />Invited
    </span>
  {/if}
  {#if watch}
    <Button
      variant="outline"
      onclick={() => void push(watch)}
      aria-label="Watch {friend.name}"
      class="shrink-0 h-[34px] px-3 rounded-key border-line-strong text-[13px] font-semibold"><Eye size={15} />Watch</Button
    >
  {/if}
</li>
