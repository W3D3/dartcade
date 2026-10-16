<script lang="ts">
  // Decline and accept for one invite (the toast, the drawer, the Invites page).
  import type { PendingInvite } from '$lib/api/lobby-ws'
  import { Button } from '$lib/components/ui/button/index.js'
  import type { InviteActions } from '$lib/lobby/invites.svelte'

  let {
    invite,
    actions,
    accept = 'Join lobby',
    small = false,
  }: { invite: PendingInvite; actions: InviteActions; accept?: string; small?: boolean } = $props()
</script>

<div class="grid grid-cols-[1fr_1.6fr] {small ? 'gap-2' : 'gap-[10px]'}">
  <Button
    variant="outline"
    class="{small ? 'h-9 text-[14px]' : 'h-[46px] text-[15px]'} border-line-strong font-semibold"
    aria-label="Decline the invite to {invite.lobbyName}"
    disabled={actions.busy}
    onclick={() => void actions.decline(invite)}>Decline</Button
  >
  <Button
    variant="accent"
    class={small ? 'h-9 text-[14px]' : 'h-[46px] text-[15px]'}
    aria-label="{accept}: {invite.lobbyName}"
    disabled={actions.busy}
    onclick={() => void actions.accept(invite)}>{accept}</Button
  >
</div>
