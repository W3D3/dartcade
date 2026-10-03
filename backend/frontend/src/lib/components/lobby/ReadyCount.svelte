<script lang="ts">
  // "3 of 4 ready · <suffix>": who plays the next game and how many of them are ready.
  import type { Lobby } from '$lib/api/lobby-ws'
  import { counts } from '$lib/lobby/rules'

  let { lobby, suffix }: { lobby: Lobby; suffix: string } = $props()
  const c = $derived(counts(lobby))
</script>

<strong class="text-text">{c.ready} of {c.playing}</strong> <span class="text-text-muted">ready · {suffix}</span>
