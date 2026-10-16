<script lang="ts">
  // One pending invite (Invites-Phone): the lobby, who hosts it and when you were invited, its
  // boards and people, Decline and Accept.
  import { MonitorSmartphone, Users } from '@lucide/svelte'
  import type { PendingInvite } from '$lib/api/lobby-ws'
  import Avatar from '$lib/components/Avatar.svelte'
  import InviteAnswer from './InviteAnswer.svelte'
  import type { InviteActions } from '$lib/lobby/invites.svelte'
  import { inviteLine, inviteTime } from '$lib/lobby/format'

  let { invite, now, actions }: { invite: PendingInvite; now: Date; actions: InviteActions } = $props()
</script>

<li class="flex flex-col gap-3 p-4 card rounded-[16px]">
  <div class="flex items-center gap-3">
    <Avatar name={invite.inviterName ?? invite.lobbyName} size={40} />
    <div class="flex flex-col gap-[2px] flex-grow min-w-0">
      <span class="text-[18px] font-semibold truncate">{invite.lobbyName}</span>
      <span class="text-[13px] text-text-muted truncate">{invite.hostName ? `Hosted by ${invite.hostName}` : 'Invited'}</span>
    </div>
    <span class="self-start text-[12px] text-text-dim shrink-0">{inviteTime(invite.createdAt, now)}</span>
  </div>
  <div class="flex flex-col gap-[6px] px-3 py-[10px] rounded-[10px] bg-bg border border-line text-[13px] text-text-muted">
    {#if invite.boardNames.length > 0}
      <span class="flex items-center gap-2 min-w-0">
        <MonitorSmartphone size={15} class="shrink-0" aria-hidden="true" /><span class="truncate">{invite.boardNames.join(', ')}</span>
      </span>
    {/if}
    <span class="flex items-center gap-2 min-w-0">
      <Users size={15} class="shrink-0" aria-hidden="true" /><span class="truncate">{inviteLine(invite)}</span>
    </span>
  </div>
  <InviteAnswer {invite} {actions} accept="Accept" />
</li>
