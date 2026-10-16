<script lang="ts">
  // What answering an invite says back: a refusal (with Return to game when your game is running)
  // and the leave-your-lobby-first confirm.
  import RefusalNotice from './RefusalNotice.svelte'
  import SwitchLobbyConfirm from './SwitchLobbyConfirm.svelte'
  import type { InviteActions } from '$lib/lobby/invites.svelte'
  import { me } from '$lib/lobby/sockets'

  let { actions }: { actions: InviteActions } = $props()
</script>

<RefusalNotice error={actions.error} sessionId={actions.runningSessionId} />

{#if actions.switching}
  <SwitchLobbyConfirm
    from={$me?.lobby?.name ?? 'your lobby'}
    to={actions.switching.invite.lobbyName}
    onconfirm={() => void actions.leaveAndAccept()}
    oncancel={() => (actions.switching = null)}
  />
{/if}
