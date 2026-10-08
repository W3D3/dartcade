<script lang="ts">
  // Where someone plays: their board, or manual entry. A bot plays neither, so it shows its
  // calibrated average instead. Yellow while the board is offline.
  import { Bot, Keyboard, Monitor } from '@lucide/svelte'
  import { averageForLevel } from '$shared/botLevels.js'
  import type { LobbyPerson } from '$lib/api/lobby-ws'

  let { person }: { person: LobbyPerson } = $props()
  const offline = $derived(person.boardId !== null && !person.boardOnline)
</script>

<span class="inline-flex items-center gap-1 min-w-0 {offline ? 'text-warn' : ''}" title={offline ? 'Board offline' : undefined}>
  {#if person.bot}
    <Bot size={14} class="shrink-0" />
    <span class="truncate">{averageForLevel(person.bot.level)} avg</span>
  {:else}
    {#if person.boardId === null}<Keyboard size={14} class="shrink-0" />{:else}<Monitor size={14} class="shrink-0" />{/if}
    <span class="truncate">{person.boardName ?? 'Manual entry'}</span>
  {/if}
</span>
