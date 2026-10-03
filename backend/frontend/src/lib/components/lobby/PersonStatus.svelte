<script lang="ts">
  // Where someone stands for the next game, read-only: sits out, ready, or not ready.
  import type { LobbyPerson } from '$lib/api/lobby-ws'
  import { Badge } from '$lib/components/ui/badge/index.js'

  let { person }: { person: LobbyPerson } = $props()
</script>

{#if !person.plays}<Badge variant="sits-out">Sits out</Badge>
{:else if person.ready}<Badge variant="ready">Ready</Badge>
{:else}<Badge variant="not-ready">Not ready</Badge>{/if}
