<script lang="ts">
  // A host's ask to take over a guest seat (Invites page): who asks, the game, the seat's name and
  // place. Accepting makes the game yours; nothing changes before.
  import ErrorText from '$lib/components/ErrorText.svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import type { GuestClaimInvite } from '$lib/api/lobby-ws'
  import { answerClaim } from '$lib/guestClaims/actions'
  import { gameLine, inviteTitle, placeText } from '$lib/guestClaims/view'

  let { invite }: { invite: GuestClaimInvite } = $props()

  let busy = $state(false)
  let error = $state('')

  async function answer(a: 'accept' | 'decline') {
    busy = true
    error = (await answerClaim(invite.id, a)) ?? ''
    busy = false
  }
</script>

<li class="flex flex-col gap-3 p-4 card rounded-popover" aria-label="Claim {invite.seatName}">
  <div class="flex items-center gap-3">
    <Avatar name={invite.host.name} face={{ avatar: invite.host.avatar, userId: invite.host.id }} size={40} />
    <div class="flex min-w-0 grow flex-col gap-0.5">
      <span class="text-body-lg font-semibold">{inviteTitle(invite)}</span>
      <span class="text-small text-text-muted">
        {gameLine(invite)}{placeText(invite.placement) ? ` · ${placeText(invite.placement)} place` : ''}
      </span>
    </div>
  </div>
  <p class="text-small text-text-muted">Take over this seat and the game shows in your history and stats, as if you had played it.</p>
  {#if error}<ErrorText>{error}</ErrorText>{/if}
  <div class="flex gap-2.5">
    <Button variant="outline" size="sm" disabled={busy} onclick={() => void answer('decline')}>Decline</Button>
    <Button variant="accent" size="sm" disabled={busy} onclick={() => void answer('accept')}>Take over</Button>
  </div>
</li>
