<script lang="ts">
  // Solo: the lobby page shows this next to the people list - the code, the link and the QR
  // code - so playing alone stays one tap from playing with friends. (Close, Leave and the
  // history stay hidden while solo; the people list has the add field.)
  import type { Lobby } from '$lib/api/lobby-ws'
  import JoinCodeCard from './JoinCodeCard.svelte'

  let { lobby, onnewcode }: { lobby: Lobby; onnewcode: () => void } = $props()
</script>

<section aria-label="Invite friends"
  class="flex flex-col gap-[14px] md:gap-[18px] p-4 md:p-5 rounded-[14px] bg-surface-panel border border-line-2">
  <h2 class="m-0 text-[15px] md:text-[17px] font-semibold">Invite friends</h2>
  <JoinCodeCard code={lobby.code} name={lobby.name} host {onnewcode} />
</section>
