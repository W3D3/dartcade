<script lang="ts">
  // One pending invite (Invites-Phone): the lobby, who invited you and when, Decline and Accept.
  import type { PendingInvite } from '$lib/api/lobby-ws'
  import { Button } from '$lib/components/ui/button/index.js'
  import Avatar from '$lib/components/Avatar.svelte'
  import { inviteTime } from '$lib/lobby/format'

  let {
    invite,
    now,
    busy = false,
    onaccept,
    ondecline,
  }: {
    invite: PendingInvite
    now: Date
    /** An accept or decline is in flight. */
    busy?: boolean
    onaccept: () => void
    ondecline: () => void
  } = $props()
</script>

<li class="flex flex-col gap-3 p-[14px] card">
  <div class="flex items-center gap-3">
    <Avatar name={invite.inviterName ?? invite.lobbyName} size={40} />
    <div class="flex flex-col gap-[2px] flex-grow min-w-0">
      <span class="text-[17px] font-semibold truncate">{invite.lobbyName}</span>
      <span class="text-[13px] text-text-muted truncate">{invite.inviterName ? `Invited by ${invite.inviterName}` : 'Invited'}</span>
    </div>
    <span class="text-[12px] text-text-dim shrink-0">{inviteTime(invite.createdAt, now)}</span>
  </div>
  <div class="grid grid-cols-2 gap-2">
    <Button
      variant="outline"
      class="h-[46px] font-semibold text-[15px]"
      aria-label="Decline the invite to {invite.lobbyName}"
      disabled={busy}
      onclick={ondecline}>Decline</Button
    >
    <Button variant="accent" class="h-[46px]" aria-label="Accept the invite to {invite.lobbyName}" disabled={busy} onclick={onaccept}
      >Accept</Button
    >
  </div>
</li>
