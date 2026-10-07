<script lang="ts">
  // Where someone stands for the next game, read-only: sits out, ready, or not ready. Without
  // `showReady` (a solo lobby, where ready means nothing) only sitting out shows.
  import type { LobbyPerson } from '$lib/api/lobby-ws'
  import { Badge } from '$lib/components/ui/badge/index.js'

  let { person, showReady = true }: { person: LobbyPerson; showReady?: boolean } = $props()
</script>

{#if !person.plays}<Badge variant="sits-out">Sits out</Badge>
{:else if showReady && person.ready}<Badge variant="ready">Ready</Badge>
{:else if showReady}<Badge variant="not-ready">Not ready</Badge>{/if}
