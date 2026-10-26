<script lang="ts">
  // Where someone plays: their board, or manual entry. A bot plays neither, so it shows its
  // level instead (X01's calibrated average; just the level in every other game). Yellow
  // while the board is offline.
  import { Bot, Keyboard, Monitor } from '@lucide/svelte'
  import { botLevelLabel } from '$shared/botLevels.js'
  import type { LobbyPerson } from '$lib/api/lobby-ws'

  let { person, gameId }: { person: LobbyPerson; gameId?: string } = $props()
  const offline = $derived(person.boardId !== null && !person.boardOnline)
</script>

<span class="inline-flex items-center gap-1 min-w-0 {offline ? 'text-warn' : ''}" title={offline ? 'Board offline' : undefined}>
  {#if person.bot}
    <Bot size={14} class="shrink-0" />
    <span class="truncate">{botLevelLabel(person.bot.level, gameId)}</span>
  {:else}
    {#if person.boardId === null}<Keyboard size={14} class="shrink-0" />{:else}<Monitor size={14} class="shrink-0" />{/if}
    <span class="truncate">{person.boardName ?? 'Manual entry'}</span>
  {/if}
</span>
