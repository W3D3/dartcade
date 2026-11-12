<script lang="ts">
  // Your tournament needs you (/ws/me): its check-in opened (Check in, right here), the average limit
  // took your spot, or your match's game started ("Your match is on", Play opens it). Only where
  // tournaments are on.
  import { onDestroy } from 'svelte'
  import { get } from 'svelte/store'
  import Toast from '$lib/components/ui/toast/toast.svelte'
  import type { TournamentCheckInMessage, TournamentDroppedMessage, TournamentMatchMessage } from '$lib/api/lobby-ws'
  import { flag } from '$lib/flags'
  import { me } from '$lib/lobby/sockets'
  import { hrefs } from '$lib/routes'
  import { createToast } from '$lib/toast'
  import { droppedLine } from '$lib/tournaments/avgLimit'
  import { checkIn } from '$lib/tournaments/browse'

  const on = flag('tournaments.enabled')
  // Long enough to read and act on: a check-in window is minutes long, a no-show wait ten
  const toast = createToast<TournamentCheckInMessage | TournamentDroppedMessage | TournamentMatchMessage>(60_000)
  let error = $state('')
  // Only what arrives from now on: the last message from before isn't news
  const seen = get(me.tournament)
  onDestroy(
    me.tournament.subscribe(m => {
      if (m && m !== seen && get(on)) {
        error = ''
        toast.show(m)
      }
    }),
  )

  async function act(m: TournamentCheckInMessage | TournamentMatchMessage) {
    if (m.type === 'tournament.match') {
      toast.dismiss()
      window.location.hash = hrefs.session(m.sessionId)
      return
    }
    const res = await checkIn(m.tournamentId)
    if ('error' in res) error = res.error
    else toast.dismiss()
  }
</script>

{#if $toast}
  {@const m = $toast.value}
  <Toast
    tone={error || m.type === 'tournament.dropped' ? 'error' : 'success'}
    actionLabel={m.type === 'tournament.dropped' ? undefined : m.type === 'tournament.match' ? 'Play' : 'Check in'}
    onaction={m.type === 'tournament.dropped' ? undefined : () => act(m)}
    onclose={toast.dismiss}
  >
    {#if error}
      {error}
    {:else if m.type === 'tournament.dropped'}
      You lost your spot in <b class="text-text">{m.tournamentName}</b>: {droppedLine(m.reason, m.average)}.
    {:else if m.type === 'tournament.match'}
      Your match is on: <b class="text-text">{m.tournamentName}</b> vs <b class="text-text">{m.opponent}</b>
    {:else}
      Check-in is open for <b class="text-text">{m.tournamentName}</b>
    {/if}
  </Toast>
{/if}
