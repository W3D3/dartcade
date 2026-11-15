<script lang="ts">
  // A host just asked you to take over a guest seat (guest.claim on /ws/me): a toast with View,
  // which opens the Invites page where you answer.
  import { onDestroy } from 'svelte'
  import { get } from 'svelte/store'
  import Toast from '$lib/components/ui/toast/toast.svelte'
  import type { GuestClaimInvite } from '$lib/api/lobby-ws'
  import { me } from '$lib/lobby/sockets'
  import { hrefs } from '$lib/routes'
  import { createToast } from '$lib/toast'

  const toast = createToast<GuestClaimInvite>(8000)
  // Only what arrives from now on: the last message from before isn't news
  const seen = get(me.guestClaim)
  onDestroy(
    me.guestClaim.subscribe(m => {
      if (m && m !== seen) toast.show(m.invite)
    }),
  )
</script>

{#if $toast}
  <Toast
    actionLabel="View"
    onaction={() => {
      toast.dismiss()
      window.location.hash = hrefs.invites()
    }}
    onclose={toast.dismiss}
  >
    <b class="text-text">{$toast.value.host.name}</b> asks you to take over <b class="text-text">{$toast.value.seatName}</b> in a game
  </Toast>
{/if}
