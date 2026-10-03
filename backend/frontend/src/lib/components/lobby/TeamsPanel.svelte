<script lang="ts">
  // The next game's teams: Team A and Team B, each the people who play, in lobby order.
  // Who's in or sitting out stays on the lobby's people list — this panel only arranges who
  // plays into teams. The host (editable) taps a player to move them to the other team, or
  // reshuffles everyone; a member only sees where they land.
  import { ArrowLeftRight, Shuffle } from '@lucide/svelte'
  import type { Lobby, LobbyPerson, TeamId } from '$lib/api/lobby-ws'
  import { Button } from '$lib/components/ui/button/index.js'
  import Avatar from './Avatar.svelte'
  import { teamRosters, teamsMessage } from '$lib/lobby/rules'

  let { lobby, editable, onmove, onshuffle }: {
    lobby: Lobby
    editable: boolean
    onmove?: (personId: string, team: TeamId) => void
    onshuffle?: () => void
  } = $props()

  const other = (team: TeamId): TeamId => (team === 'A' ? 'B' : 'A')
  const rosters = $derived(teamRosters(lobby))
  const message = $derived(teamsMessage(rosters.a.length, rosters.b.length))
</script>

{#snippet column(team: TeamId, people: LobbyPerson[])}
  <div role="group" aria-label="Team {team}"
    class="box-border p-3 rounded-[12px] bg-surface-row border border-line-2 flex flex-col gap-2 min-w-0">
    <span class="inline-flex items-center self-start h-[26px] px-[10px] rounded-[7px] font-display font-bold
                 text-[16px] tracking-[0.06em] uppercase
                 {team === 'A' ? 'bg-accent text-accent-fg' : 'border-2 border-text text-text'}">
      Team {team}
    </span>
    {#each people as p (p.id)}
      <div class="flex items-center gap-[10px] min-h-12 pl-2 pr-1 rounded-[9px] bg-surface-paused">
        <Avatar name={p.name} guest={p.userId === null} size={30} />
        <span class="flex flex-col gap-px min-w-0 flex-grow">
          <span class="text-[14px] font-semibold truncate">{p.name}</span>
          <span class="text-[12px] text-text-muted truncate">{p.boardName ?? 'Manual entry'}</span>
        </span>
        {#if editable}
          <button type="button" aria-label="Move {p.name} to Team {other(team)}" title="Move to Team {other(team)}"
            class="w-10 h-10 shrink-0 flex items-center justify-center rounded-[8px] border-0 bg-transparent
                   text-text-muted cursor-pointer"
            onclick={() => onmove?.(p.id, other(team))}>
            <ArrowLeftRight size={18} strokeWidth={2} />
          </button>
        {/if}
      </div>
    {/each}
  </div>
{/snippet}

<div class="flex flex-col gap-2">
  <span class="flex items-center justify-between gap-2">
    <span class="text-[13px] md:text-[14px] font-medium text-ink-soft">Teams</span>
    {#if editable}
      <Button variant="outline" size="sm" onclick={() => onshuffle?.()}>
        <Shuffle size={15} strokeWidth={2.2} />Shuffle
      </Button>
    {/if}
  </span>
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-[10px]">
    {@render column('A', rosters.a)}
    {@render column('B', rosters.b)}
  </div>
  {#if message}<span role="status" class="text-[13px] text-warn">{message}</span>{/if}
</div>
