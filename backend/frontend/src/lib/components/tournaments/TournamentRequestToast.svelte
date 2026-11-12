<script lang="ts">
  // Someone made you a tournament organizer (tournament.request on /ws/me): a toast with View, which
  // opens the tournament's setup page. Only where tournaments are on.
  import { onDestroy } from 'svelte'
  import { get } from 'svelte/store'
  import Toast from '$lib/components/ui/toast/toast.svelte'
  import type { TournamentRequestMessage } from '$lib/api/lobby-ws'
  import { flag } from '$lib/flags'
  import { me } from '$lib/lobby/sockets'
  import { hrefs } from '$lib/routes'
  import { createToast } from '$lib/toast'

  const on = flag('tournaments.enabled')
  const toast = createToast<TournamentRequestMessage>(8000)
  // Only what arrives from now on: the last message from before isn't news
  const seen = get(me.tournamentRequest)
  onDestroy(
    me.tournamentRequest.subscribe(m => {
      if (m && m !== seen && get(on)) toast.show(m)
    }),
  )
</script>

{#if $toast}
  <Toast
    actionLabel="View"
    onaction={() => {
      toast.dismiss()
      window.location.hash = hrefs.tournamentEdit($toast.value.tournamentId)
    }}
    onclose={toast.dismiss}
  >
    <b class="text-text">{$toast.value.from.name}</b> made you an organizer of <b class="text-text">{$toast.value.tournamentName}</b>
  </Toast>
{/if}
