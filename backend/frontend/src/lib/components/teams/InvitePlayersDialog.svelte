<script lang="ts">
  // Invite players from a team's page: the same picker as New team, each Invite sent at once.
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { plural } from '$lib/fmt'
  import { invitePlayer, type Team } from '$lib/teams/actions'
  import { placesLeft, type PickerPerson } from '$lib/teams/view'
  import { TEAM_LIMITS } from '$shared/teams.js'
  import TeamInvitePicker from './TeamInvitePicker.svelte'

  let { team, onclose, oninvited }: { team: Team; onclose: () => void; oninvited: () => void } = $props()

  let sent = $state<string[]>([])
  let error = $state('')
  const left = $derived(placesLeft(team, TEAM_LIMITS.maxPlayers) - sent.length)

  async function invite(userId: string) {
    error = (await invitePlayer(team.id, userId)) ?? ''
    if (error) return
    sent = [...sent, userId]
    oninvited()
  }
</script>

<Modal title="Invite players" subtitle="{team.name} · {plural(left, 'place')} left" {onclose} widthClass="md:max-w-[520px]">
  {#if left > 0}
    <TeamInvitePicker
      exclude={[...team.members.map(m => m.user.id), ...team.invites.map(i => i.user.id), ...sent]}
      onpick={(p: PickerPerson) => void invite(p.id)}
    />
  {:else}
    <p class="text-body text-text-muted">The team is full: {TEAM_LIMITS.maxPlayers} players, invites included.</p>
  {/if}
  {#if error}<ErrorText>{error}</ErrorText>{/if}
  {#if sent.length > 0}<p class="text-small text-text-muted" role="status">{plural(sent.length, 'invite')} sent.</p>{/if}
</Modal>
