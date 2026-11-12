<script lang="ts">
  // The tournament teams you were picked for (me.tournamentRequests), on top of the Tournaments
  // page: who picked you for which team, by when to answer, and Answer, which opens the confirm card.
  import { Button } from '$lib/components/ui/button'
  import TeamEmblem from '$lib/components/teams/TeamEmblem.svelte'
  import type { TournamentTeamRequest } from '$lib/api/lobby-ws'
  import { me } from '$lib/lobby/sockets'
  import { shortWhen } from '$lib/tournaments/roster'
  import ConfirmTeamDialog from './ConfirmTeamDialog.svelte'

  let { onanswered }: { onanswered?: () => void } = $props()
  let open = $state<TournamentTeamRequest | null>(null)
</script>

{#each $me?.tournamentRequests ?? [] as r (r.tournamentId)}
  <section
    aria-label="Team request for {r.tournamentName}"
    class="flex flex-wrap items-center gap-4 rounded-popover border border-checkout-line bg-card-active px-5 py-4"
  >
    <TeamEmblem tag={r.team.tag} color={r.team.color} size={46} />
    <span class="flex min-w-[200px] flex-1 flex-col gap-[3px]">
      <span class="text-body-lg"
        ><b>{r.from?.name ?? 'Your captain'}</b> picked you to play for <b>{r.team.name}</b> in <b>{r.tournamentName}</b></span
      >
      <span class="text-small text-text-muted">
        {r.confirmBy ? `Confirm by ${shortWhen(r.confirmBy)}` : 'Confirm before an organizer starts it'} · the team’s spot is held until then
      </span>
    </span>
    <Button variant="accent" size="sm" onclick={() => (open = r)}>Answer</Button>
  </section>
{/each}

{#if open}
  <ConfirmTeamDialog
    request={open}
    onclose={() => (open = null)}
    onanswered={() => {
      open = null
      onanswered?.()
    }}
  />
{/if}
