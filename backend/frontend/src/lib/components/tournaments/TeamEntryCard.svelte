<script lang="ts">
  // Your team in a tournament: for the captain while it is incomplete "Waiting on Lena for ..."
  // with Change player and Remind (Tournaments-Teams' waiting card, Tournaments-Mine's row); for a
  // picked player I'm in / Can't make it. With `roster`, every place and who confirmed (Details).
  import { Check, Clock } from '@lucide/svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import TeamEmblem from '$lib/components/teams/TeamEmblem.svelte'
  import { Button } from '$lib/components/ui/button'
  import { currentUser } from '$lib/auth'
  import { joinNames } from '$lib/fmt'
  import { answerRequest, waitingCard, waitingNames, type TeamEntry } from '$lib/tournaments/roster'
  import RosterActions from './RosterActions.svelte'

  let {
    tournamentId,
    tournamentName,
    entry,
    roster = false,
    onchanged,
  }: { tournamentId: string; tournamentName: string; entry: TeamEntry; roster?: boolean; onchanged: () => void } = $props()

  const myId = $derived($currentUser?.id ?? '')
  const captain = $derived(entry.captainId === myId)
  const card = $derived(captain ? waitingCard(entry, tournamentName) : null)
  const waiting = $derived(waitingNames(entry))
  const mine = $derived(entry.slots.find(s => s.user?.id === myId))
  const toAnswer = $derived(mine !== undefined && !mine.confirmed && entry.status === 'pending')
  let busy = $state(false)
  let error = $state('')

  async function answer(accept: boolean) {
    busy = true
    error = (await answerRequest(tournamentId, accept)) ?? ''
    busy = false
    if (!error) onchanged()
  }
</script>

<section
  aria-label="{entry.team?.name ?? 'Your team'} in {tournamentName}"
  class="flex flex-col gap-3 rounded-popover border px-5 py-4 {entry.status === 'pending'
    ? 'border-checkout-line bg-card-active'
    : 'border-line-2 bg-surface-row'}"
>
  <div class="flex flex-wrap items-center gap-4">
    {#if entry.team}<TeamEmblem tag={entry.team.tag} color={entry.team.color} size={46} />{/if}
    <span class="flex min-w-[200px] flex-1 flex-col gap-[3px]">
      {#if card}
        <b class="text-body-lg">{card.title}</b>
        <span class="text-small text-text-muted">{card.detail}</span>
      {:else if toAnswer}
        <b class="text-body-lg">You were picked for {entry.team?.name ?? 'a team'}</b>
        <span class="text-small text-text-muted">The team’s spot is held until everyone has confirmed</span>
      {:else}
        <b class="text-body-lg">{entry.team?.name ?? 'Your team'}</b>
        <span class="flex items-center gap-1.5 text-small {entry.status === 'pending' ? 'text-text-muted' : 'text-accent'}">
          {#if entry.status === 'pending'}<Clock size={14} />Waiting for {joinNames(waiting) || 'a player'}{:else}<Check
              size={14}
            />Registered{/if}
        </span>
      {/if}
    </span>
    {#if card}
      <RosterActions {tournamentId} {entry} {onchanged} />
    {:else if toAnswer}
      <span class="flex gap-2.5">
        <Button variant="outline" size="sm" disabled={busy} onclick={() => void answer(false)}>Can’t make it</Button>
        <Button variant="accent" size="sm" disabled={busy} onclick={() => void answer(true)}><Check size={15} />I’m in</Button>
      </span>
    {/if}
  </div>

  {#if roster}
    <ul class="flex flex-col gap-1.5" aria-label="Who plays">
      {#each entry.slots as s (s.position)}
        <li class="flex items-center gap-2.5 text-label">
          {#if s.user}
            <Avatar name={s.user.name} face={null} size={26} />
            <span class="grow font-semibold">{s.user.name}{s.user.id === myId ? ' (you)' : ''}</span>
            <span class="text-small {s.confirmed ? 'text-accent' : 'text-text-muted'}">{s.confirmed ? 'Confirmed' : 'Waiting'}</span>
          {:else}
            <span class="size-[26px] rounded-full border-[1.5px] border-dashed border-line-chip"></span>
            <span class="grow text-text-muted">Open place</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if error}<ErrorText>{error}</ErrorText>{/if}
</section>
