<script lang="ts">
  // "Your lobby closed after N minutes without activity": pushed on /ws/me when the server closed it for idleness
  import { Toast } from '$lib/components/ui/toast/index.js'
  import { me } from '$lib/lobby/sockets'

  const idleClosed = me.idleClosed
  let dismissed = $state<unknown>(null)
</script>

{#if $idleClosed && dismissed !== $idleClosed}
  <Toast onclose={() => (dismissed = $idleClosed)}>Your lobby closed after {$idleClosed.minutes} minutes without activity.</Toast>
{/if}
