<script lang="ts">
  // Where someone plays: their board, or manual entry. Yellow while the board is offline.
  import { Keyboard, Monitor } from '@lucide/svelte'
  import type { LobbyPerson } from '$lib/api/lobby-ws'

  let { person }: { person: LobbyPerson } = $props()
  const offline = $derived(person.boardId !== null && !person.boardOnline)
</script>

<span class="inline-flex items-center gap-1 min-w-0 {offline ? 'text-warn' : ''}" title={offline ? 'Board offline' : undefined}>
  {#if person.boardId === null}<Keyboard size={14} class="shrink-0" />{:else}<Monitor size={14} class="shrink-0" />{/if}
  <span class="truncate">{person.boardName ?? 'Manual entry'}</span>
</span>
