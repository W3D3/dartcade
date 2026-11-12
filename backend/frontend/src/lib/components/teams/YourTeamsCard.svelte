<script lang="ts">
  // "Your teams" on the Browse tab (Tournaments board): each team with your role and its players,
  // an invite waiting for you, and Manage › to the Teams tab. Hidden while you have neither.
  import { Users } from '@lucide/svelte'
  import { currentUser } from '$lib/auth'
  import FaceStack from '$lib/components/FaceStack.svelte'
  import { plural } from '$lib/fmt'
  import { me } from '$lib/lobby/sockets'
  import { hrefs } from '$lib/routes'
  import { loadTeams, type Team } from '$lib/teams/actions'
  import { inviterName } from '$lib/teams/view'
  import TeamEmblem from './TeamEmblem.svelte'

  let teams = $state<Team[]>([])
  const invites = $derived($me?.teamInvites ?? [])

  // Again when an invite comes or goes (joining one adds a team)
  let seenInvites: string | undefined
  $effect(() => {
    const ids = invites.map(i => i.id).join()
    if (ids === seenInvites) return
    seenInvites = ids
    void loadTeams().then(r => {
      if (r) teams = r.teams
    })
  })
</script>

{#if teams.length > 0 || invites.length > 0}
  <section class="card flex flex-col gap-1 p-5" aria-labelledby="your-teams">
    <div class="flex items-baseline justify-between">
      <h3 id="your-teams" class="text-body-lg font-semibold">Your teams</h3>
      <a href={hrefs.tournaments('teams')} class="text-small font-semibold no-underline">Manage ›</a>
    </div>
    {#each teams as team (team.id)}
      <div class="flex items-center gap-3 border-t border-surface-paused py-2.5">
        <TeamEmblem tag={team.tag} color={team.color} size={32} />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-label font-semibold">{team.name}</span>
          <span class="text-small text-text-muted">
            {team.captainUserId === $currentUser?.id ? 'Captain · ' : ''}{plural(team.members.length, 'player')}
          </span>
        </span>
        <FaceStack
          faces={team.members.map(m => ({ userId: m.user.id, name: m.user.name, guest: false, avatar: m.user.avatar }))}
          size={22}
        />
      </div>
    {/each}
    {#each invites as invite (invite.id)}
      <div class="mt-1 flex items-center gap-2.5 rounded-md border border-checkout-line bg-card-active px-3 py-2.5 text-small">
        <Users size={16} class="shrink-0 text-accent" aria-hidden="true" />
        <span class="flex-1">{inviterName(invite)} invited you to <b>{invite.team.name}</b></span>
        <a href={hrefs.tournaments('teams')} class="font-semibold no-underline">View</a>
      </div>
    {/each}
  </section>
{/if}
