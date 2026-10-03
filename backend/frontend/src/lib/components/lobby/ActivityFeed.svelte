<script lang="ts">
  // The lobby history, newest first: who joined and left, board moves, the games played.
  import { Crown, DoorOpen, Target, Trophy, UserMinus, UserPlus, X } from '@lucide/svelte'
  import type { LobbyActivity } from '$lib/api/lobby-ws'
  import Panel from './Panel.svelte'
  import { activityLine, feedTime } from '$lib/lobby/format'

  let { activity, viewerId, since }: { activity: LobbyActivity[]; viewerId: string | null; since: string } = $props()
</script>

<Panel title="Lobby history">
  {#snippet note()}Newest first · open since {feedTime(since)}{/snippet}
  <ol class="m-0 p-0 list-none flex flex-col min-h-0 overflow-y-auto">
    {#each activity as a (a.id)}
      {@const game = a.kind === 'game_played'}
      <li class="grid grid-cols-[46px_28px_minmax(0,1fr)] items-center gap-[10px] min-h-10 border-b border-surface-paused last:border-b-0">
        <span class="font-mono text-[12px] text-text-dim">{feedTime(a.at)}</span>
        <span class="w-7 h-7 rounded-full flex items-center justify-center {game ? 'bg-accent-tint text-accent' : 'bg-surface-paused text-text-muted'}">
          {#if game}<Trophy size={14} />
          {:else if a.kind === 'game_aborted'}<X size={14} />
          {:else if a.kind === 'joined' || a.kind === 'guest_added'}<UserPlus size={14} />
          {:else if a.kind === 'left' || a.kind === 'removed'}<UserMinus size={14} />
          {:else if a.kind === 'board_moved'}<Target size={14} />
          {:else if a.kind === 'host_changed'}<Crown size={14} />
          {:else}<DoorOpen size={14} />{/if}
        </span>
        <span class="text-[14px] leading-[1.35] text-ink-2">
          {#each activityLine(a, viewerId) as part, i (i)}{#if part.bold}<strong class="text-text font-semibold">{part.text}</strong>{:else}{part.text}{/if}{/each}
        </span>
      </li>
    {:else}
      <li class="py-2 text-[14px] text-text-muted">Nothing yet.</li>
    {/each}
  </ol>
</Panel>
