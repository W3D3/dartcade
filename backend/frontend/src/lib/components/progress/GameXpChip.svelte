<script lang="ts">
  // The XP chip for one game: waits for what the game paid you (xp.gained, or the API after a reload).
  import { createGameGain } from '$lib/progress/store'
  import XpChip from './XpChip.svelte'

  let { sessionId }: { sessionId: string } = $props()
  // svelte-ignore state_referenced_locally (a win screen shows one game)
  const gain = createGameGain(sessionId)
</script>

{#if $gain}<XpChip gain={$gain} />{/if}
