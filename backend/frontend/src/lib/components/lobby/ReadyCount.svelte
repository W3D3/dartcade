<script lang="ts">
  // "3 of 4 ready · <suffix>": who plays the next game and how many of them are ready. While
  // the lobby is solo, ready means nothing: just "3 playing · <suffix>".
  import type { Lobby } from '$lib/api/lobby-ws'
  import { counts } from '$lib/lobby/rules'

  let { lobby, suffix }: { lobby: Lobby; suffix: string } = $props()
  const c = $derived(counts(lobby))
</script>

{#if lobby.solo}<strong class="text-text">{c.playing}</strong> <span class="text-text-muted">playing · {suffix}</span>
{:else}<strong class="text-text">{c.ready} of {c.playing}</strong> <span class="text-text-muted">ready · {suffix}</span>{/if}
