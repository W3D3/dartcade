<script lang="ts">
  // Lobby invites at the top of the friends drawer (Lobby-Invite-Drawer): the newest one open,
  // with Decline and Join lobby; older ones as compact rows.
  import { X } from '@lucide/svelte'
  import type { PendingInvite } from '$lib/api/lobby-ws'
  import Avatar from '$lib/components/Avatar.svelte'
  import NavBadge from '$lib/components/NavBadge.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import InviteAnswer from '$lib/components/lobby/InviteAnswer.svelte'
  import InviteAvatar from '$lib/components/lobby/InviteAvatar.svelte'
  import InviteFeedback from '$lib/components/lobby/InviteFeedback.svelte'
  import { InviteActions, leavingFor } from '$lib/lobby/invites.svelte'
  import { inviteLine, inviteTime } from '$lib/lobby/format'
  import { me } from '$lib/lobby/sockets'

  /** At least one: the drawer shows this section only when there are invites. */
  let { invites, now }: { invites: PendingInvite[]; now: Date } = $props()

  const actions = new InviteActions()
  const [first, ...rest] = $derived(invites)
  const leaving = $derived(leavingFor($me?.lobby, first))
</script>

<section aria-label="Lobby invites" class="rounded-[12px] border border-line-2 bg-surface-1 px-3 pb-3">
  <div class="flex items-center gap-[10px] h-12">
    <span class="text-[15px] font-semibold">Lobby invites</span>
    <NavBadge count={invites.length} label="{invites.length} pending" hidden />
  </div>
  <ul class="m-0 p-0 list-none flex flex-col gap-2">
    <li class="p-3 rounded-[12px] border border-accent-line bg-surface-picked flex flex-col gap-[10px]">
      <div class="flex items-center gap-[10px]">
        <InviteAvatar name={first.inviter?.name ?? first.lobbyName} face={first.inviter} size={36} offset="ring-offset-surface-picked" />
        <span class="flex flex-col gap-[1px] min-w-0 flex-grow">
          <span class="font-display font-bold text-[19px] leading-none uppercase truncate">{first.lobbyName}</span>
          <span class="text-[12px] text-text-muted truncate">{[first.inviter?.name, inviteLine(first)].filter(Boolean).join(' · ')}</span>
        </span>
        <span class="self-start text-[11px] text-text-dim whitespace-nowrap">{inviteTime(first.createdAt, now)}</span>
      </div>
      {#if leaving}<span class="text-[12px] text-text-muted">Joining takes you out of <strong class="text-text">{leaving}</strong>.</span
        >{/if}
      <InviteAnswer invite={first} {actions} small />
    </li>
    {#each rest as inv (inv.id)}
      <li class="flex items-center gap-[10px] px-3 py-[10px] rounded-[12px] border border-line-2">
        <Avatar name={inv.inviter?.name ?? inv.lobbyName} face={inv.inviter} size={36} />
        <span class="flex flex-col gap-[1px] min-w-0 flex-grow">
          <span class="text-[14px] font-semibold truncate">{inv.lobbyName}</span>
          <span class="text-[12px] text-text-muted truncate"
            >{[inv.inviter?.name, inviteLine(inv), inviteTime(inv.createdAt, now)].filter(Boolean).join(' · ')}</span
          >
        </span>
        <Button
          variant="outline"
          size="icon"
          class="size-[34px] text-text-muted"
          aria-label="Decline {inv.lobbyName}"
          disabled={actions.busy}
          onclick={() => void actions.decline(inv)}><X size={16} /></Button
        >
        <Button
          variant="outline"
          class="h-[34px] px-[14px] border-line-strong font-semibold"
          disabled={actions.busy}
          onclick={() => void actions.accept(inv)}>Join</Button
        >
      </li>
    {/each}
  </ul>
  <p class="mt-2 mx-[2px] mb-0 text-[12px] text-text-dim">Invites stay here until the lobby closes.</p>
  <InviteFeedback {actions} />
</section>
