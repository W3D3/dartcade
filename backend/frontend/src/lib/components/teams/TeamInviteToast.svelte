<script lang="ts">
  // A captain just invited you to their team (team.invite on /ws/me): a toast with View, which opens
  // the Teams tab where you answer. Only where tournaments are on.
  import { onDestroy } from 'svelte'
  import { get } from 'svelte/store'
  import Toast from '$lib/components/ui/toast/toast.svelte'
  import type { TeamInvite } from '$lib/api/lobby-ws'
  import { flag } from '$lib/flags'
  import { me } from '$lib/lobby/sockets'
  import { hrefs } from '$lib/routes'
  import { inviterName } from '$lib/teams/view'
  import { createToast } from '$lib/toast'

  const on = flag('tournaments.enabled')
  const toast = createToast<TeamInvite>(8000)
  // Only what arrives from now on: the last message from before isn't news
  const seen = get(me.teamInvite)
  onDestroy(
    me.teamInvite.subscribe(m => {
      if (m && m !== seen && get(on)) toast.show(m.invite)
    }),
  )
</script>

{#if $toast}
  <Toast
    actionLabel="View"
    onaction={() => {
      toast.dismiss()
      window.location.hash = hrefs.tournaments('teams')
    }}
    onclose={toast.dismiss}
  >
    <b class="text-text">{inviterName($toast.value)}</b> invited you to join <b class="text-text">{$toast.value.team.name}</b>
  </Toast>
{/if}
