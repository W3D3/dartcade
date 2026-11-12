<script lang="ts">
  // An invite to a team, on top of the Teams tab: who invited you, the team's players, when it
  // expires, Decline and Join team.
  import { Button } from '$lib/components/ui/button/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import type { TeamInvite } from '$lib/api/lobby-ws'
  import { answerInvite } from '$lib/teams/actions'
  import { inviteSummary, inviterName } from '$lib/teams/view'
  import TeamEmblem from './TeamEmblem.svelte'

  let { invite, now, onanswered }: { invite: TeamInvite; now: Date; onanswered: () => void } = $props()

  let busy = $state(false)
  let error = $state('')

  async function answer(a: 'accept' | 'decline') {
    busy = true
    error = (await answerInvite(invite.id, a)) ?? ''
    busy = false
    if (!error) onanswered()
  }
</script>

<section
  aria-label="Invite to {invite.team.name}"
  class="flex flex-wrap items-center gap-4 rounded-popover border border-checkout-line bg-card-active px-5 py-4"
>
  <TeamEmblem tag={invite.team.tag} color={invite.team.color} size={52} />
  <span class="flex min-w-[200px] flex-1 flex-col gap-[3px]">
    <span class="text-body-lg"><b>{inviterName(invite)}</b> invited you to join <b>{invite.team.name}</b></span>
    <span class="text-small text-text-muted">{inviteSummary(invite, now)}</span>
    {#if error}<ErrorText>{error}</ErrorText>{/if}
  </span>
  <span class="flex gap-2.5">
    <Button variant="outline" size="sm" disabled={busy} onclick={() => void answer('decline')}>Decline</Button>
    <Button variant="accent" size="sm" disabled={busy} onclick={() => void answer('accept')}>Join team</Button>
  </span>
</section>
