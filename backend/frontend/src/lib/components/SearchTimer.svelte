<script lang="ts">
  // A running ranked search: the blinking dot and the time so far, on the nav item that leads to it
  // (Play in the side nav, Matchmaking in the phone menu), wherever you browse.
  import { currentUser } from '$lib/auth'
  import { me } from '$lib/lobby/sockets'
  import { queueView } from '$lib/ranked/queueCard'
  import { tick } from '$lib/now'

  const queue = $derived(queueView($me?.matchmaking ?? null, $currentUser?.id ?? null, $tick))
</script>

{#if queue?.kind === 'searching'}
  <span
    class="ml-auto inline-flex items-center gap-[6px] font-mono text-[12px] text-accent"
    role="timer"
    aria-label="Searching for {queue.clock}"
  >
    <span class="size-[6px] rounded-full bg-accent motion-safe:animate-pulse" aria-hidden="true"></span>{queue.clock}
  </span>
{/if}
